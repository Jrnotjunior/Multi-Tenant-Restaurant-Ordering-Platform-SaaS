import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type TrackingStatus = {
  order_number: number;
  order_status: string;
  payment_status: string;
  order_type: string;
  updated_at: string;
};

export function CustomerOrderTracking({ trackingToken }: { trackingToken: string | null }) {
  const [status, setStatus] = useState<TrackingStatus | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!trackingToken || !supabase) return;
    let active = true;
    let debounceTimer: number | undefined;
    const refresh = async () => {
      const { data, error } = await supabase!.rpc('track_customer_order', { p_tracking_token: trackingToken });
      if (!active) return;
      if (error) { setMessage('Reconnecting to live updates…'); return; }
      const result = data as { found?: boolean; order_number?: number; order_status?: string; payment_status?: string; order_type?: string; updated_at?: string } | null;
      if (!result?.found || !result.order_status || !result.payment_status || !result.updated_at) {
        setMessage('Order tracking is not available for this link. Contact the restaurant if you need help.');
        return;
      }
      setStatus({
        order_number: Number(result.order_number),
        order_status: result.order_status,
        payment_status: result.payment_status,
        order_type: result.order_type ?? 'order',
        updated_at: result.updated_at,
      });
      setMessage('');
    };
    void refresh();
    const channel = supabase.channel('order-tracking:' + trackingToken)
      .on('broadcast', { event: 'order_changed' }, () => {
        if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => { void refresh(); }, 100);
      })
      .subscribe((channelStatus) => { if (channelStatus === 'SUBSCRIBED') void refresh(); });
    const fallbackTimer = window.setInterval(() => { void refresh(); }, 30000);
    return () => {
      active = false;
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      window.clearInterval(fallbackTimer);
      void supabase?.removeChannel(channel);
    };
  }, [trackingToken]);

  if (!trackingToken) return <section className="panel"><p>We don’t have a tracking token on this return link. If you already placed an order, check the original checkout page or contact the restaurant before placing another order.</p></section>;

  const steps = ['pending_confirmation','confirmed','preparing','ready_for_dispatch','out_for_delivery','delivered'];
  const terminal = status && ['rejected','cancelled'].includes(status.order_status);
  const current = status ? steps.indexOf(status.order_status) : -1;

  return <section className="sf-order-tracking" aria-live="polite" aria-label="Live order tracking">
    <span className="sf-section-kicker">LIVE ORDER TRACKING</span>
    <h2>Order #{status?.order_number ?? '…'}</h2>
    {status ? <>
      <p className="sf-order-tracking-status">{status.order_status.replaceAll('_', ' ')}</p>
      <p className="sf-order-tracking-payment">Payment: {status.payment_status.replaceAll('_', ' ')} · {status.order_type.replaceAll('_', ' ')}</p>
      <ol className="sf-order-tracking-steps">
        {steps.map((step, index) => <li key={step} className={current >= index && !terminal ? 'is-complete' : ''}>
          <span>{index + 1}</span><small>{step.replaceAll('_', ' ')}</small>
        </li>)}
      </ol>
      {terminal && <p className="sf-checkout-page-message">This order was {status.order_status}. Please contact the restaurant for assistance.</p>}
      <p className="sf-order-tracking-updated">Last updated {new Date(status.updated_at).toLocaleTimeString()}</p>
    </> : <p>Connecting to live order updates…</p>}
    {message && <p role="status">{message}</p>}
    <p className="sf-order-tracking-note">This page updates automatically when the restaurant changes your order or payment status.</p>
  </section>;
}
