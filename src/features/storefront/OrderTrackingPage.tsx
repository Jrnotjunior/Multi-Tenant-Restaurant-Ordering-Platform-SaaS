import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './storefront.css';

type TrackedStatus = { order_status: string; payment_status: string; updated_at: string };

export function OrderTrackingPage({ restaurantSlug, onBackToMenu }: { restaurantSlug: string; onBackToMenu: () => void }) {
  const [trackingToken] = useState<string | null>(() => {
    try { return window.sessionStorage.getItem('web2table:latest-order-tracking'); } catch { return null; }
  });
  const [orderNumber, setOrderNumber] = useState<number | null>(() => {
    try { const value = window.sessionStorage.getItem('web2table:latest-order-number'); return value ? Number(value) : null; } catch { return null; }
  });
  const [status, setStatus] = useState<TrackedStatus | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!trackingToken || !supabase) return;
    let active = true;
    let refreshTimer: number | undefined;
    const refresh = async () => {
      const { data, error: rpcError } = await supabase!.rpc('track_customer_order', { p_tracking_token: trackingToken });
      if (!active) return;
      if (rpcError) { setError('Live tracking is reconnecting. We will keep trying.'); return; }
      const result = data as { found?: boolean; order_number?: number; order_status?: string; payment_status?: string; updated_at?: string } | null;
      if (!result?.found || !result.order_status || !result.payment_status || !result.updated_at) {
        setError('We could not find this order. Keep your tracking link and contact the restaurant if needed.');
        return;
      }
      setError('');
      setOrderNumber(Number(result.order_number));
      setStatus({ order_status: result.order_status, payment_status: result.payment_status, updated_at: result.updated_at });
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

  const stages = ['pending_confirmation', 'confirmed', 'preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered'];
  const current = status ? stages.indexOf(status.order_status) : -1;
  const terminal = status ? ['rejected', 'cancelled'].includes(status.order_status) : false;

  return <main className="sf-checkout-page sf-order-tracking-page">
    <div className="sf-checkout-page-intro"><span className="sf-section-kicker">ORDER TRACKING</span><h1>Track your order</h1><p>Follow your order progress and payment status. Updates refresh automatically.</p></div>
    {trackingToken ? <section className="sf-order-tracking sf-order-tracking-dedicated" aria-live="polite" aria-label="Live order tracking">
      <span className="sf-section-kicker">LIVE ORDER TRACKING</span><h2>Order #{orderNumber ?? '…'}</h2>
      {status ? <><p className="sf-order-tracking-status">{status.order_status.replaceAll('_', ' ')}</p><p className="sf-order-tracking-payment">Payment: {status.payment_status.replaceAll('_', ' ')}</p>
        <ol className="sf-order-tracking-steps">{stages.map((stage, index) => <li key={stage} className={current >= index && !terminal ? 'is-complete' : ''}><span>{index + 1}</span><small>{stage.replaceAll('_', ' ')}</small></li>)}</ol>
        <p className="sf-order-tracking-updated">Last updated {new Date(status.updated_at).toLocaleTimeString()}</p>
      </> : <p>Connecting to live order updates…</p>}
      {error && <p className="sf-checkout-page-message" role="status">{error}</p>}
      <p className="sf-order-tracking-note">This page refreshes order status automatically.</p>
      <button type="button" className="sf-continue" onClick={onBackToMenu}>Back to restaurant</button>
    </section> : <p className="sf-checkout-page-notice">No recent order was found on this browser. Open the tracking link saved when your order was placed.</p>}
  </main>;
}
