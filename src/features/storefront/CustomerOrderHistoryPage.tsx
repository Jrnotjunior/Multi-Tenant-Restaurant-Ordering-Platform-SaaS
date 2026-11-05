import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase } from '../../app/routes';
import { CustomerAccountBackLink, StorefrontFooter } from './StorefrontChrome';
import './storefront.css';
import { useCustomerStorefrontTheme } from './useCustomerStorefrontTheme';
import { CustomerAccountLoading } from './CustomerAccountLoading';

type HistoryItem = { name: string; quantity: number; total_centavos: number };
type HistoryOrder = {
  order_id: string; tracking_token: string; order_number: number; restaurant_name: string; restaurant_slug: string;
  order_type: string; order_status: string; payment_status: string; payment_method?: string;
  refund_status?: 'pending' | 'refunded' | 'failed' | null; created_at: string;
  subtotal_centavos: number; delivery_fee_centavos: number | null; total_centavos: number | null;
  items: HistoryItem[];
};
const titleCaseLabel = (value: string | null | undefined) => (value ?? '').replaceAll('_', ' ').trim().replace(/\b\p{L}/gu, character => character.toLocaleUpperCase());
const peso = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100);

export function CustomerOrderHistoryPage({ baseUrl }: { baseUrl: string }) {
  const { style: storefrontTheme, fontClass, isLoading: themeLoading, logoUrl, restaurantName, restaurantInitials } = useCustomerStorefrontTheme();
  const [orders, setOrders] = useState<HistoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [cancellingOrderId, setCancellingOrderId] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<HistoryOrder | null>(null);
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
  if (themeLoading) return <CustomerAccountLoading />;
  return <div className={"sf-storefront sf-account-page sf-account-shell"+fontClass} style={storefrontTheme}>
    <header className="sf-header">
      <div className="sf-header-inner">
        <a href={base} className="sf-logo sf-account-brand" aria-label={(restaurantName ?? "Restaurant") + " storefront"}>
          {logoUrl ? <img className="sf-logo-image" src={logoUrl} alt={(restaurantName ?? "Restaurant") + " logo"} width={46} height={46} /> : <span className="sf-logo-mark">{restaurantInitials ?? "R"}</span>}
        </a>
      </div>
    </header>
    <main className="sf-order-tracking-page">
    <section className="sf-tracking-receipt" aria-live="polite">
      <CustomerAccountBackLink href={base + '#/account'} />
      <span className="sf-tracking-eyebrow">YOUR ACCOUNT</span>
      <h1>Order history</h1>
      <p>Your orders are saved to your Web2Table account and loaded from the database.</p>
      {message && <p role="status">{message} <a href={base + '#/account/sign-in'}>Sign in</a></p>}
      {loading && <p role="status">Loading your orders…</p>}
      {!loading && !message && orders.length === 0 && <p>You haven’t placed any orders while signed in yet.</p>}
      {orders.map(order => <button type="button" className="sf-order-history-row" key={order.order_id} onClick={() => setSelectedOrder(order)} aria-label={`View details for order number ${String(order.order_number).padStart(5, '0')}`}>
        <span className="sf-order-history-row-number">Order #{String(order.order_number).padStart(5, '0')}</span>
        <span className="sf-order-history-row-date">{new Date(order.created_at).toLocaleString()}</span>
        <span className="sf-order-history-row-chevron" aria-hidden="true">›</span>
      </button>)}
      {selectedOrder && <div className="sf-order-history-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !cancellingOrderId) setSelectedOrder(null); }}>
        <section className="sf-order-history-modal" role="dialog" aria-modal="true" aria-labelledby="sf-order-history-modal-title">
          <header className="sf-order-history-modal-header">
            <div><span className="sf-tracking-eyebrow">{selectedOrder.restaurant_name}</span><h2 id="sf-order-history-modal-title">Order #{String(selectedOrder.order_number).padStart(5, '0')}</h2><p>{new Date(selectedOrder.created_at).toLocaleString()} · {titleCaseLabel(selectedOrder.order_type)}</p></div>
            <button type="button" className="sf-order-history-modal-close" aria-label="Close order details" onClick={() => setSelectedOrder(null)}>×</button>
          </header>
          <div className="sf-order-history-modal-content">
            <p>Status: <strong>{titleCaseLabel(selectedOrder.order_status)}</strong></p>
            <p>Payment: {titleCaseLabel(selectedOrder.payment_method || 'cash')} · {titleCaseLabel(selectedOrder.payment_status)}{selectedOrder.refund_status && <> · Refund: {titleCaseLabel(selectedOrder.refund_status)}</>}</p>
            <div className="sf-order-history-items"><h3>Items</h3>{selectedOrder.items?.map((item, index) => <p key={selectedOrder.order_id + item.name + index}>{item.quantity} × {item.name} <strong>{peso(item.total_centavos)}</strong></p>)}</div>
            <div className="sf-order-history-totals"><p>Subtotal <strong>{peso(selectedOrder.subtotal_centavos)}</strong></p>{selectedOrder.delivery_fee_centavos != null && <p>Delivery fee <strong>{peso(selectedOrder.delivery_fee_centavos)}</strong></p>}{selectedOrder.total_centavos != null && <p className="sf-order-history-grand-total">Total <strong>{peso(selectedOrder.total_centavos)}</strong></p>}</div>
          </div>
          {selectedOrder.order_status === 'pending_confirmation' && <footer className="sf-order-history-modal-actions"><button type="button" className="sf-tracking-cancel-start" disabled={Boolean(cancellingOrderId)} onClick={() => void cancelOrder(selectedOrder)}>{cancellingOrderId === selectedOrder.order_id ? 'Cancelling…' : 'Cancel order'}</button></footer>}
        </section>
      </div>}
    </section>
    </main>
    <StorefrontFooter />
  </div>;
}
