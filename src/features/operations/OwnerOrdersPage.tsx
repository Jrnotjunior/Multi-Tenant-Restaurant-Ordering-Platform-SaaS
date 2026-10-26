import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Props = {
  tenantId: string;
  filter: 'active' | 'all';
  onFilterChange: (filter: 'active' | 'all') => void;
};
type OrderItem = {
  id: string;
  item_name: string;
  quantity: number;
  unit_price_centavos: number;
  line_total_centavos: number;
  options: { id?: string; name?: string; group_name?: string }[];
};
type CustomerOrder = {
  id: string;
  order_number: number;
  branch_id: string;
  branch_name: string;
  customer_name: string;
  customer_phone: string;
  order_type: 'delivery' | 'take_out' | 'pickup' | 'dine_in';
  delivery_address: string | null;
  delivery_notes: string;
  subtotal_centavos: number;
  delivery_fee_centavos: number | null;
  total_centavos: number | null;
  order_status: string;
  payment_status: string;
  created_at: string;
  items: OrderItem[];
};
type OrdersResult = { orders?: CustomerOrder[] };

const peso = (centavos: number | null) => centavos == null
  ? 'Awaiting confirmation'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);
const dateTime = (value: string) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));
const statusLabel = (value: string) => value.replaceAll('_', ' ');
const nextActions: Record<string, { action: string; label: string }[]> = {
  pending_confirmation: [{ action: 'confirm', label: 'Confirm order' }, { action: 'reject', label: 'Reject' }],
  confirmed: [{ action: 'start_preparing', label: 'Start preparing' }, { action: 'cancel', label: 'Cancel' }],
  preparing: [{ action: 'mark_ready', label: 'Mark ready' }],
  ready_for_dispatch: [{ action: 'dispatch', label: 'Dispatch' }],
  out_for_delivery: [{ action: 'deliver', label: 'Mark delivered' }],
};

