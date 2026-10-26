import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './storefront.css';

const peso = (centavos: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(centavos / 100);

type TrackedItem = { name: string; quantity: number; total_centavos: number; unit_price_centavos?: number; options?: unknown[] };
type TrackedStatus = { order_status: string; payment_status: string; order_type?: string; updated_at: string; items?: TrackedItem[]; subtotal_centavos?: number; delivery_fee_centavos?: number | null; total_centavos?: number | null };

export function OrderTrackingPage({ onBackToMenu }: { onBackToMenu: () => void }) {
  const [trackingToken] = useState<string | null>(() => {
    try { return window.sessionStorage.getItem('web2table:latest-order-tracking'); } catch { return null; }
  });
  const [orderNumber, setOrderNumber] = useState<number | null>(() => {
    try { const value = window.sessionStorage.getItem('web2table:latest-order-number'); return value ? Number(value) : null; } catch { return null; }
  });
  const [status, setStatus] = useState<TrackedStatus | null>(null);
  const [error, setError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [orderMeta] = useState(() => {
    try {
      const raw = window.sessionStorage.getItem('web2table:latest-order-details')
        || window.localStorage.getItem('web2table:latest-order-details')
        || '{}';
      const parsed = JSON.parse(raw) as { paymentMethod?: string; lines?: { name: string; quantity: number; totalCentavos: number }[] };
      return { ...parsed, lines: Array.isArray(parsed.lines) ? parsed.lines : [] };
    } catch { return { lines: [] as { name: string; quantity: number; totalCentavos: number }[] }; }
  });

  useEffect(() => {
    if (!trackingToken || !supabase) return;
    let active = true;
    let refreshTimer: number | undefined;
    const refresh = async () => {
      const { data, error: rpcError } = await supabase!.rpc('track_customer_order', { p_tracking_token: trackingToken });
      if (!active) return;
      if (rpcError) { setError('Live tracking is reconnecting. We will keep trying.'); return; }
      const result = data as { found?: boolean; order_number?: number; order_status?: string; payment_status?: string; order_type?: string; updated_at?: string; items?: TrackedItem[]; subtotal_centavos?: number; delivery_fee_centavos?: number | null; total_centavos?: number | null } | null;
      if (!result?.found || !result.order_status || !result.payment_status || !result.updated_at) {
        setError('We could not find this order. Keep your tracking link and contact the restaurant if needed.');
        return;
      }
      setError('');
      setOrderNumber(Number(result.order_number));
      setStatus({ order_status: result.order_status, payment_status: result.payment_status, order_type: result.order_type, updated_at: result.updated_at, items: result.items ?? [], subtotal_centavos: result.subtotal_centavos, delivery_fee_centavos: result.delivery_fee_centavos, total_centavos: result.total_centavos });
    };
    void refresh();
    const channel = supabase.channel('order-tracking-page:' + trackingToken)
      .on('broadcast', { event: 'order_changed' }, () => {
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { void refresh(); }, 100);
      })
      .subscribe((state) => { if (state === 'SUBSCRIBED') void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 30000);
    return () => { active = false; if (refreshTimer !== undefined) window.clearTimeout(refreshTimer); window.clearInterval(interval); void supabase?.removeChannel(channel); };
  }, [trackingToken]);

  const orderType = status?.order_type?.toLowerCase().replaceAll('_', '-') ?? 'dine-in';
  const dineIn = ['dine-in', 'dinein'].includes(orderType);
  const stages = dineIn
    ? ['pending_confirmation', 'confirmed', 'preparing', 'ready_for_serve', 'served']
    : ['pending_confirmation', 'confirmed', 'preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered'];
  const labels = dineIn
    ? ['Order Received', 'Confirmed', 'Preparing', 'Ready to serve', 'Served']
    : ['Order Received', 'Confirmed', 'Preparing', 'Ready for dispatch', 'Out for delivery', 'Delivered'];
  const descriptions = dineIn
    ? ['Your order has been received by the restaurant.', 'The restaurant has confirmed your order.', 'The kitchen is preparing your food.', 'Your food is ready. Restaurant staff will bring it to your table.', 'Your order has been served. Thank you!']
    : ['Your order has been received by the restaurant.', 'The restaurant has confirmed your order.', 'The kitchen is preparing your food.', 'Ready.', 'Your order is on its way to you.', 'Your order has been delivered. Thank you!'];
  const current = status ? stages.indexOf(status.order_status) : -1;
  const terminal = status ? ['rejected', 'cancelled'].includes(status.order_status) : false;
  const currentStage = current < 0 ? (terminal ? (status?.order_status ?? 'unknown').replaceAll('_', ' ') : 'Order Received') : labels[current];
  const orderNumText = orderNumber ? String(orderNumber).padStart(5, '0') : '…';
  const orderTypeLabel = dineIn ? 'Dine-in' : orderType.replaceAll('-', ' ').replace(/\\b\\w/g, x => x.toUpperCase());

  return <main className="sf-order-tracking-page">
    {trackingToken && status ? <section className="sf-tracking-receipt" aria-live="polite" aria-label="Live order tracking">
      <header className="sf-tracking-order-heading">
        <span className="sf-tracking-eyebrow">{dineIn ? 'DINE-IN · TELL THE CASHIER' : orderTypeLabel.toUpperCase()}</span>
        <h1>ORD-{orderNumText}</h1>
        <p>{dineIn ? 'Give this order number to the cashier to help them find your order.' : 'Your order status updates automatically.'}</p>
      </header>
      <section className="sf-tracking-details">
        <div><span className="sf-tracking-eyebrow">YOUR ORDER</span><h2>Order details</h2></div>
        <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>{detailsOpen ? 'Hide details' : 'View details'} <span aria-hidden="true">{detailsOpen ? '⌃' : '⌄'}</span></button>
      </section>
      {detailsOpen && <div className="sf-tracking-order-lines">
        {status.items?.length ? status.items.map((line, index) => <div key={line.name + index}><span>{line.quantity} × {line.name}</span><strong>{peso(line.total_centavos)}</strong></div>) : <p>Order items are not available for this order.</p>}{status.subtotal_centavos != null && <p><span>Subtotal</span><strong>{peso(status.subtotal_centavos)}</strong></p>}{status.delivery_fee_centavos != null && <p><span>Delivery fee</span><strong>{peso(status.delivery_fee_centavos)}</strong></p>}{status.total_centavos != null && <p><span>Total</span><strong>{peso(status.total_centavos)}</strong></p>}
        <p><span>Payment</span><strong>{orderMeta.paymentMethod === 'online' ? 'Online payment' : orderMeta.paymentMethod === 'cash' ? 'Cash' : status.payment_status.replaceAll('_', ' ')}</strong></p>
      </div>}
      <ol className="sf-tracking-timeline">{stages.map((stage, index) => {
        const done = current >= index && !terminal;
        const active = current === index && !terminal;
        return <li key={stage} className={done ? 'is-complete' : ''}>
          <span className="sf-tracking-timeline-marker">{done ? '✓' : index + 1}</span>
          <div><h3>{labels[index]}</h3><p>{descriptions[index]}</p>{active && <span className="sf-tracking-current">Current status</span>}</div>
        </li>;
      })}</ol>
      {terminal && <p className="sf-tracking-error" role="status">This order was {currentStage.toLowerCase()}. Please contact the restaurant if you need assistance.</p>}
      {error && <p className="sf-tracking-error" role="status">{error}</p>}
      <footer className="sf-tracking-footer"><span>{orderTypeLabel}</span><span>{status.payment_status.replaceAll('_', ' ')}</span></footer>
    </section> : trackingToken ? <section className="sf-tracking-receipt"><p>{error || 'Connecting to your order…'}</p></section> : <section className="sf-tracking-receipt"><p>No recent order was found in this browser. Place an order first, then use Track Order.</p><button type="button" className="sf-tracking-back" onClick={onBackToMenu}>Back to restaurant</button></section>}
  </main>;
}
