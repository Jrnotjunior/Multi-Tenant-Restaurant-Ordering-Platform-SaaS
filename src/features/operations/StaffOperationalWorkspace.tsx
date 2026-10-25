import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { loadKitchenMenuForTenant, publicMenuPhoto, type KitchenMenu } from '../management/menuService';
import type { StaffWorkspaceRole } from './OperationalDashboard';
import './staff-workspace.css';

type Item = { id: string; item_name: string; quantity: number; line_total_centavos: number; options?: { name?: string }[] };
type Order = {
  id: string; order_number: number; branch_id: string; branch_name: string;
  order_type: 'delivery' | 'take_out' | 'pickup' | 'dine_in'; customer_name: string; customer_phone: string;
  delivery_address: string | null; delivery_notes: string; subtotal_centavos: number; delivery_fee_centavos: number | null;
  total_centavos: number | null; order_status: string; payment_status: string; payment_channel?: 'online' | 'other'; created_at: string;
  assigned_rider_user_id: string | null; assignment_status: string | null; items: Item[];
};
type Rider = { user_id: string; email: string; display_name: string };
type Props = { tenantId: string; role: StaffWorkspaceRole; restaurantName: string | null };
const money = (value: number | null) => value == null ? 'Total not finalized' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100);
const label = (value: string) => value.replaceAll('_', ' ');
const typeLabel = (value: Order['order_type']) => ({ delivery: 'Delivery', take_out: 'Take-out', pickup: 'Pickup', dine_in: 'Dine-in' })[value];
const roleCopy: Record<StaffWorkspaceRole, { eyebrow: string; title: string; intro: string; queue: string }> = {
  cashier: { eyebrow: 'FRONT OF HOUSE', title: 'Cashier workspace', intro: 'Review incoming orders, finalize delivery fees, and confirm order details.', queue: 'Order desk' },
  kitchen: { eyebrow: 'KITCHEN OPERATIONS', title: 'Kitchen display', intro: 'Work through accepted tickets and mark meals ready for handoff.', queue: 'Kitchen tickets' },
  dispatcher: { eyebrow: 'DELIVERY OPERATIONS', title: 'Dispatch workspace', intro: 'Assign ready orders to a branch rider and dispatch deliveries.', queue: 'Dispatch queue' },
  rider: { eyebrow: 'RIDER WORKSPACE', title: 'My deliveries', intro: 'Accept deliveries assigned to you and mark each order delivered.', queue: 'My route' },
};