export function OwnerOrdersPage({ tenantId, filter, onFilterChange }: Props) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [acceptingOrders, setAcceptingOrders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState('');
  const [busyAcceptance, setBusyAcceptance] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deliveryFees, setDeliveryFees] = useState<Record<string, string>>({});

  const load = useCallback(async (quiet = false) => {
    if (!supabase) {
      setError('Restaurant order services are not configured.');
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [ordersResponse, storefrontResponse] = await Promise.all([
        supabase.rpc('list_customer_orders', { p_tenant_id: tenantId, p_filter: filter, p_limit: 100 }),
        supabase.from('tenant_storefronts').select('accepting_orders').eq('tenant_id', tenantId).maybeSingle(),
      ]);
      if (ordersResponse.error) throw ordersResponse.error;
      if (storefrontResponse.error) throw storefrontResponse.error;
      setOrders(((ordersResponse.data as OrdersResult | null)?.orders ?? []) as CustomerOrder[]);
      setAcceptingOrders(Boolean(storefrontResponse.data?.accepting_orders));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load restaurant orders.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [tenantId, filter]);

  useEffect(() => {
    void load();
    if (!supabase) return;

    let refreshTimer: number | undefined;
    const channel = supabase
      .channel('tenant:' + tenantId, { config: { private: true } })
      .on('broadcast', { event: 'db_change' }, () => {
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { void load(true); }, 100);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load(true);
      });

    // Periodic reconciliation is a safety net, not the primary update mechanism.
    const reconciliationTimer = window.setInterval(() => { void load(true); }, 60000);
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.clearInterval(reconciliationTimer);
      void supabase?.removeChannel(channel);
    };
  }, [load, tenantId]);

  async function transition(order: CustomerOrder, action: string, label: string) {
    if (!supabase) return;
    setBusyOrder(order.id);
    setError('');
    setMessage('');
    try {
      const { error: actionError } = await supabase.rpc('transition_customer_order', {
        p_tenant_id: tenantId,
        p_order_id: order.id,
        p_action: action,
      });
      if (actionError) throw actionError;
      setMessage(`Order #${order.order_number}: ${label.toLowerCase()}.`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update this order.');
    } finally {
      setBusyOrder('');
    }
  }


  async function saveDeliveryFee(order: CustomerOrder) {
    if (!supabase) return;
    const raw = (deliveryFees[order.id] ?? (order.delivery_fee_centavos == null ? '' : (order.delivery_fee_centavos / 100).toFixed(2))).trim();
    if (!/^\\d{1,8}(?:\\.\\d{1,2})?$/.test(raw)) {
      setError('Enter a valid delivery fee, such as 50 or 50.00.');
      return;
    }
    const feeCentavos = Math.round(Number(raw) * 100);
    if (!Number.isSafeInteger(feeCentavos) || feeCentavos < 0 || feeCentavos > 1000000000) {
      setError('Delivery fee must be between ₱0.00 and ₱10,000,000.00.');
      return;
    }
    setBusyOrder(order.id);
    setError('');
    setMessage('');
    try {
      const { error: actionError } = await supabase.rpc('set_customer_order_delivery_fee', {
        p_tenant_id: tenantId,
        p_order_id: order.id,
        p_delivery_fee_centavos: feeCentavos,
      });
      if (actionError) throw actionError;
      setMessage('Delivery fee saved for order #' + order.order_number + '.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save delivery fee.');
    } finally {
      setBusyOrder('');
    }
  }

  async function refundOrder(order: CustomerOrder) {
    if (!supabase) return;
    const confirmed = window.confirm(`Request a full refund for order #${order.order_number}? This contacts PayMongo and cannot be treated as a simple status change.`);
    if (!confirmed) return;
    setBusyOrder(order.id);
    setError('');
    setMessage('');
    try {
      const { data, error: refundError } = await supabase.functions.invoke('refund-customer-order', {
        body: { tenantId, orderId: order.id, reason: 'requested_by_customer' },
      });
      if (refundError) throw refundError;
      const result = data as { success?: boolean; status?: string; message?: string; error?: string } | null;
      if (result?.error) throw new Error(result.error);
      if (result?.status === 'refunded') {
        setMessage(`Order #${order.order_number} was refunded successfully.`);
      } else {
        setMessage(result?.message || `Refund request for order #${order.order_number} is pending PayMongo confirmation.`);
      }
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to request a refund.');
    } finally {
      setBusyOrder('');
    }
  }

  async function toggleAcceptance() {
    if (!supabase) return;
    setBusyAcceptance(true);
    setError('');
    setMessage('');
    try {
      const nextValue = !acceptingOrders;
      const { data, error: actionError } = await supabase.rpc('set_tenant_order_acceptance', {
        p_tenant_id: tenantId,
        p_accepting: nextValue,
      });
      if (actionError) throw actionError;
      setAcceptingOrders(Boolean((data as { accepting_orders?: boolean } | null)?.accepting_orders ?? nextValue));
      setMessage(nextValue ? 'New order requests are enabled.' : 'New order requests are paused.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update order acceptance.');
    } finally {
      setBusyAcceptance(false);
    }
  }

  const count = (statuses: string[]) => orders.filter(order => statuses.includes(order.order_status)).length;

  return <main className="owner-content owner-orders-page">
    <div className="owner-orders-toolbar">
      <div>
        <h1>Orders</h1>
        <p>Review incoming requests and move accepted orders through fulfillment.</p>
      </div>
      <div className="owner-orders-toolbar-actions">
        <span className={'owner-orders-acceptance ' + (acceptingOrders ? 'is-open' : 'is-paused')}>
          {acceptingOrders ? 'Accepting orders' : 'Orders paused'}
        </span>
        <button type="button" disabled={busyAcceptance} onClick={() => void toggleAcceptance()}>
          {busyAcceptance ? 'Saving…' : acceptingOrders ? 'Pause orders' : 'Accept orders'}
        </button>
        <button type="button" className="owner-orders-refresh" disabled={loading} onClick={() => void load()}>Refresh</button>
      </div>
    </div>

    <nav className="owner-order-tabs" aria-label="Order filter">
      <button className={filter === 'active' ? 'active' : ''} onClick={() => onFilterChange('active')}>Active</button>
      <button className={filter === 'all' ? 'active' : ''} onClick={() => onFilterChange('all')}>All orders</button>
    </nav>

    <section className="owner-order-stats">
      <article><div><h2>New Orders</h2><p>Waiting for review</p></div><span>{count(['pending_confirmation'])}</span></article>
      <article><div><h2>In the Kitchen</h2><p>Being prepared</p></div><span>{count(['confirmed', 'preparing'])}</span></article>
      <article><div><h2>Ready / Delivery</h2><p>Ready or on the way</p></div><span>{count(['ready_for_dispatch', 'out_for_delivery'])}</span></article>
      <article><div><h2>Completed</h2><p>Delivered orders</p></div><span>{count(['delivered'])}</span></article>
    </section>

    {(error || message) && <p className={'owner-orders-notice ' + (error ? 'is-error' : 'is-success')} role={error ? 'alert' : 'status'}>{error || message}</p>}

    <section className="owner-orders-list" aria-live="polite">
      <div className="owner-orders-list-heading"><h2>{filter === 'active' ? 'Active orders' : 'All orders'}</h2><span>{orders.length} shown</span></div>
      {loading ? <p className="owner-orders-empty">Loading orders…</p> : orders.length === 0 ? (
        <div className="owner-orders-empty"><h3>{filter === 'active' ? 'No active orders yet' : 'No orders yet'}</h3>
          <p>New order requests will appear here after checkout is connected and the restaurant is accepting orders.</p>
        </div>
      ) : orders.map(order => <article className="owner-order-card" key={order.id}>
        <header className="owner-order-card-header">
          <div><h3>Order #{order.order_number}</h3><p>{dateTime(order.created_at)} · {order.branch_name} · {({delivery:'Delivery',take_out:'Take-out',pickup:'Pickup',dine_in:'Dine-in'} as const)[order.order_type] ?? 'Delivery'}</p></div>
          <span className={'owner-order-status status-' + order.order_status}>{statusLabel(order.order_status)}</span>
        </header>
        <div className="owner-order-customer">
          <strong>{order.customer_name}</strong><span>{order.customer_phone}</span>
          {order.order_type === 'delivery' && order.delivery_address && <p>{order.delivery_address}</p>}
          {order.delivery_notes && <p className="owner-order-notes">Note: {order.delivery_notes}</p>}
        </div>
        <ul className="owner-order-items">{(order.items ?? []).map(item => <li key={item.id}>
          <span>{item.quantity} × {item.item_name}{item.options?.length ? <small>{item.options.map(option => option.name).filter(Boolean).join(', ')}</small> : null}</span>
          <strong>{peso(item.line_total_centavos)}</strong>
        </li>)}</ul>

        {order.order_type === 'delivery' && order.order_status === 'pending_confirmation' && order.payment_status === 'not_started' ? <div className="owner-order-delivery-fee">
          <label htmlFor={'delivery-fee-' + order.id}>Delivery fee (PHP)</label>
          <div>
            <input
              id={'delivery-fee-' + order.id}
              type="number"
              min="0"
              max="10000000"
              step="0.01"
              inputMode="decimal"
              placeholder="e.g. 50.00"
              value={deliveryFees[order.id] ?? (order.delivery_fee_centavos == null ? '' : (order.delivery_fee_centavos / 100).toFixed(2))}
              onChange={event => setDeliveryFees(current => ({ ...current, [order.id]: event.target.value }))}
              aria-label={'Delivery fee for order ' + order.order_number + ' in pesos'}
            />
            <button type="button" disabled={busyOrder === order.id} onClick={() => void saveDeliveryFee(order)}>
              {busyOrder === order.id ? 'Saving…' : 'Save fee'}
            </button>
          </div>
          <small>Set the final delivery fee before confirming this order.</small>
        </div> : null}
        <div className="owner-order-totals">
          <span>Subtotal <strong>{peso(order.subtotal_centavos)}</strong></span>
          <span>{order.order_type === 'delivery' ? 'Delivery fee' : 'Fulfillment fee'} <strong>{peso(order.delivery_fee_centavos)}</strong></span>
          <span>Total <strong>{peso(order.total_centavos)}</strong></span>
          <span className={'owner-order-payment-status payment-' + order.payment_status}>
            Payment <strong>{order.payment_status === 'paid' ? 'Payment successful' : order.payment_status === 'failed' ? 'Payment failed' : order.payment_status === 'refunded' ? 'Refund successful' : statusLabel(order.payment_status)}</strong>
          </span>
        </div>
        {order.payment_status === 'paid' ? <div className="owner-order-actions">
          <button type="button" className="is-danger" disabled={busyOrder === order.id}
            onClick={() => void refundOrder(order)}>
            {busyOrder === order.id ? 'Processing…' : 'Issue full refund'}
          </button>
        </div> : null}
        {nextActions[order.order_status]?.length ? <footer className="owner-order-actions">
          {nextActions[order.order_status].map(action => <button type="button" key={action.action}
            className={action.action === 'reject' || action.action === 'cancel' ? 'is-danger' : ''}
            disabled={busyOrder === order.id}
            onClick={() => void transition(order, action.action, action.label)}>
            {busyOrder === order.id ? 'Saving…' : action.label}
          </button>)}
        </footer> : null}
      </article>)}
    </section>
  </main>;
}
