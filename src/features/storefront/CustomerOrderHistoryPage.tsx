import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase } from '../../app/routes';
import { CustomerAccountBackLink, StorefrontFooter } from './StorefrontChrome';
import './storefront.css';

type HistoryItem = { name: string; quantity: number; total_centavos: number };
type HistoryOrder = {
  order_id: string; tracking_token: string; order_number: number; restaurant_name: string; restaurant_slug: string;
  order_type: string; order_status: string; payment_status: string; payment_method?: string;
  refund_status?: 'pending' | 'refunded' | 'failed' | null; created_at: string;
  subtotal_centavos: number; delivery_fee_centavos: number | null; total_centavos: number | null;
  items: HistoryItem[];
};
const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100);

export function CustomerOrderHistoryPage({ baseUrl }: { baseUrl: string }) {
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState('');
  useEffect(() => {
    let active = true;
    if (!supabase) { setMessage('Account services are not configured.'); setLoading(false); return; }
    void (async () => {
      const { data: sessionData, error: sessionError } = await supabase!.auth.getSession();
      if (!active) return;
      if (sessionError || !sessionData.session) {
        setMessage('Sign in to view orders placed with your account.');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase!.rpc('customer_order_history');
      if (!active) return;
      if (error) setMessage('We could not load your order history. Please try again.');
      else setOrders(Array.isArray(data) ? data as HistoryOrder[] : []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  async function cancelOrder(order: HistoryOrder) {
    if (!supabase || order.order_status !== 'pending_confirmation' || cancellingOrderId) return;
    if (!window.confirm(`Cancel order #${order.order_number} before the restaurant confirms it?`)) return;
    setCancellingOrderId(order.order_id);
    setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('cancel-customer-order', {
        body: { trackingToken: order.tracking_token },
      });
      if (error) {
        const context = (error as { context?: unknown }).context;
        const response = context instanceof Response ? context : null;
        const payload = response ? await response.clone().json().catch(() => null) : null;
        throw new Error(payload?.error || error.message || 'Unable to cancel this order.');
      }
      if (!(data as { success?: boolean } | null)?.success) {
        throw new Error((data as { error?: string } | null)?.error || 'Unable to cancel this order.');
      }
      const result = data as { refundStatus?: HistoryOrder['refund_status'] } | null;
      setOrders(current => current.map(item => item.order_id === order.order_id ? {
        ...item,
        order_status: 'cancelled',
        refund_status: result?.refundStatus ?? null,
        payment_status: result?.refundStatus === 'refunded' ? 'refunded' : item.payment_status,
      } : item));
      setMessage(result?.refundStatus === 'pending'
        ? `Order #${order.order_number} was cancelled. PayMongo is processing the refund.`
        : result?.refundStatus === 'refunded'
          ? `Order #${order.order_number} was cancelled and refunded.`
          : result?.refundStatus === 'failed'
            ? `Order #${order.order_number} was cancelled, but PayMongo could not process the refund automatically. Please contact the restaurant for help.`
            : `Order #${order.order_number} was cancelled.`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Unable to cancel this order. Please try again.');
    } finally {
      setCancellingOrderId('');
    }
  }
  const base = normalizeAppBase(baseUrl);
  return <div className="sf-storefront sf-account-shell">
    <header className="sf-header">
      <div className="sf-header-inner">
        <a href={base} className="sf-logo sf-account-brand" aria-label="Web2Table storefront">
          <img className="sf-logo-image" src="https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png" alt="Web2Table" width={46} height={46} />
          <span>Web2Table</span>
        </a>
      </div>
    </header>
    <main className="sf-order-tracking-page">
    <section className="sf-tracking-receipt" aria-live="polite">
      <CustomerAccountBackLink href={base + 'account'} />
      <span className="sf-tracking-eyebrow">YOUR ACCOUNT</span>
      <h1>Order history</h1>
      <p>Your orders are saved to your Web2Table account and loaded from the database.</p>
      {loading && <p>Loading your orders…</p>}
      {message && <p role="status">{message} <a href={base + 'account/sign-in'}>Sign in</a></p>}
      {!loading && !message && orders.length === 0 && <p>You haven’t placed any orders while signed in yet.</p>}
      {orders.map(order => <article className="sf-tracking-details" key={order.order_id}>
        <div>
          <span className="sf-tracking-eyebrow">{order.restaurant_name}</span>
          <h2>Order #{String(order.order_number).padStart(5, '0')}</h2>
          <p>{new Date(order.created_at).toLocaleString()} · {order.order_type.replaceAll('_', ' ')}</p>
          <p>Status: <strong>{order.order_status.replaceAll('_', ' ')}</strong> · Payment: {order.payment_method === 'online' ? 'Online' : order.payment_method ?? 'Cash'} · {order.payment_status.replaceAll('_', ' ')}{order.refund_status && <> · Refund: {order.refund_status}</>}</p>
          {order.items?.map((item, index) => <p key={order.order_id + item.name + index}>{item.quantity} × {item.name} — {peso(item.total_centavos)}</p>)}
          <p>Subtotal: {peso(order.subtotal_centavos)}</p>
          {order.delivery_fee_centavos != null && <p>Delivery fee: {peso(order.delivery_fee_centavos)}</p>}
          {order.total_centavos != null && <p><strong>Total: {peso(order.total_centavos)}</strong></p>}
        </div>
        <div className="sf-order-history-actions">
          <a href={base + 'order/' + encodeURIComponent(order.restaurant_slug) + '#track'}>Open restaurant</a>
          {order.order_status === 'pending_confirmation' && <button type="button" className="sf-tracking-cancel-start" disabled={Boolean(cancellingOrderId)} onClick={() => void cancelOrder(order)}>{cancellingOrderId === order.order_id ? 'Cancelling…' : 'Cancel order'}</button>}
        </div>
      </article>)}
    </section>
    </main>
    <StorefrontFooter />
  </div>;
}
