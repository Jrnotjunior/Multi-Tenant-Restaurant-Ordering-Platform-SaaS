import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './storefront.css';

const peso = (centavos: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(centavos / 100);

type TrackedItem = { name: string; quantity: number; total_centavos: number; unit_price_centavos?: number; options?: unknown[] };
type TrackedStatus = { order_status: string; assignment_status?: string | null; rider_name?: string | null; rider_phone?: string | null; payment_status: string; payment_method?: string; refund_status?: 'pending' | 'refunded' | 'failed' | null; order_type?: string; updated_at: string; items?: TrackedItem[]; subtotal_centavos?: number; delivery_fee_centavos?: number | null; total_centavos?: number | null };

export function OrderTrackingPage(props: { onBackToMenu: () => void; trackingToken?: string | null }) {
  const [storedTrackingToken] = useState<string | null>(() => {
    try { return window.sessionStorage.getItem('web2table:latest-order-tracking'); } catch { return null; }
  });
  const trackingToken = props.trackingToken === undefined ? storedTrackingToken : props.trackingToken;
  const [orderNumber, setOrderNumber] = useState<number | null>(() => {
    try { const value = window.sessionStorage.getItem('web2table:latest-order-number'); return value ? Number(value) : null; } catch { return null; }
  });
  const [status, setStatus] = useState<TrackedStatus | null>(null);
  const [error, setError] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [orderMeta] = useState(() => {
    try {
      const raw = window.sessionStorage.getItem('web2table:latest-order-details') || '{}';
      const parsed = JSON.parse(raw) as { paymentMethod?: string; lines?: { name: string; quantity: number; totalCentavos: number }[] };
      return { ...parsed, lines: Array.isArray(parsed.lines) ? parsed.lines : [] };
    } catch { return { lines: [] as { name: string; quantity: number; totalCentavos: number }[] }; }
  });

  useEffect(() => {
    if (!trackingToken || !supabase) return;
    let active = true;
    let refreshTimer: number | undefined;
    const refresh = async () => {
      // Webhooks are authoritative, but reconcile from PayMongo as a fallback so
      // a missed or rejected callback cannot leave a verified payment as unpaid.
      await supabase!.functions.invoke('reconcile-customer-order-payment', { body: { trackingToken } }).catch(() => undefined);
      if (!active) return;
      const { data, error: rpcError } = await supabase!.rpc('track_customer_order', { p_tracking_token: trackingToken });
      if (!active) return;
      if (rpcError) { setError('Live tracking is reconnecting. We will keep trying.'); return; }
      const result = data as { found?: boolean; order_number?: number; order_status?: string; assignment_status?: string | null; rider_name?: string | null; rider_phone?: string | null; payment_status?: string; payment_method?: string; refund_status?: TrackedStatus['refund_status']; order_type?: string; updated_at?: string; items?: TrackedItem[]; subtotal_centavos?: number; delivery_fee_centavos?: number | null; total_centavos?: number | null } | null;
      if (!result?.found || !result.order_status || !result.payment_status || !result.updated_at) {
        setError('We could not find this order. Keep your tracking link and contact the restaurant if needed.');
        return;
      }
      setError('');
      setOrderNumber(Number(result.order_number));
      setStatus({ order_status: result.order_status, assignment_status: result.assignment_status, rider_name: result.rider_name, rider_phone: result.rider_phone, payment_status: result.payment_status, payment_method: result.payment_method, refund_status: result.refund_status, order_type: result.order_type, updated_at: result.updated_at, items: result.items ?? [], subtotal_centavos: result.subtotal_centavos, delivery_fee_centavos: result.delivery_fee_centavos, total_centavos: result.total_centavos });
    };
    void refresh();
    const channel = supabase.channel('order-tracking:' + trackingToken)
      .on('broadcast', { event: 'order_changed' }, () => {
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { void refresh(); }, 100);
      })
      .subscribe((state) => { if (state === 'SUBSCRIBED') void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 30000);
    return () => { active = false; if (refreshTimer !== undefined) window.clearTimeout(refreshTimer); window.clearInterval(interval); void supabase?.removeChannel(channel); };
  }, [trackingToken]);

  async function cancelOrder() {
    if (!trackingToken || !supabase || status?.order_status !== 'pending_confirmation' || cancelling) return;
    setCancelling(true);
    setCancelError('');
    try {
      const { data, error: cancelFunctionError } = await supabase.functions.invoke('cancel-customer-order', {
        body: { trackingToken },
      });
      if (cancelFunctionError) {
        const context = (cancelFunctionError as { context?: unknown }).context;
        const response = context instanceof Response ? context : null;
        const payload = response ? await response.clone().json().catch(() => null) : null;
        throw new Error(payload?.error || cancelFunctionError.message || 'Unable to cancel this order.');
      }
      if (!(data as { success?: boolean } | null)?.success) {
        throw new Error((data as { error?: string } | null)?.error || 'Unable to cancel this order.');
      }
      const result = data as { refundStatus?: TrackedStatus['refund_status'] } | null;
      setStatus(current => current ? {
        ...current,
        order_status: 'cancelled',
        refund_status: result?.refundStatus ?? null,
        payment_status: result?.refundStatus === 'refunded' ? 'refunded' : current.payment_status,
        updated_at: new Date().toISOString(),
      } : current);
      setCancelConfirmationOpen(false);
    } catch (reason) {
      setCancelError(reason instanceof Error ? reason.message : 'Unable to cancel this order. Please try again.');
    } finally {
      setCancelling(false);
    }
  }

  const orderType = status?.order_type?.toLowerCase().replaceAll('_', '-') ?? 'dine-in';
  const dineIn = ['dine-in', 'dinein'].includes(orderType);
  const dineInCashOrder = dineIn && (status?.payment_method ?? orderMeta.paymentMethod) === 'cash';
  const deliveryOrder = orderType === 'delivery';
  const stages = dineIn
    ? ['pending_confirmation', 'confirmed', 'preparing', 'ready_for_serve', 'served']
    : deliveryOrder
      ? ['pending_confirmation', 'confirmed', 'preparing', 'ready_for_dispatch', 'assigned', 'out_for_delivery', 'arrived_at_customer', 'delivered']
      : ['pending_confirmation', 'confirmed', 'preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered'];
  const labels = dineIn
    ? ['Order Received', 'Confirmed', 'Preparing', 'Ready', 'Served']
    : deliveryOrder
      ? ['Order Received', 'Confirmed', 'Preparing', 'Ready', 'Assigned', 'Out for delivery', 'Arrived', 'Delivered']
      : ['Order Received', 'Confirmed', 'Preparing', 'Ready', 'Out for delivery', 'Delivered'];
  const descriptions = dineIn
    ? ['Your order has been received by the restaurant.', 'The restaurant has confirmed your order.', 'The kitchen is preparing your food.', 'Your food is ready. Restaurant staff will bring it to your table.', 'Your order has been served. Thank you!']
    : deliveryOrder
      ? ['Your order has been received by the restaurant.', 'The restaurant has confirmed your order.', 'The kitchen is preparing your food.', 'Your order is ready and waiting for dispatch.', 'A rider has been assigned to your order.', 'Your rider is on the way to you.', 'Your rider has arrived at your delivery address.', 'Your order was delivered to you. Thank you!']
      : ['Your order has been received by the restaurant.', 'The restaurant has confirmed your order.', 'The kitchen is preparing your food.', 'Your order is being prepared for pickup.', 'Your order is ready for pickup.', 'Your order has been picked up. Thank you!'];
  const assignmentStage: Record<string, number> = { assigned: 4, accepted: 4, dispatched: 4, out_for_delivery: 5, arrived_at_customer: 6, delivered: 7 };
  const current = status
    ? (deliveryOrder && status.assignment_status && assignmentStage[status.assignment_status] != null
      ? assignmentStage[status.assignment_status]
      : stages.indexOf(status.order_status))
    : -1;
  const terminal = status ? ['rejected', 'cancelled'].includes(status.order_status) : false;
  const isCancelled = status?.order_status === 'cancelled';
  const currentStage = current < 0 ? (terminal ? (status?.order_status ?? 'unknown').replaceAll('_', ' ') : 'Order Received') : labels[current];
  const assignedRider = Boolean(!isCancelled && deliveryOrder && status?.rider_name && ['assigned', 'accepted', 'dispatched', 'out_for_delivery', 'arrived_at_customer'].includes(status.assignment_status ?? ''));
  const riderPhone = status?.rider_phone?.replace(/[^+\d]/g, '') ?? '';
  const orderNumText = orderNumber ? String(orderNumber).padStart(5, '0') : '…';
  const orderTypeLabel = dineIn ? 'Dine-in' : orderType.replaceAll('-', ' ').replace(/\\b\\w/g, x => x.toUpperCase());
  const normalizedPaymentStatus = (status?.payment_status ?? '').toLowerCase();
  const isPaymentPaid = ['paid', 'succeeded', 'completed'].includes(normalizedPaymentStatus);
  const isPaymentRefunded = normalizedPaymentStatus === 'refunded';
  const paymentMethod = status?.payment_method ?? orderMeta.paymentMethod;
  const paidOnline = paymentMethod === 'online' && isPaymentPaid;
  const paymentOptionLabel = paymentMethod === 'online'
    ? 'Online payment'
    : orderMeta.paymentMethod === 'cash'
      ? (orderType === 'delivery' ? 'Cash on delivery' : 'Cash')
      : orderType === 'delivery' ? 'Cash on delivery' : 'Cash';
  const paymentStatusLabel = isPaymentRefunded
    ? 'Refunded'
    : isPaymentPaid
    ? 'Paid'
    : ['failed', 'cancelled', 'canceled', 'expired'].includes(normalizedPaymentStatus)
      ? normalizedPaymentStatus.charAt(0).toUpperCase() + normalizedPaymentStatus.slice(1)
      : 'Unpaid';
  const paymentLabel = isPaymentRefunded ? 'Refunded' : isPaymentPaid ? 'Paid' : paymentOptionLabel;
  const cancellationMessage = status?.refund_status === 'pending'
    ? 'Your order was cancelled. PayMongo is processing your refund.'
    : status?.refund_status === 'refunded'
      ? 'Your order was cancelled and the PayMongo refund is complete.'
      : status?.refund_status === 'failed'
        ? 'Your order was cancelled, but PayMongo could not process the refund automatically. Please contact the restaurant for help.'
        : 'This order has been cancelled.';

  return <main className="sf-order-tracking-page">
    {trackingToken && status ? <section className="sf-tracking-receipt" aria-live="polite" aria-label="Live order tracking">
      <header className="sf-tracking-order-heading">
        <span className="sf-tracking-eyebrow">{isCancelled ? 'ORDER CANCELLED' : dineInCashOrder ? 'DINE-IN · TELL THE CASHIER' : orderTypeLabel.toUpperCase()}</span>
        <h1>ORD-{orderNumText}</h1>
        <p>{isCancelled ? cancellationMessage : dineInCashOrder ? 'Give this order number to the cashier to help them find your order.' : 'Your order status updates automatically.'}</p>
      </header>
      {assignedRider && <section className="sf-tracking-rider" aria-label="Your delivery rider">
        <span className="sf-tracking-eyebrow">YOUR RIDER</span>
        <h2>Hi, my name is {status?.rider_name}.</h2>
        <p>I’ll be delivering your order. You can contact me here.</p>
        {riderPhone && <nav className="sf-tracking-rider-actions" aria-label="Contact your rider">
          <a href={'tel:' + riderPhone} aria-label={'Call ' + status?.rider_name}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.8 4.8 5.1c-.8.5-.9 1.6-.7 2.5 1.5 6.2 6.1 10.8 12.3 12.3.9.2 2 0 2.5-.7l1.3-2.4-4.1-2.8-2 2a14.3 14.3 0 0 1-5.8-5.8l2-2-3.1-4.4Z" /></svg>Call</a>
          <a href={'sms:' + riderPhone} aria-label={'Text ' + status?.rider_name}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.2a7.8 7.8 0 0 1-8 7.6 8.7 8.7 0 0 1-3.6-.8L4 19l1.1-3.7A7.2 7.2 0 0 1 4 11.2a7.8 7.8 0 0 1 8-7.6 7.8 7.8 0 0 1 8 7.6Z" /><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" /></svg>Text</a>
        </nav>}
      </section>}
      <section className="sf-tracking-details">
        <div><span className="sf-tracking-eyebrow">YOUR ORDER</span><h2>Order details</h2></div>
        <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>{detailsOpen ? 'Hide details' : 'View details'} <span aria-hidden="true">{detailsOpen ? '⌃' : '⌄'}</span></button>
      </section>
      {detailsOpen && <div className="sf-tracking-order-lines">
        {status.items?.length ? status.items.map((line, index) => <div key={line.name + index}><span>{line.quantity} × {line.name}</span><strong>{peso(line.total_centavos)}</strong></div>) : <p>Order items are not available for this order.</p>}
        {status.subtotal_centavos != null && <p><span>Subtotal</span><strong>{peso(status.subtotal_centavos)}</strong></p>}
        {status.delivery_fee_centavos != null && <p><span>Delivery fee</span><strong>{peso(status.delivery_fee_centavos)}</strong></p>}
        {status.total_centavos != null && <p><span>Total</span><strong>{peso(status.total_centavos)}</strong></p>}
        <p><span>Payment</span><strong>{paymentLabel}</strong></p>
        {status.order_status === 'pending_confirmation' && <section className="sf-tracking-cancel" aria-label="Cancel order">
          {cancelConfirmationOpen ? <>
            <p>{paidOnline ? 'Cancel this order? PayMongo will automatically process the refund.' : 'Cancel this order before the restaurant confirms it?'}</p>
            <div>
              <button type="button" className="sf-tracking-cancel-keep" disabled={cancelling} onClick={() => { setCancelConfirmationOpen(false); setCancelError(''); }}>Keep order</button>
              <button type="button" className="sf-tracking-cancel-confirm" disabled={cancelling} onClick={() => void cancelOrder()}>{cancelling ? 'Cancelling…' : 'Confirm cancellation'}</button>
            </div>
          </> : <button type="button" className="sf-tracking-cancel-start" onClick={() => { setCancelConfirmationOpen(true); setCancelError(''); }}>Cancel order</button>}
          {cancelError && <p className="sf-tracking-error" role="alert">{cancelError}</p>}
        </section>}
      </div>}
      {!isCancelled && <ol className="sf-tracking-timeline">{stages.map((stage, index) => {
        const done = current >= index && !terminal;
        const active = current === index && !terminal;
        return <li key={stage} className={done ? 'is-complete' : ''}>
          <span className="sf-tracking-timeline-marker">{done ? '✓' : index + 1}</span>
          <div><h3>{labels[index]}</h3><p>{descriptions[index]}</p>{active && <span className="sf-tracking-current">Current status</span>}</div>
        </li>;
      })}</ol>}
      {terminal && !isCancelled && <p className="sf-tracking-error" role="status">This order was {currentStage.toLowerCase()}. Please contact the restaurant if you need assistance.</p>}
      {error && <p className="sf-tracking-error" role="status">{error}</p>}
      <footer className="sf-tracking-footer"><span>{orderTypeLabel.charAt(0).toUpperCase() + orderTypeLabel.slice(1)}</span><span>{paymentOptionLabel.charAt(0).toUpperCase() + paymentOptionLabel.slice(1)}</span><span>{paymentStatusLabel.charAt(0).toUpperCase() + paymentStatusLabel.slice(1)}</span></footer>
    </section> : trackingToken ? <section className="sf-tracking-receipt"><p>{error || 'Connecting to your order…'}</p></section> : <section className="sf-tracking-receipt"><p>You don’t have an order to track yet. After placing an order, you can return here to follow its progress.</p></section>}
  </main>;
}
