import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadOwnerDataForTenant } from '../management/menuService';
import type { OwnerPage } from './ownerWorkspaceConfig';
import { ownerPageTitles } from './ownerWorkspaceConfig';

type Props = { page: OwnerPage; tenantId: string; restaurantName: string | null; onNavigate: (page: OwnerPage) => void };
type Order = {
  id: string; order_number: number; order_type: string; customer_name: string;
  subtotal_centavos: number; total_centavos: number | null; order_status: string;
  payment_status: string; created_at: string;
};
type StaffDirectory = { staff?: { user_id: string; status: string }[] };
type DashboardData = { orders: Order[]; menuItems: number; teamMembers: number; timezone: string };
type OrdersResponse = { orders?: Order[] };

const peso = (centavos: number) => new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', maximumFractionDigits: 0,
}).format(centavos / 100);
const excludedStatuses = new Set(['rejected', 'cancelled']);
const settledStatuses = new Set(['delivered', 'completed']);
const pretty = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());

function businessDate(value: Date, timezone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function OrdersChart({ orders, timezone }: { orders: Order[]; timezone: string }) {
  const bars = useMemo(() => {
    const today = new Date();
    const dateKeys = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(today);
      day.setDate(day.getDate() - (6 - index));
      return businessDate(day, timezone);
    });
    const values = new Map(dateKeys.map(key => [key, 0]));
    orders.forEach(order => {
      if (order.payment_status !== 'paid' || excludedStatuses.has(order.order_status)) return;
      const key = businessDate(new Date(order.created_at), timezone);
      if (values.has(key)) values.set(key, (values.get(key) ?? 0) + Number(order.subtotal_centavos || 0));
    });
    const max = Math.max(...values.values(), 1);
    return dateKeys.map(key => ({
      key,
      label: new Intl.DateTimeFormat('en-PH', { timeZone: timezone, weekday: 'short' }).format(new Date(`${key}T12:00:00`)),
      amount: values.get(key) ?? 0,
      height: Math.max(4, Math.round(((values.get(key) ?? 0) / max) * 100)),
    }));
  }, [orders, timezone]);
  const total = bars.reduce((sum, bar) => sum + bar.amount, 0);

  return <section className="owner-dashboard-panel owner-dashboard-trend" aria-labelledby="owner-dashboard-trend-title">
    <div className="owner-dashboard-panel-heading"><div><p className="owner-dashboard-kicker">PAID SALES</p><h2 id="owner-dashboard-trend-title">Last 7 days</h2></div><strong>{peso(total)}</strong></div>
    <div className="owner-dashboard-chart" role="img" aria-label={'Paid sales over the last seven days, ' + peso(total) + ' total'}>
      {bars.map((bar, index) => <div className="owner-dashboard-chart-day" key={bar.key}>
        <div className="owner-dashboard-bar-track"><span className={index === bars.length - 1 ? 'is-today' : ''} style={{ height: `${bar.height}%` }} title={peso(bar.amount)} /></div>
        <small>{bar.label}</small>
      </div>)}
    </div>
  </section>;
}

