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
  payment_channel?: 'online' | 'other'; payment_method?: 'cash' | 'online';
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
  // Incoming order decisions belong to the cashier workspace, not the owner dashboard.
  pending_confirmation: [],
  confirmed: [{ action: 'start_preparing', label: 'Start preparing' }, { action: 'cancel', label: 'Cancel' }],
  preparing: [{ action: 'mark_ready', label: 'Mark ready' }],
  ready_for_dispatch: [{ action: 'dispatch', label: 'Dispatch' }],
  out_for_delivery: [{ action: 'deliver', label: 'Mark delivered' }],
};

export function OwnerOrdersPage({ tenantId, filter, onFilterChange }: Props) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyOrder, setBusyOrder] = useState('');
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
      const ordersResponse = await supabase.rpc('list_customer_orders', { p_tenant_id: tenantId, p_filter: filter, p_limit: 100 });
      if (ordersResponse.error) throw ordersResponse.error;
      setOrders(((ordersResponse.data as OrdersResult | null)?.orders ?? []) as CustomerOrder[]);
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

  const count = (statuses: string[]) => orders.filter(order => statuses.includes(order.order_status)).length;

  return <main className="owner-content owner-orders-page">
    <div className="owner-orders-toolbar">
      <div>
        <h1>Orders</h1>
        <p>Review incoming requests and move accepted orders through fulfillment.</p>
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

    <section className="owner-orders-list owner-orders-monitoring-note">
      <p>Order processing is managed in the cashier workspace. Use the summary above to monitor order status.</p>
    </section>
  </main>;
}
