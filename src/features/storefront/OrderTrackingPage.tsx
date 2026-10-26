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
    : ['Order Received', 'Confirmed', 'Preparing', 'Ready', 'Out for delivery', 'Delivered'];
  const descriptions = dineIn
    ? ['Your order has been received by the restaurant.', 'The restaurant has confirmed your order.', 'The kitchen is preparing your food.', 'Your food is ready. Restaurant staff will bring it to your table.', 'Your order has been served. Thank you!']
    : ['Your order has been received by the restaurant.', 'The restaurant has confirmed your order.', 'The kitchen is preparing your food.', 'Your order is being prepared for dispatch.', 'Your order is on its way to you.', 'Your order has been delivered. Thank you!'];
  const current = status ? stages.indexOf(status.order_status) : -1;
  const terminal = status ? ['rejected', 'cancelled'].includes(status.order_status) : false;
  const currentStage = current < 0 ? (terminal ? (status?.order_status ?? 'unknown').replaceAll('_', ' ') : 'Order Received') : labels[current];
  const orderNumText = orderNumber ? String(orderNumber).padStart(5, '0') : '…';
  const orderTypeLabel = dineIn ? 'Dine-in' : orderType.replaceAll('-', ' ').replace(/\\b\\w/g, x => x.toUpperCase());
  const paymentLabel = orderMeta.paymentMethod === 'online' ? 'Online payment' : orderType === 'delivery' ? 'Cash on delivery' : orderMeta.paymentMethod === 'cash' ? 'Cash' : status?.payment_status?.replaceAll('_', ' ') ?? 'Cash';

  const statusTitle = terminal
    ? `Your order was ${currentStage.toLowerCase()}.`
    : current === 0 ? 'We received your order.'
    : current === 1 ? 'Your order is confirmed.'
    : current === 2 ? 'Preparing your order…'
    : current === stages.length - 1 ? (dineIn ? 'Your order has been served!' : 'Your order has been delivered!')
    : labels[current] + ' your order…';
  const stageIcons = dineIn ? ['🧾', '✓', '🍲', '🍽️', '✓'] : ['🧾', '✓', '🍲', '🛍️', '🛵', '✓'];
  const firstItem = status.items?.[0];

  return <main className="sf-order-tracking-page">
    {trackingToken && status ? <section className="sf-tracking-receipt" aria-live="polite" aria-label="Live order tracking">
      <header className="sf-tracking-topbar">
        <button type="button" className="sf-tracking-back-icon" onClick={onBackToMenu} aria-label="Back to restaurant">‹</button>
        <span className="sf-tracking-brand">WEB2TABLE <span>·</span> ORDER TRACKING</span>
        <span className="sf-tracking-live-dot" aria-label="Live updates enabled" title="Live updates enabled" />
      </header>

      <section className="sf-tracking-status-hero">
        <span className="sf-tracking-eyebrow">{orderTypeLabel.toUpperCase()} ORDER · ORD-{orderNumText}</span>
        <h1>{statusTitle}</h1>
        <p>{terminal ? 'Please contact the restaurant if you need help with this order.' : 'We’ll update this page automatically as your order progresses.'}</p>
        <div className="sf-tracking-food-art" aria-hidden="true">{dineIn ? '🍲' : '🥡'}<span>✦</span></div>
      </section>

      <section className="sf-tracking-progress-card" aria-label="Order progress">
        <div className="sf-tracking-progress-line" aria-hidden="true">
          <span style={{ width: (current < 0 ? 0 : (current / Math.max(stages.length - 1, 1)) * 100) + '%' }} />
        </div>
        <ol className="sf-tracking-progress-steps">{stages.map((stage, index) => {
          const done = current >= index && !terminal;
          const active = current === index && !terminal;
          return <li key={stage} className={done ? 'is-complete' : active ? 'is-active' : ''}>
            <span className="sf-tracking-progress-icon">{done && index < current ? '✓' : stageIcons[index]}</span>
            <span className="sf-tracking-progress-label">{labels[index]}</span>
          </li>;
        })}</ol>
        <div className="sf-tracking-current-pill">{terminal ? currentStage : (current >= 0 ? labels[current] : 'Waiting for restaurant confirmation')}</div>
      </section>

      {error && <p className="sf-tracking-error" role="status">{error}</p>}

      <section className="sf-tracking-info-section">
        <h2>{dineIn ? 'Order details' : orderType === 'delivery' ? 'Delivery details' : 'Order details'}</h2>
        <div className="sf-tracking-info-card">
          <div className="sf-tracking-info-row"><span className="sf-tracking-info-icon" aria-hidden="true">⌖</span><div><strong>Order type</strong><p>{orderTypeLabel}</p></div></div>
          <div className="sf-tracking-info-row"><span className="sf-tracking-info-icon" aria-hidden="true">₱</span><div><strong>Payment</strong><p>{paymentLabel} · {status.payment_status.replaceAll('_', ' ')}</p></div></div>
          <div className="sf-tracking-info-row"><span className="sf-tracking-info-icon" aria-hidden="true">◷</span><div><strong>Last updated</strong><p>{new Date(status.updated_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</p></div></div>
        </div>
      </section>

      <section className="sf-tracking-summary-card">
        <div className="sf-tracking-summary-heading"><h2>Order summary</h2><span>ORD-{orderNumText}</span></div>
        {firstItem ? <div className="sf-tracking-summary-item"><div><strong>{firstItem.name}</strong><p>{firstItem.quantity > 1 ? firstItem.quantity + ' items' : 'Your order'}</p></div><strong>{peso(firstItem.total_centavos)}</strong></div> : <p className="sf-tracking-summary-empty">Your order items will appear here.</p>}
        <button type="button" className="sf-tracking-view-details" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(value => !value)}>{detailsOpen ? 'Hide details' : 'View details'} <span aria-hidden="true">{detailsOpen ? '⌃' : '›'}</span></button>
        {detailsOpen && <div className="sf-tracking-order-lines">
          {status.items?.length ? status.items.map((line, index) => <div key={line.name + index}><span>{line.quantity} × {line.name}</span><strong>{peso(line.total_centavos)}</strong></div>) : <p>Order items are not available for this order.</p>}
          {status.subtotal_centavos != null && <p><span>Subtotal</span><strong>{peso(status.subtotal_centavos)}</strong></p>}
          {status.delivery_fee_centavos != null && <p><span>Delivery fee</span><strong>{peso(status.delivery_fee_centavos)}</strong></p>}
          <p><span>Payment method</span><strong>{paymentLabel}</strong></p>
        </div>}
      </section>

      <footer className="sf-tracking-total-footer">
        <div><span>{status.payment_status === 'paid' ? 'Total paid' : 'Total due'}</span><strong>{status.total_centavos != null ? peso(status.total_centavos) : status.subtotal_centavos != null ? peso(status.subtotal_centavos + (status.delivery_fee_centavos ?? 0)) : '—'}</strong></div>
        <p>Order status and payment updates refresh automatically.</p>
        <button type="button" onClick={onBackToMenu}>Back to restaurant</button>
      </footer>
    </section> : trackingToken ? <section className="sf-tracking-receipt sf-tracking-loading"><div className="sf-tracking-loading-art" aria-hidden="true">🍲</div><h1>Getting your order status…</h1><p>{error || 'Connecting to live order updates.'}</p></section> : <section className="sf-tracking-receipt sf-tracking-loading"><div className="sf-tracking-loading-art" aria-hidden="true">🧾</div><h1>No recent order found</h1><p>Place an order first, then use Track Order.</p><button type="button" className="sf-tracking-primary-action" onClick={onBackToMenu}>Back to restaurant</button></section>}
  </main>;
}