function OperationsDashboard({ tenantId, restaurantName, onNavigate }: Pick<Props, 'tenantId' | 'restaurantName' | 'onNavigate'>) {
  const [data, setData] = useState<DashboardData>({ orders: [], menuItems: 0, teamMembers: 0, timezone: 'Asia/Manila' });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!supabase) {
      setError('Restaurant dashboard services are not configured.');
      setLoading(false);
      return;
    }
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const [ordersResponse, staffResponse, menuResponse, branchResponse] = await Promise.all([
        supabase.rpc('list_staff_orders', { p_tenant_id: tenantId, p_filter: 'all', p_limit: 100 }),
        supabase.rpc('list_tenant_staff', { p_tenant_id: tenantId }),
        loadOwnerDataForTenant(tenantId),
        supabase.from('branches').select('timezone').eq('tenant_id', tenantId).eq('is_active', true).order('name').limit(1).maybeSingle(),
      ]);
      if (ordersResponse.error) throw ordersResponse.error;
      if (staffResponse.error) throw staffResponse.error;
      if (branchResponse.error) throw branchResponse.error;
      const orderRows = ((ordersResponse.data as OrdersResponse | null)?.orders ?? []) as Order[];
      const staff = (staffResponse.data ?? {}) as StaffDirectory;
      setData({
        orders: orderRows,
        menuItems: menuResponse.items.filter(item => item.status !== 'archived').length,
        teamMembers: (staff.staff ?? []).filter(member => member.status === 'active').length,
        timezone: branchResponse.data?.timezone || 'Asia/Manila',
      });
      setUpdatedAt(new Date());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load the restaurant overview.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const today = businessDate(new Date(), data.timezone);
  const todayOrders = data.orders.filter(order => businessDate(new Date(order.created_at), data.timezone) === today);
  const paidToday = todayOrders.filter(order => order.payment_status === 'paid' && !excludedStatuses.has(order.order_status));
  const salesToday = paidToday.reduce((sum, order) => sum + Number(order.subtotal_centavos || 0), 0);
  const openOrders = data.orders.filter(order => !settledStatuses.has(order.order_status) && !excludedStatuses.has(order.order_status));
  const recentOrders = data.orders.slice(0, 6);

  return <main className="owner-content owner-dashboard">

    {error && <div className="owner-dashboard-alert" role="alert"><span>{error}</span><button type="button" onClick={() => void load()}>Try again</button></div>}

    <section className="owner-dashboard-stats" aria-label="Today's summary">
      <article><div className="owner-dashboard-stat-icon">▤</div><p>Orders today</p><strong>{loading ? '—' : todayOrders.length}</strong><small>Received today</small></article>
      <article><div className="owner-dashboard-stat-icon is-green">₱</div><p>Paid sales today</p><strong>{loading ? '—' : peso(salesToday)}</strong><small>{paidToday.length} paid {paidToday.length === 1 ? 'order' : 'orders'} · excludes delivery fees</small></article>
      <article><div className="owner-dashboard-stat-icon is-amber">◷</div><p>Open orders</p><strong>{loading ? '—' : openOrders.length}</strong><small>Still being fulfilled</small></article>
      <article><div className="owner-dashboard-stat-icon is-blue">♙</div><p>Team members</p><strong>{loading ? '—' : data.teamMembers}</strong><small>{data.menuItems} active menu {data.menuItems === 1 ? 'item' : 'items'}</small></article>
    </section>

    <p className="owner-dashboard-data-note">{data.orders.length >= 100 ? 'Order figures use the 100 most recent orders available.' : `Order figures use all ${data.orders.length} orders currently available.`}{updatedAt && ` Updated ${new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' }).format(updatedAt)}.`}</p>

    <div className="owner-dashboard-main-grid">
      <OrdersChart orders={data.orders} timezone={data.timezone} />
      <section className="owner-dashboard-panel owner-dashboard-shortcuts" aria-labelledby="owner-dashboard-shortcuts-title">
        <div className="owner-dashboard-panel-heading"><div><p className="owner-dashboard-kicker">GET THINGS DONE</p><h2 id="owner-dashboard-shortcuts-title">Quick access</h2></div></div>
        <button type="button" onClick={() => onNavigate('orders')}><span className="owner-dashboard-shortcut-icon">▤</span><span><strong>View orders</strong><small>Monitor fulfillment and payments</small></span><b aria-hidden="true">›</b></button>
        <button type="button" onClick={() => onNavigate('menu')}><span className="owner-dashboard-shortcut-icon">☷</span><span><strong>Manage menu</strong><small>Update dishes, prices, and availability</small></span><b aria-hidden="true">›</b></button>
        <button type="button" onClick={() => onNavigate('employees')}><span className="owner-dashboard-shortcut-icon">♙</span><span><strong>Manage team</strong><small>Invite staff and review access</small></span><b aria-hidden="true">›</b></button>
      </section>
    </div>

    <section className="owner-dashboard-panel owner-dashboard-recent" aria-labelledby="owner-dashboard-recent-title">
      <div className="owner-dashboard-panel-heading"><div><p className="owner-dashboard-kicker">LATEST ACTIVITY</p><h2 id="owner-dashboard-recent-title">Recent orders</h2></div>
        <button type="button" className="owner-dashboard-link" onClick={() => onNavigate('orders')}>View all orders <span aria-hidden="true">→</span></button>
      </div>
      {loading ? <p className="owner-dashboard-empty">Loading recent orders…</p> : recentOrders.length === 0 ? <div className="owner-dashboard-empty"><span className="owner-dashboard-empty-icon">▤</span><strong>No orders yet</strong><p>New customer orders will show up here.</p><button type="button" onClick={() => onNavigate('menu')}>Review your menu</button></div> :
        <div className="owner-dashboard-orders-wrap"><table className="owner-dashboard-orders"><thead><tr><th>Order</th><th>Customer</th><th>Type</th><th>Status</th><th>Payment</th><th className="is-right">Total</th></tr></thead><tbody>
          {recentOrders.map(order => <tr key={order.id}>
            <td><strong>#{order.order_number}</strong><small>{new Intl.DateTimeFormat('en-PH', { timeZone: data.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at))}</small></td>
            <td>{order.customer_name}</td><td>{pretty(order.order_type)}</td>
            <td><span className={'owner-dashboard-badge status-' + order.order_status}>{pretty(order.order_status)}</span></td>
            <td><span className={'owner-dashboard-badge payment-' + order.payment_status}>{pretty(order.payment_status)}</span></td>
            <td className="is-right">{order.total_centavos == null ? '—' : peso(order.total_centavos)}</td>
          </tr>)}
        </tbody></table></div>}
    </section>
  </main>;
}

export function OwnerSectionPage({ page, tenantId, restaurantName, onNavigate }: Props) {
  if (page === 'dashboard') return <OperationsDashboard tenantId={tenantId} restaurantName={restaurantName} onNavigate={onNavigate} />;

  return <main className="owner-content"><section className="owner-orders-empty">
    <h1>{ownerPageTitles[page]}</h1>
    <p>This section is not yet connected to its tenant- and branch-scoped service. It will remain unavailable rather than showing fabricated records.</p>
    {page === 'employees' && <button onClick={() => onNavigate('settings')}>Open store settings</button>}
  </section></main>;
}
