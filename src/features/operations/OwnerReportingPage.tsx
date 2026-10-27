import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import './OwnerReportingPage.css';

type Props = { tenantId: string; page: 'sales' | 'reports' };
type Branch = { id: string; name: string };
type ReportItem = { item_name?: string; item_name_snapshot?: string; quantity: number; line_total_centavos?: number };
type ReportOrder = {
  id: string; order_number: number; branch_id: string; branch_name?: string;
  subtotal_centavos: number; delivery_fee_centavos: number | null; total_centavos: number | null;
  order_status: string; payment_status: string; created_at: string; items?: ReportItem[];
};
type OrdersResult = { orders?: ReportOrder[] };

const money = (centavos: number) => new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', maximumFractionDigits: 2,
}).format(centavos / 100);
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
const completedStatuses = new Set(['delivered', 'completed']);
const excludedStatuses = new Set(['rejected', 'cancelled']);

export function OwnerReportingPage({ tenantId, page }: Props) {
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('all');
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!supabase) {
      setError('Restaurant reporting services are not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [ordersResponse, branchesResponse] = await Promise.all([
        supabase.rpc('list_customer_orders', { p_tenant_id: tenantId, p_filter: 'all', p_limit: 100 }),
        supabase.from('branches').select('id,name').eq('tenant_id', tenantId).order('name'),
      ]);
      if (ordersResponse.error) throw ordersResponse.error;
      if (branchesResponse.error) throw branchesResponse.error;
      const result = ordersResponse.data as OrdersResult | null;
      setOrders(result?.orders ?? []);
      setBranches((branchesResponse.data ?? []) as Branch[]);
      if (branchId !== 'all' && !(branchesResponse.data ?? []).some((branch: Branch) => branch.id === branchId)) {
        setBranchId('all');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load restaurant reporting data.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(period));
    return orders.filter(order =>
      (branchId === 'all' || order.branch_id === branchId) &&
      new Date(order.created_at) >= cutoff
    );
  }, [orders, branchId, period]);

  const metrics = useMemo(() => {
    const paid = filtered.filter(order => (order.payment_status === 'paid' || order.payment_status === 'refunded') && !excludedStatuses.has(order.order_status));
    const refunded = filtered.filter(order => order.payment_status === 'refunded');
    const completed = filtered.filter(order => completedStatuses.has(order.order_status));
    const paidSubtotal = paid.reduce((sum, order) => sum + Number(order.subtotal_centavos || 0), 0);
    const refundSubtotal = refunded.reduce((sum, order) => sum + Number(order.subtotal_centavos || 0), 0);
    const byStatus = new Map<string, number>();
    const byItem = new Map<string, { quantity: number; sales: number }>();
    filtered.forEach(order => {
      byStatus.set(order.order_status, (byStatus.get(order.order_status) ?? 0) + 1);
      if (order.payment_status === 'paid' && !excludedStatuses.has(order.order_status)) {
        (order.items ?? []).forEach(item => {
          const name = item.item_name ?? item.item_name_snapshot ?? 'Unnamed item';
          const current = byItem.get(name) ?? { quantity: 0, sales: 0 };
          current.quantity += Number(item.quantity || 0);
          current.sales += Number(item.line_total_centavos || 0);
          byItem.set(name, current);
        });
      }
    });
    return {
      paid, refunded, completed, paidSubtotal, refundSubtotal,
      netSubtotal: paidSubtotal - refundSubtotal,
      paidOrderCount: filtered.filter(order => order.payment_status === 'paid' && !excludedStatuses.has(order.order_status)).length,
      byStatus: [...byStatus.entries()].sort((a, b) => b[1] - a[1]),
      topItems: [...byItem.entries()].sort((a, b) => b[1].quantity - a[1].quantity).slice(0, 8),
      daily: (() => {
        const days = new Map<string, number>();
        paid.forEach(order => {
          const day = new Date(order.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
          days.set(day, (days.get(day) ?? 0) + Number(order.subtotal_centavos || 0));
        });
        return [...days.entries()].slice(-10);
      })(),
    };
  }, [filtered]);

  const title = page === 'sales' ? 'Sales' : 'Business Reports';
  return <main className="owner-content owner-reporting">
    <header className="owner-page-heading">
      <div><p className="owner-eyebrow">WEB2TABLE · BUSINESS INTELLIGENCE</p><h1>{title}</h1>
        <p className="owner-reporting-intro">{page === 'sales' ? 'Review paid order sales and refunds for your restaurant.' : 'Understand order volume, fulfillment, and top-selling menu items.'}</p>
      </div>
      <button type="button" className="owner-reporting-refresh" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
    </header>

    <div className="owner-reporting-filters">
      <label>Period<select value={period} onChange={event => setPeriod(event.target.value)}>
        <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
      </select></label>
      <label>Branch<select value={branchId} onChange={event => setBranchId(event.target.value)}>
        <option value="all">All branches</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select></label>
    </div>

    {error && <p className="owner-reporting-alert" role="alert">{error}</p>}
    {!error && !loading && orders.length === 0 && <section className="owner-reporting-empty"><h2>No order data yet</h2><p>Sales and reports will appear here when customer orders are recorded.</p></section>}
    {(!error && (orders.length > 0 || loading)) && <>
      <p className="owner-reporting-note">Based on the latest {orders.length === 100 ? '100 orders returned by the order service' : orders.length + ' orders returned by the order service'}. Revenue includes paid orders only; refunded orders are shown separately. Totals use order item subtotal and exclude delivery fees.</p>
      {page === 'sales' ? <>
        <section className="owner-reporting-metrics" aria-label="Sales summary">
          <article><span>Gross paid/refunded subtotal</span><strong>{money(metrics.paidSubtotal)}</strong><small>{metrics.paidOrderCount} currently paid orders</small></article>
          <article><span>Refunded subtotal</span><strong>{money(metrics.refundSubtotal)}</strong><small>{metrics.refunded.length} refunded orders</small></article>
          <article><span>Net after refunds</span><strong>{money(metrics.netSubtotal)}</strong><small>Excludes delivery fees</small></article>
          <article><span>Completed orders</span><strong>{metrics.completed.length}</strong><small>Delivered or completed</small></article>
        </section>
        <section className="owner-reporting-panel"><h2>Paid sales by order date</h2>
          {metrics.daily.length === 0 ? <p className="owner-reporting-muted">No paid sales in this period.</p> : <div className="owner-reporting-table-wrap"><table className="owner-reporting-table"><thead><tr><th>Date</th><th>Paid subtotal</th></tr></thead><tbody>{metrics.daily.map(([day, amount]) => <tr key={day}><td>{day}</td><td>{money(amount)}</td></tr>)}</tbody></table></div>}
        </section>
      </> : <>
        <section className="owner-reporting-metrics" aria-label="Business summary">
          <article><span>Orders in period</span><strong>{filtered.length}</strong><small>Across selected branches</small></article>
          <article><span>Paid orders</span><strong>{metrics.paidOrderCount}</strong><small>Payment confirmed</small></article>
          <article><span>Completed orders</span><strong>{metrics.completed.length}</strong><small>Delivered or completed</small></article>
          <article><span>Refunded orders</span><strong>{metrics.refunded.length}</strong><small>Payment marked refunded</small></article>
        </section>
        <div className="owner-reporting-columns">
          <section className="owner-reporting-panel"><h2>Orders by status</h2>
            {metrics.byStatus.length === 0 ? <p className="owner-reporting-muted">No orders in this period.</p> : <div className="owner-reporting-table-wrap"><table className="owner-reporting-table"><thead><tr><th>Status</th><th>Orders</th></tr></thead><tbody>{metrics.byStatus.map(([status, count]) => <tr key={status}><td>{label(status)}</td><td>{count}</td></tr>)}</tbody></table></div>}
          </section>
          <section className="owner-reporting-panel"><h2>Top-selling items</h2>
            {metrics.topItems.length === 0 ? <p className="owner-reporting-muted">No paid item sales in this period.</p> : <div className="owner-reporting-table-wrap"><table className="owner-reporting-table"><thead><tr><th>Item</th><th>Qty</th><th>Sales</th></tr></thead><tbody>{metrics.topItems.map(([name, item]) => <tr key={name}><td>{name}</td><td>{item.quantity}</td><td>{money(item.sales)}</td></tr>)}</tbody></table></div>}
          </section>
        </div>
      </>}
    </>}
  </main>;
}