export function StaffOperationalWorkspace({ tenantId, role, restaurantName }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [riders, setRiders] = useState<Record<string, Rider[]>>({});
  const [selectedRiders, setSelectedRiders] = useState<Record<string, string>>({});
  const [fees, setFees] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [cashierTab, setCashierTab] = useState<'orders' | 'sales'>('orders');
  const [kitchenTab, setKitchenTab] = useState<'orders' | 'menu'>('orders');
  const [kitchenMenu, setKitchenMenu] = useState<KitchenMenu | null>(null);
  const [kitchenMenuSearch, setKitchenMenuSearch] = useState('');
  const [kitchenAvailabilityBusy, setKitchenAvailabilityBusy] = useState('');
  const [kitchenMenuLoading, setKitchenMenuLoading] = useState(false);
  const [kitchenMenuError, setKitchenMenuError] = useState('');
  const [search, setSearch] = useState('');
  const [paymentTab, setPaymentTab] = useState<'online_paid' | 'paid'>('online_paid');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const copy = roleCopy[role];

  useEffect(() => {
    if (role !== 'kitchen' || kitchenTab !== 'menu') return;
    let active = true;
    setKitchenMenuLoading(true);
    setKitchenMenuError('');
    void loadKitchenMenuForTenant(tenantId).then(data => {
      if (active) setKitchenMenu(data);
    }).catch(reason => {
      if (active) setKitchenMenuError(reason instanceof Error ? reason.message : 'Unable to load menu items.');
    }).finally(() => {
      if (active) setKitchenMenuLoading(false);
    });
    return () => { active = false; };
  }, [role, kitchenTab, tenantId]);

  useEffect(() => {
    let active = true;
    void supabase?.auth.getUser().then(({ data }) => {
      if (!active) return;
      const user = data.user;
      const metadata = user?.user_metadata ?? {};
      const metadataName = [metadata.full_name, metadata.name, metadata.display_name, metadata.first_name && metadata.last_name ? `${metadata.first_name} ${metadata.last_name}` : null]
        .find(value => typeof value === 'string' && value.trim().length > 0);
      const email = user?.email ?? '';
      setAccountEmail(email);
      setAccountName(typeof metadataName === 'string' ? metadataName.trim() : email.split('@')[0] || 'My account');
    });
    return () => { active = false; };
  }, []);

  async function signOut() {
    if (!supabase || signingOut) return;
    setSigningOut(true);
    setError('');
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message || 'Unable to sign out. Please try again.');
      setSigningOut(false);
      return;
    }
    window.location.reload();
  }

  const load = useCallback(async (quiet = false) => {
    if (!supabase) { setError('Restaurant services are not configured.'); setLoading(false); return; }
    if (!quiet) setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase.rpc('list_staff_orders', { p_tenant_id: tenantId, p_filter: filter, p_limit: 100 });
      if (queryError) throw queryError;
      const next = ((data as { orders?: Order[] } | null)?.orders ?? []) as Order[];
      setOrders(next);
      if (role === 'dispatcher') {
        const branches = [...new Set(next.filter(o => o.order_status === 'ready_for_dispatch').map(o => o.branch_id))];
        const riderLists = await Promise.all(branches.map(async branchId => {
          const { data: result, error: riderError } = await supabase!.rpc('list_branch_riders', { p_tenant_id: tenantId, p_branch_id: branchId });
          if (riderError) throw riderError;
          return [branchId, (result ?? []) as Rider[]] as const;
        }));
        setRiders(Object.fromEntries(riderLists));
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load staff orders.'); }
    finally { if (!quiet) setLoading(false); }
  }, [tenantId, role, filter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const timer = window.setInterval(() => { void load(true); }, 15000); return () => window.clearInterval(timer); }, [load]);

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter(order => {
      const isPaid = ['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase());
      const matchesPaymentTab = paymentTab === 'online_paid' ? isPaid && order.payment_channel === 'online' : isPaid && order.payment_channel !== 'online';
      const searchable = [String(order.order_number), order.customer_name, order.customer_phone, order.branch_name, order.order_status, ...(order.items ?? []).map(item => item.item_name)];
      const matchesSearch = !term || searchable.some(value => value.toLowerCase().includes(term));
      return matchesPaymentTab && matchesSearch;
    }).sort((a, b) => {
      // Put work that needs an immediate staff action at the top, then keep
      // each queue in oldest-first order so earlier orders are not overlooked.
      const priority = (order: Order) => {
        if (role === 'cashier') {
          if (order.order_status === 'pending_confirmation') return order.order_type === 'delivery' && order.total_centavos == null ? 0 : 1;
          if (order.order_status === 'ready_for_pickup') return 2;
          if (order.order_status === 'confirmed') return 3;
        }
        if (role === 'kitchen') {
          if (order.order_status === 'confirmed') return 0;
          if (order.order_status === 'preparing') return 1;
        }
        if (role === 'dispatcher' && order.order_status === 'ready_for_dispatch') return order.assigned_rider_user_id ? 0 : 1;
        if (role === 'rider' && ['assigned', 'out_for_delivery'].includes(order.assignment_status ?? '')) return 0;
        return 4;
      };
      const rankDifference = priority(a) - priority(b);
      return rankDifference || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [orders, search, paymentTab, role]);

  const salesOrders = useMemo(() => orders.filter(order =>
    ['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase()) &&
    !['cancelled', 'canceled', 'rejected', 'refunded'].includes(order.order_status.toLowerCase())
  ), [orders]);
  const salesTotal = useMemo(() => salesOrders.reduce((sum, order) => sum + (order.total_centavos ?? 0), 0), [salesOrders]);

  const stats = useMemo(() => ({
    incoming: orders.filter(o => o.order_status === 'pending_confirmation').length,
    preparing: orders.filter(o => ['confirmed', 'preparing'].includes(o.order_status)).length,
    ready: orders.filter(o => o.order_status === 'ready_for_dispatch').length,
    delivery: orders.filter(o => o.order_status === 'out_for_delivery').length,
  }), [orders]);

  async function act(order: Order, action: string, description: string) {
    if (!supabase) return;
    if (['reject', 'cancel', 'deliver'].includes(action) && !window.confirm(
      action === 'deliver' ? `Confirm order #${order.order_number} has been delivered?` : `${action === 'reject' ? 'Reject' : 'Cancel'} order #${order.order_number}?`,
    )) return;
    setBusy(order.id); setError(''); setNotice('');
    try {
      const { error: actionError } = await supabase.rpc('transition_staff_order', { p_tenant_id: tenantId, p_order_id: order.id, p_action: action });
      if (actionError) throw actionError;
      setNotice(`Order #${order.order_number}: ${description}.`);
      await load(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update this order.'); }
    finally { setBusy(''); }
  }

  async function saveFee(order: Order) {
    if (!supabase) return;
    const raw = (fees[order.id] ?? '').trim();
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(raw)) { setError('Enter a valid delivery fee, such as 50 or 50.00.'); return; }
    const centavos = Math.round(Number(raw) * 100);
    if (!Number.isSafeInteger(centavos) || centavos < 0 || centavos > 1000000000) { setError('Delivery fee is outside the allowed range.'); return; }
    setBusy(order.id); setError(''); setNotice('');
    try {
      const { error: feeError } = await supabase.rpc('set_customer_order_delivery_fee', { p_tenant_id: tenantId, p_order_id: order.id, p_delivery_fee_centavos: centavos });
      if (feeError) throw feeError;
      setNotice(`Delivery fee saved for order #${order.order_number}.`);
      await load(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save delivery fee.'); }
    finally { setBusy(''); }
  }

  async function assign(order: Order) {
    if (!supabase) return;
    const riderId = selectedRiders[order.id];
    if (!riderId) { setError('Choose a rider before assigning this order.'); return; }
    setBusy(order.id); setError(''); setNotice('');
    try {
      const { error: assignError } = await supabase.rpc('assign_order_rider', { p_tenant_id: tenantId, p_order_id: order.id, p_rider_user_id: riderId });
      if (assignError) throw assignError;
      setNotice(`Rider assigned to order #${order.order_number}.`);
      await load(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to assign rider.'); }
    finally { setBusy(''); }
  }

  async function changeKitchenAvailability(itemId:string,isAvailable:boolean) {
    if (!supabase || !kitchenMenu) return;
    setKitchenAvailabilityBusy(itemId);
    setKitchenMenuError('');
    try {
      const {error:rpcError}=await supabase.rpc('set_kitchen_menu_item_availability',{
        p_tenant_id:tenantId,
        p_branch_id:kitchenMenu.branch_id,
        p_item_id:itemId,
        p_is_available:isAvailable,
      });
      if(rpcError)throw rpcError;
      setKitchenMenu(current=>current?{...current,items:current.items.map(item=>item.id===itemId?{...item,is_available:isAvailable}:item)}:current);
      setNotice(isAvailable?'Item is available on the storefront again.':'Item marked unavailable on the storefront.');
      window.setTimeout(()=>setNotice(''),3500);
    } catch(reason) {
      setKitchenMenuError(reason instanceof Error?reason.message:'Unable to update item availability.');
    } finally {
      setKitchenAvailabilityBusy('');
    }
  }

  function actions(order: Order) {
    if (role === 'cashier' && order.order_status === 'pending_confirmation') return [
      { action: 'confirm', label: 'Confirm order', primary: true }, { action: 'reject', label: 'Reject', primary: false },
    ];
    if (role === 'cashier' && order.order_status === 'confirmed') return [{ action: 'cancel', label: 'Cancel order', primary: false }];
    if (role === 'cashier' && order.order_status === 'ready_for_pickup') return [{ action: 'complete_handoff', label: 'Complete handoff', primary: true }];
    if (role === 'kitchen' && order.order_status === 'confirmed') return [{ action: 'start_preparing', label: 'Start preparing', primary: true }];
    if (role === 'kitchen' && order.order_status === 'preparing') return [{ action: 'mark_ready', label: 'Mark ready', primary: true }];
    if (role === 'dispatcher' && order.order_status === 'ready_for_dispatch' && order.assigned_rider_user_id) return [{ action: 'dispatch', label: 'Dispatch order', primary: true }];
    if (role === 'rider' && order.assignment_status === 'assigned') return [{ action: 'accept_delivery', label: 'Accept delivery', primary: true }];
    if (role === 'rider' && order.assignment_status === 'out_for_delivery' && order.order_status === 'out_for_delivery') return [{ action: 'deliver', label: 'Mark delivered', primary: true }];
    return [];
  }

  return <main className={`staff-workspace staff-workspace--${role}`}>
    <div className="staff-account-row">
      <div className="staff-account-menu">
        <button type="button" className="staff-account-trigger" aria-label="Account menu" aria-haspopup="menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>
        </button>
        {accountMenuOpen && <div className="staff-account-dropdown" role="menu">
          <span className="staff-account-email">{accountName || 'My account'}</span>
          <button type="button" role="menuitem" onClick={() => void signOut()} disabled={signingOut}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>
            {signingOut ? 'Signing out…' : 'Log out'}
          </button>
        </div>}
      </div>
    </div>
    {!['cashier', 'kitchen'].includes(role) && <header className="staff-header"><div><p className="staff-eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="staff-intro">{copy.intro}</p>{restaurantName && <p className="staff-restaurant-name">{restaurantName}</p>}</div>
      <div className="staff-header-actions"><span className="staff-live-indicator"><i aria-hidden="true" /> Live queue</span><button className="staff-button staff-button-secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
    </header>}
    {role === 'cashier' && <nav className="staff-workspace-tabs" aria-label="Cashier workspace">
      <button type="button" className={cashierTab === 'orders' ? 'is-active' : ''} aria-current={cashierTab === 'orders' ? 'page' : undefined} onClick={() => { setCashierTab('orders'); setFilter('active'); }}>Orders</button>
      <button type="button" className={cashierTab === 'sales' ? 'is-active' : ''} aria-current={cashierTab === 'sales' ? 'page' : undefined} onClick={() => { setCashierTab('sales'); setFilter('all'); }}>Sales</button>
    </nav>}
    {role === 'kitchen' && <nav className="staff-workspace-tabs" aria-label="Kitchen workspace">
      <button type="button" className={kitchenTab === 'orders' ? 'is-active' : ''} aria-current={kitchenTab === 'orders' ? 'page' : undefined} onClick={() => setKitchenTab('orders')}>Orders</button>
      <button type="button" className={kitchenTab === 'menu' ? 'is-active' : ''} aria-current={kitchenTab === 'menu' ? 'page' : undefined} onClick={() => setKitchenTab('menu')}>Menu</button>
    </nav>}
    {role === 'cashier' && cashierTab === 'sales' ? <section className="staff-sales-view">
      <div className="staff-sales-heading"><div><p className="staff-eyebrow">BUSINESS SUMMARY</p><h2>Sales</h2><p>Paid orders from the order history currently loaded.</p></div><button className="staff-button staff-button-secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh sales</button></div>
      <div className="staff-sales-metrics">
        <article><span>Recorded paid sales</span><strong>{money(salesTotal)}</strong></article>
        <article><span>Paid orders</span><strong>{salesOrders.length}</strong></article>
        <article><span>All orders loaded</span><strong>{orders.length}</strong></article>
      </div>}
      {(error || notice) && <p className={'staff-notice ' + (error ? 'is-error' : 'is-success')} role={error ? 'alert' : 'status'}>{error || notice}</p>}
      {loading ? <p className="staff-empty">Loading sales…</p> : salesOrders.length === 0 ? <div className="staff-empty"><h3>No paid sales found</h3><p>Paid orders will appear here once payment is recorded in the order history.</p></div> :
        <div className="staff-sales-table-wrap"><table className="staff-sales-table"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Payment</th><th>Total</th></tr></thead><tbody>{salesOrders.slice().sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(order => <tr key={order.id}><td>#{order.order_number}</td><td>{new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(order.created_at))}</td><td>{order.customer_name}</td><td><span className="staff-payment-badge payment-paid">{label(order.payment_status)}</span></td><td>{money(order.total_centavos)}</td></tr>)}</tbody></table></div>}
      <p className="staff-footnote">Sales figures reflect the orders returned by the staff order service; they are not a substitute for a reconciled accounting report.</p>
    </section> : <>
    {!['cashier', 'kitchen'].includes(role) && <section className="staff-metrics" aria-label="Order summary">
      <article><span>New orders</span><strong>{stats.incoming}</strong><small>Awaiting cashier review</small></article>
      <article><span>Preparing</span><strong>{stats.preparing}</strong><small>Confirmed / in kitchen</small></article>
      <article><span>Ready for handoff</span><strong>{stats.ready}</strong><small>Awaiting rider or customer handoff</small></article>
      <article><span>Out for delivery</span><strong>{stats.delivery}</strong><small>Currently on the road</small></article>
    </section>}
    <section className="staff-queue">
      <div className="staff-queue-heading"><div><p className="staff-eyebrow">WORK QUEUE</p><h2>{copy.queue}</h2></div>
        {role !== 'cashier' && role !== 'kitchen' && <div className="staff-queue-controls"><button type="button" className={filter === 'active' ? 'is-selected' : ''} onClick={() => setFilter('active')}>Active</button><button type="button" className={filter === 'all' ? 'is-selected' : ''} onClick={() => setFilter('all')}>All orders</button></div>}
      </div>
      {role === 'kitchen' && kitchenTab === 'menu' ? <div className="staff-kitchen-menu-panel">
      <div className="staff-kitchen-menu-toolbar"><div><h3>Menu availability</h3><p>Mark items unavailable when stock runs out. Changes apply to this branch’s storefront.</p></div></div>
      {kitchenMenu?.items.length ? <label className="staff-kitchen-menu-search"><span aria-hidden="true">⌕</span><input type="search" value={kitchenMenuSearch} onChange={event=>setKitchenMenuSearch(event.target.value)} placeholder="Search menu items…" aria-label="Search menu items" /></label> : null}
      {kitchenMenuLoading ? <p className="staff-empty">Loading menu…</p> : kitchenMenuError ? <p className="staff-notice is-error" role="alert">{kitchenMenuError}</p> : !kitchenMenu?.items.length ? <div className="staff-empty"><h3>No menu items yet</h3><p>The restaurant owner can add products from menu management.</p></div> : !(kitchenMenu?.items ?? []).some(item => { const q=kitchenMenuSearch.trim().toLocaleLowerCase(); const category=kitchenMenu?.categories.find(entry=>entry.id===item.category_id); return !q || item.name.toLocaleLowerCase().includes(q) || (item.description ?? '').toLocaleLowerCase().includes(q) || (category?.name ?? '').toLocaleLowerCase().includes(q); }) ? <div className="staff-empty"><h3>No matching menu items</h3><p>Try another item or category name.</p></div> : <div className="staff-kitchen-menu-grid">{(kitchenMenu?.items ?? []).filter(item => { const q=kitchenMenuSearch.trim().toLocaleLowerCase(); const category=kitchenMenu?.categories.find(entry=>entry.id===item.category_id); return !q || item.name.toLocaleLowerCase().includes(q) || (item.description ?? '').toLocaleLowerCase().includes(q) || (category?.name ?? '').toLocaleLowerCase().includes(q); }).map(item => {
        const category = kitchenMenu?.categories.find(entry => entry.id === item.category_id);
        const canToggle=item.status==='published';
        return <article className={'staff-kitchen-menu-card'+(!item.is_available?' is-unavailable':'')} key={item.id}>{publicMenuPhoto(item.image_path) ? <img src={publicMenuPhoto(item.image_path) ?? ''} alt="" loading="lazy" /> : <div className="staff-kitchen-menu-placeholder" aria-hidden="true">Menu item</div>}<div className="staff-kitchen-menu-details">{category && <span className="staff-kitchen-menu-category">{category.name}</span>}<h3>{item.name}</h3>{item.description && <p>{item.description}</p>}<strong>{money(item.price_centavos)}</strong><span className={'staff-kitchen-menu-status is-' + item.status}>{item.status === 'published' ? 'Published' : item.status === 'draft' ? 'Draft' : 'Archived'}</span><span className={'staff-kitchen-availability '+(item.is_available?'is-available':'is-unavailable')}>{item.is_available?'Available to order':'Unavailable to order'}</span>{canToggle && <button type="button" className={'staff-button '+(item.is_available?'staff-button-secondary':'staff-button-primary')} disabled={kitchenAvailabilityBusy===item.id||kitchenMenuLoading} onClick={()=>void changeKitchenAvailability(item.id,!item.is_available)}>{kitchenAvailabilityBusy===item.id?'Updating…':item.is_available?'Mark unavailable':'Mark available'}</button>}</div></article>;
      })}</div>}
    </div> : <div className="staff-kitchen-order-content">{role !== 'kitchen' && <div className="staff-queue-toolbar">
        <label className="staff-order-search"><span className="staff-search-icon" aria-hidden="true">⌕</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order number, customer, phone…" aria-label="Search orders" /></label>
        <div className="staff-queue-toolbar-end staff-payment-toolbar">{role !== 'kitchen' && <div className="staff-payment-tabs" role="tablist" aria-label="Payment category"><button type="button" role="tab" aria-selected={paymentTab === 'online_paid'} className={paymentTab === 'online_paid' ? 'is-selected' : ''} onClick={() => setPaymentTab('online_paid')}>Online Paid</button><button type="button" role="tab" aria-selected={paymentTab === 'paid'} className={paymentTab === 'paid' ? 'is-selected' : ''} onClick={() => setPaymentTab('paid')}>Paid</button></div>}{role !== 'kitchen' && <span className="staff-result-count">{visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'}</span>}</div>
      </div>
      {(error || notice) && <p className={'staff-notice ' + (error ? 'is-error' : 'is-success')} role={error ? 'alert' : 'status'}>{error || notice}</p>}
      {loading ? <p className="staff-empty"><span className="staff-loading-dot" aria-hidden="true" /> Loading orders…</p> : visibleOrders.length === 0 ? <div className="staff-empty"><span className="staff-empty-icon" aria-hidden="true">{orders.length > 0 ? '⌕' : '✓'}</span><h3>{orders.length > 0 ? 'No matching orders' : 'You’re all caught up'}</h3><p>{orders.length > 0 ? 'Try another payment tab or search term.' : (role === 'kitchen' ? 'Accepted orders will appear here. Start preparing each ticket, then mark it ready for handoff.' : 'New orders will appear here automatically. You can keep working while the queue stays up to date.')}</p></div> :
        <div className="staff-order-list">{visibleOrders.map(order => {
          const buttons = actions(order);
          const branchRiders = riders[order.branch_id] ?? [];
          const canAssign = role === 'dispatcher' && order.order_status === 'ready_for_dispatch';
          const needsFee = role === 'cashier' && order.order_type === 'delivery' && order.order_status === 'pending_confirmation' && order.total_centavos == null;
          const needsAttention = (role === 'cashier' && order.order_status === 'pending_confirmation') || (role === 'kitchen' && ['confirmed', 'preparing'].includes(order.order_status)) || (role === 'dispatcher' && order.order_status === 'ready_for_dispatch') || (role === 'rider' && ['assigned', 'out_for_delivery'].includes(order.assignment_status ?? ''));
          return <article className={'staff-order-card' + (needsAttention ? ' is-actionable' : '')} key={order.id}>
            <header className="staff-order-card-heading"><div><span className="staff-order-number">Order #{order.order_number}</span><span className="staff-order-meta">{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at))} · {order.branch_name}</span></div><span className={'staff-status status-' + order.order_status}>{label(order.order_status)}</span></header>
            <div className="staff-order-details"><div className="staff-customer"><strong>{order.customer_name}</strong><span>{order.customer_phone}</span><span>{typeLabel(order.order_type)}</span>{order.order_type === 'delivery' && order.delivery_address && <p>{order.delivery_address}</p>}{order.delivery_notes && <p className="staff-order-notes">Note: {order.delivery_notes}</p>}</div>
              <div className="staff-payment-panel">
                <div className="staff-payment-status"><span>Payment status</span><strong className={'staff-payment-badge payment-' + order.payment_status.toLowerCase().replaceAll('_', '-')}>{label(order.payment_status)}</strong></div>
                <div className="staff-payment-breakdown"><span>Subtotal</span><strong>{money(order.subtotal_centavos)}</strong>{order.order_type === 'delivery' && <><span>Delivery fee</span><strong>{order.delivery_fee_centavos == null ? 'Pending' : money(order.delivery_fee_centavos)}</strong></>}<span className="staff-total-label">Order total</span><strong className="staff-order-total">{money(order.total_centavos)}</strong></div>
              </div></div>
            <ul className="staff-order-items">{(order.items ?? []).map(item => <li key={item.id}><span>{item.quantity} × {item.item_name}{item.options?.length ? <small>{item.options.map(option => option.name).filter(Boolean).join(', ')}</small> : null}</span><strong>{money(item.line_total_centavos)}</strong></li>)}</ul>
            {needsFee && <div className="staff-inline-control"><label htmlFor={'staff-fee-' + order.id}>Delivery fee (PHP)</label><input id={'staff-fee-' + order.id} type="number" min="0" max="10000000" step="0.01" inputMode="decimal" value={fees[order.id] ?? (order.delivery_fee_centavos == null ? '' : (order.delivery_fee_centavos / 100).toFixed(2))} onChange={event => setFees(current => ({ ...current, [order.id]: event.target.value }))} placeholder="e.g. 50.00" /><button className="staff-button staff-button-secondary" type="button" disabled={busy === order.id} onClick={() => void saveFee(order)}>Save fee</button></div>}
            {canAssign && <div className="staff-inline-control"><label htmlFor={'staff-rider-' + order.id}>Assign branch rider</label><select id={'staff-rider-' + order.id} value={selectedRiders[order.id] ?? order.assigned_rider_user_id ?? ''} onChange={event => setSelectedRiders(current => ({ ...current, [order.id]: event.target.value }))}><option value="">Choose a rider</option>{branchRiders.map(rider => <option key={rider.user_id} value={rider.user_id}>{rider.display_name || rider.email}</option>)}</select><button className="staff-button staff-button-secondary" type="button" disabled={busy === order.id || branchRiders.length === 0} onClick={() => void assign(order)}>Assign rider</button>{branchRiders.length === 0 && <small>No active rider is assigned to this branch yet.</small>}</div>}
            {(buttons.length > 0 || order.assigned_rider_user_id) && <footer className="staff-order-actions">{order.assigned_rider_user_id && <span className="staff-assignment-note">Rider {label(order.assignment_status ?? 'assigned')}</span>}{buttons.map(button => <button key={button.action} type="button" disabled={busy === order.id} className={'staff-button ' + (button.primary ? 'staff-button-primary' : 'staff-button-secondary')} onClick={() => void act(order, button.action, button.label.toLowerCase())}>{busy === order.id ? 'Saving…' : button.label}</button>)}</footer>}
          </article>;
        })}</div>}
    </div>}
    </section>
    
    </>}
  </main>;
}
