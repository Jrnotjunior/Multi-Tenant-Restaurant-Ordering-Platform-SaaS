import { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeAppBase } from '../../app/routes';
import { userDisplayName } from '../../domain/userDisplayName';
import { supabase } from '../../lib/supabase';
import { loadKitchenMenuForTenant, publicMenuPhoto, type KitchenMenu } from '../management/menuService';
import type { StaffWorkspaceRole } from './OperationalDashboard';
import { KitchenTicketPreview } from './KitchenTicketPreview';
import './staff-workspace.css';
import './rider-dashboard.css';
import { buildRiderNavigationUrls } from './riderNavigation';

type Item = { id: string; item_name: string; quantity: number; line_total_centavos: number; options?: { name?: string }[]; special_instructions?: string };
type Order = {
  id: string; order_number: number; branch_id: string; branch_name: string;
  order_type: 'delivery' | 'take_out' | 'pickup' | 'dine_in'; customer_name: string; customer_phone: string;
  delivery_address: string | null; delivery_latitude: number | null; delivery_longitude: number | null; delivery_notes: string; subtotal_centavos: number; delivery_fee_centavos: number | null;
  total_centavos: number | null; order_status: string; payment_status: string; payment_channel?: 'online' | 'other'; created_at: string;
  assigned_rider_user_id: string | null; assignment_status: string | null; items: Item[];
};
type Rider = { user_id: string; display_name: string | null };
type Props = { tenantId: string; role: StaffWorkspaceRole; restaurantName: string | null };
type StaffOrderAction = 'confirm' | 'cancel' | 'complete_handoff' | 'mark_ready' | 'dispatch' | 'accept_delivery' | 'arrive_customer' | 'collect_cod' | 'deliver';
type StaffOrderActionButton = { action: StaffOrderAction; label: string; primary: boolean };
const money = (value: number | null) => value == null ? 'Total not finalized' : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100);
const maySendOrderToKitchen = (order: Order) => {
  const paymentStatus = order.payment_status.toLowerCase();
  const isPaid = ['paid', 'succeeded', 'completed'].includes(paymentStatus);
  const allowedCashOrder = order.payment_channel === 'other' &&
    ['delivery', 'pickup'].includes(order.order_type) &&
    ['not_started', 'pending'].includes(paymentStatus);
  return isPaid || allowedCashOrder;
};
const staffPageFromHash = (role: StaffWorkspaceRole) => {
  const parts = window.location.hash.replace(/^#\/?restaurant\//, '').split('/');
  if (parts[0] !== role) return role === 'cashier' ? 'orders' : role === 'kitchen' ? 'orders' : 'overview';
  const page = parts[1];
  if (role === 'cashier' && page === 'sales') return 'sales';
  if (role === 'kitchen' && page === 'menu') return 'menu';
  return role === 'cashier' || role === 'kitchen' ? 'orders' : page === 'history' ? 'history' : 'overview';
};
const staffRouteFor = (role: StaffWorkspaceRole, page: string) => {
  const base = role === 'cashier' || role === 'kitchen' ? page : page === 'history' ? 'history' : '';
  return '#restaurant/' + role + (base ? '/' + base : '');
};
const staffWorkspaceHref = (role: StaffWorkspaceRole) => normalizeAppBase(import.meta.env.BASE_URL) + staffRouteFor(role, '');
const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
const formatOrderNumber = (value: number | string) => `ORD-${String(value).trim().replace(/^ORD-/i, '').padStart(5, '0')}`;
const typeLabel = (value: Order['order_type']) => ({ delivery: 'Delivery', take_out: 'Take-out', pickup: 'Pickup', dine_in: 'Dine-in' })[value];
const roleCopy: Record<StaffWorkspaceRole, { eyebrow: string; title: string; intro: string; queue: string }> = {
  cashier: { eyebrow: 'FRONT OF HOUSE', title: 'Cashier workspace', intro: 'Review incoming orders, finalize delivery fees, and confirm order details.', queue: 'Order desk' },
  kitchen: { eyebrow: 'KITCHEN OPERATIONS', title: 'Kitchen display', intro: 'Work through accepted orders and mark meals ready for handoff.', queue: 'Order desk' },
  dispatcher: { eyebrow: 'DELIVERY OPERATIONS', title: 'Dispatch workspace', intro: 'Assign ready orders to a branch rider and dispatch deliveries.', queue: 'Order desk' },
  rider: { eyebrow: 'RIDER WORKSPACE', title: 'My deliveries', intro: 'Accept deliveries assigned to you and mark each order delivered.', queue: 'My route' },
};

export function StaffOperationalWorkspace({ tenantId, role, restaurantName }: Props) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [riders, setRiders] = useState<Record<string, Rider[]>>({});
  const [selectedRiders, setSelectedRiders] = useState<Record<string, string>>({});
  const [fees, setFees] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [riderTab, setRiderTab] = useState<'active' | 'history'>('active');
  const [selectedRiderOrderId, setSelectedRiderOrderId] = useState<string | null>(null);
  const [orderDetailsOpen, setOrderDetailsOpen] = useState(false);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [riderHistoryDate, setRiderHistoryDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [cashierTab, setCashierTab] = useState<'orders' | 'sales'>(() => staffPageFromHash(role) === 'sales' ? 'sales' : 'orders');
  const [posIntegrationActive, setPosIntegrationActive] = useState(false);
  const [kitchenTab, setKitchenTab] = useState<'orders' | 'menu'>(() => staffPageFromHash(role) === 'menu' ? 'menu' : 'orders');
  const [kitchenMenu, setKitchenMenu] = useState<KitchenMenu | null>(null);
  const [kitchenMenuSearch, setKitchenMenuSearch] = useState('');
  const [kitchenMenuCategory, setKitchenMenuCategory] = useState('all');
  const [kitchenAvailabilityBusy, setKitchenAvailabilityBusy] = useState('');
  const [kitchenMenuLoading, setKitchenMenuLoading] = useState(false);
  const [kitchenMenuError, setKitchenMenuError] = useState('');
  const [search, setSearch] = useState('');
  const [paymentTab, setPaymentTab] = useState<'all' | 'online_paid' | 'unpaid'>('all');
  const [dispatcherTab, setDispatcherTab] = useState<Order['order_type']>('delivery');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [selectedCashierOrderId, setSelectedCashierOrderId] = useState<string | null>(null);
  const [latestKitchenTicket, setLatestKitchenTicket] = useState<Order | null>(null);
  const [kitchenTicketPreviewOpen, setKitchenTicketPreviewOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const copy = roleCopy[role];

  useEffect(() => {
    if (role !== 'cashier' || !supabase) {
      setPosIntegrationActive(false);
      return;
    }
    let active = true;
    setPosIntegrationActive(false);
    void (async () => {
      try {
        const { data, error: statusError } = await supabase.rpc('get_my_pos_integration_status', { p_tenant_id: tenantId });
        if (!active || statusError) return;
        const status = (data as { status?: unknown } | null)?.status;
        setPosIntegrationActive(status === 'active');
      } catch {
        // Fail closed: never show POS navigation unless entitlement is confirmed.
        if (active) setPosIntegrationActive(false);
      }
    })();
    return () => { active = false; };
  }, [role, tenantId]);

  useEffect(() => {
    if (role !== 'cashier' || !posIntegrationActive) return;
    // POS is a separate application and performs its own authenticated sign-in
    // and server-side tenant/branch authorization. Do not pass credentials or tokens in the URL.
    window.location.replace('https://jrnotjunior.github.io/POS/');
  }, [role, posIntegrationActive]);

  useEffect(() => {
    const syncStaffPage = () => {
      const page = staffPageFromHash(role);
      if (role === 'cashier') setCashierTab(page === 'sales' ? 'sales' : 'orders');
      if (role === 'kitchen') setKitchenTab(page === 'menu' ? 'menu' : 'orders');
    };
    const expectedPrefix = '#restaurant/' + role;
    if (!window.location.hash.startsWith(expectedPrefix)) {
      window.history.replaceState(null, '', normalizeAppBase(import.meta.env.BASE_URL) + window.location.search + staffRouteFor(role, role === 'cashier' ? cashierTab : role === 'kitchen' ? kitchenTab : ''));
    } else {
      syncStaffPage();
    }
    window.addEventListener('hashchange', syncStaffPage);
    window.addEventListener('popstate', syncStaffPage);
    return () => {
      window.removeEventListener('hashchange', syncStaffPage);
      window.removeEventListener('popstate', syncStaffPage);
    };
  }, [role]);

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
    if (role !== 'kitchen' || !kitchenMenu) return;
    const configuredCategories = kitchenMenu.categories.filter(category =>
      category.is_published && kitchenMenu.items.some(item =>
        item.category_id === category.id && item.status === 'published'
      )
    );
    if (kitchenMenuCategory !== 'all' && !configuredCategories.some(category => category.id === kitchenMenuCategory)) {
      setKitchenMenuCategory('all');
    }
  }, [role, kitchenMenu, kitchenMenuCategory]);

  useEffect(() => {
    let active = true;
    const roleFallback = role === 'rider' ? 'Rider' : role === 'dispatcher' ? 'Dispatcher' : role === 'cashier' ? 'Cashier' : 'Kitchen Staff';

    void (async () => {
      if (!supabase) {
        if (active) setAccountName(roleFallback);
        return;
      }

      // Resolve the authenticated user's tenant membership name first. The RPC is
      // the preferred path; the RLS-protected own-membership query is a compatibility
      // fallback for environments where the RPC migration has not propagated yet.
      const { data: authResult, error: userError } = await supabase.auth.getUser();
      if (!active) return;
      const user = !userError ? authResult.user : null;
      if (user) {
        const { data: profileName, error: profileError } = await supabase.rpc(
          'get_my_staff_display_name',
          { p_tenant_id: tenantId },
        );
        if (!active) return;

        const rpcName = typeof profileName === 'string'
          ? profileName.trim()
          : profileName && typeof profileName === 'object'
            ? Object.values(profileName as Record<string, unknown>).find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim() ?? ''
            : '';
        if (!profileError && rpcName) {
          setAccountName(rpcName);
          return;
        }

        const { data: membership, error: membershipError } = await supabase
          .from('tenant_memberships')
          .select('staff_first_name,staff_last_name')
          .eq('tenant_id', tenantId)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        if (!active) return;
        if (!membershipError && membership) {
          const membershipName = [membership.staff_first_name, membership.staff_last_name]
            .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
            .join(' ')
            .trim();
          if (membershipName) {
            setAccountName(membershipName);
            return;
          }
        }
        setAccountName(userDisplayName(user, roleFallback));
        return;
      }
      setAccountName(roleFallback);
    })();

    return () => { active = false; };
  }, [role, tenantId]);

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
    window.location.assign(new URL('account/sign-in', window.location.origin + normalizeAppBase(import.meta.env.BASE_URL)).toString());
  }

  const load = useCallback(async (quiet = false) => {
    if (!supabase) { setError('Restaurant services are not configured.'); setLoading(false); return; }
    if (!quiet) setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase.rpc('list_staff_orders', { p_tenant_id: tenantId, p_filter: role === 'rider' ? 'all' : filter, p_limit: 100 });
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

  useEffect(() => {
    void load();
    if (!supabase) return;

    let refreshTimer: number | undefined;
    const channel = supabase
      .channel('tenant:' + tenantId, { config: { private: true } })
      .on('broadcast', { event: 'db_change' }, () => {
        // Coalesce bursts from one transaction, then reload authorized RPC data.
        if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { void load(true); }, 100);
      })
      .subscribe((status) => {
        // Reconcile immediately after initial connection and every successful reconnect.
        if (status === 'SUBSCRIBED') void load(true);
      });

    // Fallback reconciliation protects against missed events or temporary outages.
    const reconciliationTimer = window.setInterval(() => { void load(true); }, 60000);
    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      window.clearInterval(reconciliationTimer);
      void supabase?.removeChannel(channel);
    };
  }, [load, tenantId]);


  const paymentCounts = useMemo(() => {
    const eligibleOrders = orders.filter(order =>
      !['cancelled', 'canceled', 'rejected', 'refunded'].includes(order.order_status.toLowerCase())
    );
    return {
      onlinePaid: eligibleOrders.filter(order =>
        ['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase()) &&
        order.payment_channel === 'online'
      ).length,
      unpaid: eligibleOrders.filter(order =>
        !['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase())
      ).length,
    };
  }, [orders]);
  const orderTabCounts = useMemo(() => {
    const dispatcher: Record<Order['order_type'], number> = { delivery: 0, pickup: 0, take_out: 0, dine_in: 0 };
    let cashier = 0;
    let kitchen = 0;
    for (const order of orders) {
      if (['pending_confirmation', 'ready_for_pickup'].includes(order.order_status)) cashier += 1;
      if (['confirmed', 'preparing'].includes(order.order_status)) kitchen += 1;
      if (order.order_type === 'delivery' && order.order_status === 'ready_for_dispatch' && !['dispatched', 'out_for_delivery', 'delivered', 'cancelled'].includes(order.assignment_status ?? '')) dispatcher.delivery += 1;
      if (order.order_type !== 'delivery' && order.order_status === 'ready_for_pickup') dispatcher[order.order_type] += 1;
    }
    return { cashier, kitchen, dispatcher };
  }, [orders]);
  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter(order => {
      const isPaid = ['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase());
      const matchesPaymentTab = role !== 'cashier' || (paymentTab === 'all' ? true : paymentTab === 'online_paid' ? isPaid && order.payment_channel === 'online' : !isPaid && !['cancelled', 'canceled', 'rejected', 'refunded'].includes(order.order_status.toLowerCase()));
      const searchable = [String(order.order_number), order.customer_name, order.customer_phone, order.branch_name, order.order_status, ...(order.items ?? []).map(item => item.item_name)];
      const matchesSearch = !term || searchable.some(value => value.toLowerCase().includes(term));
      const matchesDispatcherTab = role !== 'dispatcher' || (order.order_type === dispatcherTab && (dispatcherTab === 'delivery'
        ? order.order_status === 'ready_for_dispatch' && !['dispatched', 'out_for_delivery', 'delivered', 'cancelled'].includes(order.assignment_status ?? '')
        : order.order_status === 'ready_for_pickup'));
      return matchesPaymentTab && matchesSearch && matchesDispatcherTab;
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
        if (role === 'dispatcher' && order.order_type === 'delivery' && order.order_status === 'ready_for_dispatch' && order.assignment_status !== 'dispatched') return order.assigned_rider_user_id ? 0 : 1;
        if (role === 'dispatcher' && order.order_type !== 'delivery' && order.order_status === 'ready_for_pickup') return 0;
        if (role === 'rider' && ['dispatched', 'assigned', 'out_for_delivery'].includes(order.assignment_status ?? '')) return 0;
        return 4;
      };
      const rankDifference = priority(a) - priority(b);
      return rankDifference || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [orders, search, paymentTab, role, dispatcherTab]);

  const salesOrders = useMemo(() => orders.filter(order =>
    ['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase()) &&
    !['cancelled', 'canceled', 'rejected', 'refunded'].includes(order.order_status.toLowerCase())
  ), [orders]);
  const salesTotal = useMemo(() => salesOrders.reduce((sum, order) => sum + (order.total_centavos ?? 0), 0), [salesOrders]);

  const stats = useMemo(() => ({
    incoming: orders.filter(o => o.order_status === 'pending_confirmation').length,
    preparing: orders.filter(o => ['confirmed', 'preparing'].includes(o.order_status)).length,
    ready: orders.filter(o => o.order_status === 'ready_for_dispatch' && o.assignment_status !== 'dispatched').length,
    delivery: orders.filter(o => o.order_status === 'out_for_delivery').length,
    riderAssigned: orders.filter(o => ['assigned', 'accepted'].includes(o.assignment_status ?? '') && o.order_status !== 'out_for_delivery').length,
    riderOnRoute: orders.filter(o => o.assignment_status === 'out_for_delivery' && o.order_status === 'out_for_delivery').length,
    riderDelivered: orders.filter(o => o.assignment_status === 'delivered' || o.order_status === 'delivered').length,
  }), [orders]);

  async function act(order: Order, action: StaffOrderAction, description: string) {
    if (!supabase) return;
    if ((action === 'cancel' || (action === 'deliver' && role !== 'rider')) && !window.confirm(
      action === 'deliver' ? `Confirm order #${order.order_number} has been delivered?` : `Cancel order #${order.order_number} before it enters the kitchen?`,
    )) return;
    setBusy(order.id); setError(''); setNotice('');
    try {
      if (action === 'cancel') {
        const { data, error: cancelFunctionError } = await supabase.functions.invoke('cancel-customer-order', {
          body: { tenantId, orderId: order.id },
        });
        if (cancelFunctionError) {
          const context = (cancelFunctionError as { context?: unknown }).context;
          const response = context instanceof Response ? context : null;
          const payload = response ? await response.clone().json().catch(() => null) : null;
          throw new Error(payload?.error || cancelFunctionError.message || 'Unable to cancel this order.');
        }
        if (!(data as { success?: boolean } | null)?.success) {
          throw new Error((data as { error?: string } | null)?.error || 'Unable to cancel this order.');
        }
      } else {
        const unpaidCodDelivery = action === 'collect_cod' && order.order_type === 'delivery' && order.payment_channel === 'other' && !['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase());
        const { error: actionError } = unpaidCodDelivery
          ? await supabase.rpc('rider_complete_cod_delivery', { p_tenant_id: tenantId, p_order_id: order.id })
          : await supabase.rpc('transition_staff_order', { p_tenant_id: tenantId, p_order_id: order.id, p_action: action });
        if (actionError) throw actionError;
      }
      let confirmationNotice = `Order #${order.order_number}: ${description}.`;
      if (role === 'cashier' && action === 'confirm') {
        setLatestKitchenTicket(order);
        setKitchenTicketPreviewOpen(true);
        setSelectedCashierOrderId(null);
        confirmationNotice = `Order #${order.order_number} sent to the kitchen. Review its ticket before printing.`;
      }
      setNotice(confirmationNotice);
      if ((role === 'kitchen' && action === 'mark_ready') || (role === 'dispatcher' && ['dispatch', 'complete_handoff'].includes(action))) setSelectedCashierOrderId(null);
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
    if (order.order_type !== 'delivery') { setError('Only delivery orders can be assigned to a rider.'); return; }
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

  function actions(order: Order): StaffOrderActionButton[] {
    if (role === 'cashier' && order.order_status === 'pending_confirmation') return [
      { action: 'confirm', label: 'Confirm order', primary: true }, { action: 'cancel', label: 'Cancel order', primary: false },
    ];
    if (role === 'cashier' && order.order_status === 'ready_for_pickup') return [{ action: 'complete_handoff', label: 'Complete handoff', primary: true }];
    if (role === 'kitchen' && order.order_status === 'preparing') return [{ action: 'mark_ready', label: 'Mark ready', primary: true }];
    if (role === 'dispatcher' && order.order_type === 'delivery' && order.order_status === 'ready_for_dispatch' && order.assigned_rider_user_id && order.assignment_status !== 'dispatched') return [{ action: 'dispatch', label: 'Dispatch order', primary: true }];
    if (role === 'dispatcher' && order.order_type !== 'delivery' && order.order_status === 'ready_for_pickup') return [{ action: 'complete_handoff', label: order.order_type === 'dine_in' ? 'Mark served' : 'Mark picked up', primary: true }];
    if (role === 'rider' && order.order_type === 'delivery' && order.assignment_status === 'dispatched') return [{ action: 'accept_delivery', label: 'Start delivery', primary: true }];
    if (role === 'rider' && order.order_type === 'delivery' && order.assignment_status === 'out_for_delivery' && order.order_status === 'out_for_delivery') return [{ action: 'arrive_customer', label: 'Mark arrived at customer', primary: true }];
    if (role === 'rider' && order.order_type === 'delivery' && order.assignment_status === 'arrived_at_customer' && order.order_status === 'out_for_delivery') return [{ action: order.payment_channel === 'other' && !['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase()) ? 'collect_cod' : 'deliver', label: order.payment_channel === 'other' && !['paid', 'succeeded', 'completed'].includes(order.payment_status.toLowerCase()) ? 'Collect cash and complete delivery' : 'Mark delivered', primary: true }];
    return [];
  }

  if (role === 'rider') {
    const activeDeliveries = orders.filter(order =>
      order.order_type === 'delivery' && ['assigned', 'accepted', 'dispatched', 'out_for_delivery', 'arrived_at_customer'].includes(order.assignment_status ?? '') &&
      !['delivered', 'cancelled', 'rejected', 'refunded'].includes(order.order_status.toLowerCase()),
    );
    const deliveryHistory = orders.filter(order =>
      order.order_type === 'delivery' && (order.assignment_status === 'delivered' || ['delivered', 'completed'].includes(order.order_status.toLowerCase())),
    );
    const hasOnRoad = activeDeliveries.some(order => ['out_for_delivery', 'arrived_at_customer'].includes(order.assignment_status ?? '') || order.order_status === 'out_for_delivery');
    const selectedRiderOrder = activeDeliveries.find(order => order.id === selectedRiderOrderId) ?? deliveryHistory.find(order => order.id === selectedRiderOrderId);
    if (selectedRiderOrder) {
      const order = selectedRiderOrder;
      const button = actions(order).find(item => item.action === 'accept_delivery' || item.action === 'arrive_customer' || item.action === 'collect_cod' || item.action === 'deliver');
      return <main className="rider-dashboard-page rider-delivery-page">
        <header className="rider-delivery-header">
          <button className="rider-delivery-back" type="button" onClick={() => setSelectedRiderOrderId(null)}>← Back</button>
          <div className="rider-delivery-order-card">
            <p className="rider-delivery-order-eyebrow">Delivery order</p>
            <h1 className="rider-delivery-order-number">{formatOrderNumber(order.order_number)}</h1>
          </div>
        </header>
                {error && <div className="rider-dashboard-message" role="alert">{error}</div>}
        {notice && <div className="rider-dashboard-notice" role="status">{notice}</div>}
        <div className="rider-delivery-layout">
          <main className="rider-delivery-main">
            <section className="rider-delivery-card">
              <div className="rider-delivery-card-heading">
                <div><p className="rider-delivery-label">Customer</p><h2>{order.customer_name}</h2></div>
                <span className="rider-delivery-customer-icon" aria-hidden="true">♙</span>
              </div>
              {order.customer_phone && <p className="rider-delivery-phone">{order.customer_phone}</p>}
              {order.customer_phone && <div className="rider-delivery-contact-actions"><a className="rider-delivery-contact-button" href={'tel:' + order.customer_phone}><svg className="rider-delivery-contact-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.2 3.8 4.8 5.1c-.8.5-.9 1.6-.7 2.5 1.5 6.2 6.1 10.8 12.3 12.3.9.2 2 0 2.5-.7l1.3-2.4-4.1-2.8-2 2a14.3 14.3 0 0 1-5.8-5.8l2-2-3.1-4.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>Call</a><a className="rider-delivery-contact-button" href={'sms:' + order.customer_phone}><svg className="rider-delivery-contact-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.2a7.8 7.8 0 0 1-8 7.6 8.7 8.7 0 0 1-3.6-.8L4 19l1.1-3.7A7.2 7.2 0 0 1 4 11.2a7.8 7.8 0 0 1 8-7.6 7.8 7.8 0 0 1 8 7.6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M8 11.5h.01M12 11.5h.01M16 11.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>Text</a></div>}
            </section>
            <section className="rider-delivery-card">
              <div className="rider-delivery-card-heading">
                <div><p className="rider-delivery-label">Delivery destination</p><h2>Customer address</h2></div>
                <span className="rider-delivery-location-icon" aria-hidden="true">⌖</span>
              </div>
              {order.delivery_address ? (() => {
                const navigation = buildRiderNavigationUrls(order.delivery_latitude, order.delivery_longitude, order.delivery_address);
                return navigation ? <a className="rider-delivery-address-link" href={navigation.googleMaps} target="_blank" rel="noopener noreferrer" aria-label={'Open ' + order.delivery_address + ' in Google Maps'}>
                  <span className="rider-delivery-address-pin" aria-hidden="true">⌖</span><span><strong>Delivery address</strong><span className="rider-delivery-address">{order.delivery_address}</span></span>
                </a> : <p className="rider-delivery-address">No valid delivery location available</p>;
              })() : <p className="rider-delivery-address">No delivery address provided</p>}
              {order.delivery_notes && <p className="rider-delivery-helper">Delivery notes: {order.delivery_notes}</p>}
            </section>
            <section className="rider-delivery-card rider-order-details-card">
              <button className="rider-order-details-toggle" type="button" aria-expanded={orderDetailsOpen} onClick={() => setOrderDetailsOpen(open => !open)}>
                <span><span className="rider-delivery-label">Order</span><strong>Order details</strong><small>View items and order total</small></span>
                <span className="rider-order-details-chevron" aria-hidden="true">{orderDetailsOpen ? '⌃' : '⌄'}</span>
              </button>
              {orderDetailsOpen && <>
                <div className="rider-delivery-items">{order.items.map(item => <div className="rider-delivery-item" key={item.id}><span><strong>{item.quantity}×</strong> {item.item_name}{item.options?.length ? <small>{item.options.map(option=>option.name).filter(Boolean).join(', ')}</small> : null}{item.special_instructions&&<small>Note: {item.special_instructions}</small>}</span><span>{money(item.line_total_centavos)}</span></div>)}</div>
                <div className="rider-delivery-subtotal"><span>Subtotal</span><strong>{money(order.subtotal_centavos)}</strong></div>
                <div className="rider-delivery-fee"><span>Delivery fee</span><strong>{order.delivery_fee_centavos == null ? 'Pending' : money(order.delivery_fee_centavos)}</strong></div>
                <div className="rider-delivery-total"><span>Order total</span><strong>{money(order.total_centavos)}</strong></div>
                <p className="rider-delivery-helper">Payment: {label(order.payment_status).toUpperCase()}</p>
              </>}
            </section>
          </main>
          <aside className="rider-delivery-sidebar">
            <section className="rider-delivery-card rider-delivery-progress-card">
              <p className="rider-delivery-label">Delivery status</p>
                            <div className="rider-delivery-steps">
                {[
                  { label: 'Assigned', detail: 'Dispatcher assigned this delivery to you.' },
                  { label: 'Out for delivery', detail: 'You are heading to the customer.' },
                  { label: 'Arrived at customer', detail: 'You have arrived at the delivery address.' },
                  { label: 'Delivered', detail: 'The order was delivered to the customer.' },
                ].map((step, index) => {
                  const current = order.assignment_status === 'delivered' ? 3 : order.assignment_status === 'arrived_at_customer' ? 2 : order.assignment_status === 'out_for_delivery' ? 1 : 0;
                  return <div className="rider-delivery-step" key={step.label}><span className={'rider-delivery-step-marker ' + (index <= current ? 'is-done' : '')}>{index <= current ? '✓' : index + 1}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div></div>;
                })}
              </div>
              {button && <div className="rider-delivery-slider" data-status={button.action === 'accept_delivery' ? 'start' : button.action === 'arrive_customer' ? 'arrived' : button.action === 'collect_cod' ? 'collect' : 'delivered'}>
                <input className="rider-delivery-slider-input" type="range" min="0" max="100" step="1" value={swipeProgress} disabled={busy === order.id} aria-label={button.action === 'accept_delivery' ? 'Slide right to mark out for delivery' : button.action === 'arrive_customer' ? 'Slide right to mark arrived at customer' : button.action === 'collect_cod' ? 'Slide right to collect cash and complete delivery' : 'Slide right to mark delivered'} onChange={(event) => {
                  const next = Number(event.target.value);
                  setSwipeProgress(next);
                  if (next >= 95 && busy !== order.id) {
                    setSwipeProgress(0);
                    void act(order, button.action, button.label.toLowerCase());
                  }
                }} onPointerUp={() => { if (swipeProgress < 95) setSwipeProgress(0); }} onTouchEnd={() => { if (swipeProgress < 95) setSwipeProgress(0); }} />
                <span className="rider-delivery-slider-label" aria-hidden="true">{busy === order.id ? 'Updating…' : button.action === 'accept_delivery' ? 'Swipe when leaving for delivery' : button.action === 'arrive_customer' ? 'Swipe when you arrive at the customer' : button.action === 'collect_cod' ? 'Swipe to collect cash' : 'Swipe to mark delivered'}</span>
                <span className="rider-delivery-slider-arrow" aria-hidden="true">›</span>
              </div>}
              {button?.action === 'collect_cod' && <p className="rider-delivery-helper">Collect {money(order.total_centavos)} from the customer before swiping. This confirms payment and marks the order delivered.</p>}
              {order.assignment_status === 'assigned' && <p className="rider-delivery-helper">Assigned by the dispatcher. Waiting for dispatch.</p>}
            </section>
          </aside>
        </div>
      </main>;
    }
    const shownHistory = deliveryHistory.filter(order => {
      if (!riderHistoryDate) return true;
      const date = new Date(order.created_at);
      return !Number.isNaN(date.getTime()) && date.toLocaleDateString('en-CA') === riderHistoryDate;
    });
    return <main className="rider-dashboard-page rider-dashboard-home-page">
      <header className="rider-dashboard-header">
        <div>
          <p className="eyebrow">Rider dashboard</p>
          <h1>Hello, {accountName || 'Rider'}.</h1>
          <div className="rider-dashboard-availability"><span className={'rider-dashboard-availability-dot ' + (hasOnRoad ? 'is-delivering' : 'is-available')} aria-hidden="true" /><strong>{hasOnRoad ? 'Out for delivery' : 'Available'}</strong></div>
          <p>{activeDeliveries.length === 0 ? 'You have no active deliveries right now.' : `You have ${activeDeliveries.length} active ${activeDeliveries.length === 1 ? 'delivery' : 'deliveries'}.`}</p>
        </div>
        <div className="rider-dashboard-account-menu">
          <button className="rider-account-button" type="button" aria-label="Open rider account menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(open => !open)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.4 3.2-5.2 7-5.2s6.2 1.8 7 5.2" /></svg>
          </button>
          {accountMenuOpen && <div className="rider-account-dropdown"><div className="rider-account-email">{accountName || 'Rider account'}</div><button type="button" onClick={() => void signOut()} disabled={signingOut}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/></svg>{signingOut ? 'Logging out…' : 'Log out'}</button></div>}
        </div>
      </header>
      {error && <div className="rider-dashboard-message" role="alert">{error}</div>}
      {notice && <div className="rider-dashboard-notice" role="status">{notice}</div>}
      <section className="rider-dashboard-section">
        <div className="rider-dashboard-tabs" role="tablist" aria-label="Rider deliveries">
          <button className={riderTab === 'active' ? 'is-active' : ''} type="button" role="tab" aria-selected={riderTab === 'active'} onClick={() => setRiderTab('active')}>Active <span>{activeDeliveries.length}</span></button>
          <button className={riderTab === 'history' ? 'is-active' : ''} type="button" role="tab" aria-selected={riderTab === 'history'} onClick={() => setRiderTab('history')}>Delivery history <span>{deliveryHistory.length}</span></button>
        </div>
        {riderTab === 'active' ? <>
          <div className="rider-dashboard-section-heading"><div><p className="rider-delivery-label">My deliveries</p><h2>Orders assigned to you</h2></div></div>
          {loading ? <div className="rider-dashboard-empty">Loading your deliveries…</div> : activeDeliveries.length === 0 ?
            <div className="rider-dashboard-empty"><span className="rider-dashboard-empty-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none"><path d="M10 15.5 24 8l14 7.5v17L24 40l-14-7.5v-17Z"/><path d="m10.5 15.8 13.5 7.6 13.5-7.6M24 23.5V40"/><path d="M17 11.8 31 19.5"/></svg></span><strong>No active deliveries</strong><span>New orders assigned by the dispatcher will appear here.</span></div> :
            <div className="rider-dashboard-list">{activeDeliveries.map(order => {
              const button = actions(order).find(item => item.action === 'accept_delivery' || item.action === 'arrive_customer' || item.action === 'collect_cod' || item.action === 'deliver');
              return <article className="rider-dashboard-delivery-card rider-dashboard-delivery-card-clickable" key={order.id}>
                <button className="rider-dashboard-card-open" type="button" onClick={() => { setSelectedRiderOrderId(order.id); setOrderDetailsOpen(false); setSwipeProgress(0); }} aria-label={'Open order ' + formatOrderNumber(order.order_number)}>
                  <span className="rider-dashboard-delivery-top">
                    <strong>{formatOrderNumber(order.order_number)}</strong>
                  </span>
                  <span className="rider-dashboard-card-bottom">
                    <span className="rider-dashboard-card-copy"><strong className="rider-dashboard-card-customer">{order.customer_name}</strong><span className="rider-dashboard-card-address">{order.delivery_address || typeLabel(order.order_type)}</span></span>
                    <span className="rider-dashboard-delivery-side"><strong>{money(order.total_centavos)}</strong><span aria-hidden="true">›</span></span>
                  </span>
                </button>
              </article>;
            })}</div>}
        </> : <>
          <div className="rider-dashboard-section-heading"><div><p className="rider-delivery-label">Delivery history</p><h2>Your delivery history</h2></div></div>
          <div className="rider-history-filter"><label htmlFor="rider-history-date">Delivery date</label><input id="rider-history-date" type="date" value={riderHistoryDate} max={new Date().toLocaleDateString('en-CA')} onChange={event => setRiderHistoryDate(event.target.value)} /><button type="button" onClick={() => setRiderHistoryDate('')}>All dates</button></div>
          {loading ? <div className="rider-dashboard-empty">Loading order history…</div> : shownHistory.length === 0 ?
            <div className="rider-dashboard-empty"><strong>{deliveryHistory.length ? 'No deliveries for this date' : 'No delivery history yet'}</strong><span>{deliveryHistory.length ? 'Choose another date or view all dates to see older deliveries.' : 'Completed deliveries will appear here.'}</span></div> :
            <div className="rider-dashboard-list">{shownHistory.map(order => <article className="rider-dashboard-delivery-card rider-dashboard-history-card rider-dashboard-delivery-card-clickable" key={order.id}>
              <button className="rider-dashboard-card-open rider-dashboard-history-open" type="button" onClick={() => { setSelectedRiderOrderId(order.id); setOrderDetailsOpen(false); setSwipeProgress(0); }} aria-label={'Open delivered order ' + formatOrderNumber(order.order_number)}>
                <span className="rider-dashboard-delivery-main"><span className="rider-dashboard-delivery-top"><strong>{formatOrderNumber(order.order_number)}</strong><span className="rider-dashboard-status is-delivered">Delivered</span></span><strong className="rider-dashboard-card-customer">{order.customer_name}</strong><span className="rider-dashboard-card-address">Delivered on {new Intl.DateTimeFormat('en-PH',{dateStyle:'medium'}).format(new Date(order.created_at))}</span></span>
                <span className="rider-dashboard-delivery-side"><strong>{money(order.total_centavos)}</strong><span aria-hidden="true">✓</span></span>
              </button>
            </article>)}</div>}
        </>}
      </section>
    </main>;
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
    {!['cashier', 'kitchen', 'dispatcher'].includes(role) && <header className="staff-header"><div><p className="staff-eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="staff-intro">{copy.intro}</p>{restaurantName && <p className="staff-restaurant-name">{restaurantName}</p>}</div>
      <div className="staff-header-actions"><span className="staff-live-indicator"><i aria-hidden="true" /> Live queue</span><button className="staff-button staff-button-secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh</button></div>
    </header>}
    {role === 'cashier' && <nav className="staff-workspace-tabs" aria-label="Cashier workspace">
      <button type="button" className={cashierTab === 'orders' ? 'is-active' : ''} aria-current={cashierTab === 'orders' ? 'page' : undefined} aria-label={orderTabCounts.cashier ? `Orders, ${orderTabCounts.cashier} need cashier attention` : undefined} onClick={() => { window.location.hash = staffRouteFor(role, 'orders'); setCashierTab('orders'); setFilter('active'); }}>Orders{orderTabCounts.cashier > 0 && <span className="staff-tab-count" aria-hidden="true">{orderTabCounts.cashier}</span>}</button>
      <button type="button" className={cashierTab === 'sales' ? 'is-active' : ''} aria-current={cashierTab === 'sales' ? 'page' : undefined} onClick={() => { window.location.hash = staffRouteFor(role, 'sales'); setCashierTab('sales'); setFilter('all'); }}>Sales</button>
    </nav>}
    {role === 'kitchen' && <nav className="staff-workspace-tabs" aria-label="Kitchen workspace">
      <button type="button" className={kitchenTab === 'orders' ? 'is-active' : ''} aria-current={kitchenTab === 'orders' ? 'page' : undefined} aria-label={orderTabCounts.kitchen ? `Orders, ${orderTabCounts.kitchen} active kitchen tickets` : undefined} onClick={() => { window.location.hash = staffRouteFor(role, 'orders'); setKitchenTab('orders'); }}>Orders{orderTabCounts.kitchen > 0 && <span className="staff-tab-count" aria-hidden="true">{orderTabCounts.kitchen}</span>}</button>
      <button type="button" className={kitchenTab === 'menu' ? 'is-active' : ''} aria-current={kitchenTab === 'menu' ? 'page' : undefined} onClick={() => { window.location.hash = staffRouteFor(role, 'menu'); setKitchenTab('menu'); }}>Menu</button>
    </nav>}
    {role === 'dispatcher' && <nav className="staff-workspace-tabs" aria-label="Order type" role="tablist">
      <button type="button" role="tab" aria-selected={dispatcherTab === 'delivery'} aria-label={orderTabCounts.dispatcher.delivery ? `Delivery, ${orderTabCounts.dispatcher.delivery} orders ready for dispatch` : undefined} className={dispatcherTab === 'delivery' ? 'is-active' : ''} onClick={() => setDispatcherTab('delivery')}>Delivery{orderTabCounts.dispatcher.delivery > 0 && <span className="staff-tab-count" aria-hidden="true">{orderTabCounts.dispatcher.delivery}</span>}</button>
      <button type="button" role="tab" aria-selected={dispatcherTab === 'pickup'} aria-label={orderTabCounts.dispatcher.pickup ? `Pick up, ${orderTabCounts.dispatcher.pickup} ready for handoff` : undefined} className={dispatcherTab === 'pickup' ? 'is-active' : ''} onClick={() => setDispatcherTab('pickup')}>Pick up{orderTabCounts.dispatcher.pickup > 0 && <span className="staff-tab-count" aria-hidden="true">{orderTabCounts.dispatcher.pickup}</span>}</button>
      <button type="button" role="tab" aria-selected={dispatcherTab === 'take_out'} aria-label={orderTabCounts.dispatcher.take_out ? `Take out, ${orderTabCounts.dispatcher.take_out} ready for handoff` : undefined} className={dispatcherTab === 'take_out' ? 'is-active' : ''} onClick={() => setDispatcherTab('take_out')}>Take out{orderTabCounts.dispatcher.take_out > 0 && <span className="staff-tab-count" aria-hidden="true">{orderTabCounts.dispatcher.take_out}</span>}</button>
      <button type="button" role="tab" aria-selected={dispatcherTab === 'dine_in'} aria-label={orderTabCounts.dispatcher.dine_in ? `Dine in, ${orderTabCounts.dispatcher.dine_in} ready for handoff` : undefined} className={dispatcherTab === 'dine_in' ? 'is-active' : ''} onClick={() => setDispatcherTab('dine_in')}>Dine in{orderTabCounts.dispatcher.dine_in > 0 && <span className="staff-tab-count" aria-hidden="true">{orderTabCounts.dispatcher.dine_in}</span>}</button>
    </nav>}
    {role === 'cashier' && cashierTab === 'sales' ? <section className="staff-sales-view">
      <div className="staff-sales-heading"><div><p className="staff-eyebrow">BUSINESS SUMMARY</p><h2>Sales</h2><p>Paid orders from the order history currently loaded.</p></div><button className="staff-button staff-button-secondary" type="button" onClick={() => void load()} disabled={loading}>Refresh sales</button></div>
      <div className="staff-sales-metrics">
        <article><span>Recorded paid sales</span><strong>{money(salesTotal)}</strong></article>
        <article><span>Paid orders</span><strong>{salesOrders.length}</strong></article>
        <article><span>All orders loaded</span><strong>{orders.length}</strong></article>
      </div>
      {(error || notice) && <p className={'staff-notice ' + (error ? 'is-error' : 'is-success')} role={error ? 'alert' : 'status'}>{error || notice}</p>}
      {loading ? <p className="staff-empty">Loading sales…</p> : salesOrders.length === 0 ? <div className="staff-empty"><h3>No paid sales found</h3><p>Paid orders will appear here once payment is recorded in the order history.</p></div> :
        <div className="staff-sales-table-wrap"><table className="staff-sales-table"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Payment</th><th>Total</th></tr></thead><tbody>{salesOrders.slice().sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(order => <tr key={order.id}><td>#{order.order_number}</td><td>{new Intl.DateTimeFormat('en-PH',{dateStyle:'medium',timeStyle:'short'}).format(new Date(order.created_at))}</td><td>{order.customer_name}</td><td><span className="staff-payment-badge payment-paid">{label(order.payment_status)}</span></td><td>{money(order.total_centavos)}</td></tr>)}</tbody></table></div>}
      <p className="staff-footnote">Sales figures reflect the orders returned by the staff order service; they are not a substitute for a reconciled accounting report.</p>
    </section> : <>
    {!['cashier', 'kitchen', 'dispatcher'].includes(role) && <section className="staff-metrics" aria-label="Order summary">
      <article><span>New orders</span><strong>{stats.incoming}</strong><small>Awaiting cashier review</small></article>
      <article><span>Preparing</span><strong>{stats.preparing}</strong><small>Confirmed / in kitchen</small></article>
      <article><span>Ready for handoff</span><strong>{stats.ready}</strong><small>Awaiting rider or customer handoff</small></article>
      <article><span>Out for delivery</span><strong>{stats.delivery}</strong><small>Currently on the road</small></article>
    </section>}
    <section className="staff-queue">
      <div className="staff-queue-heading"><div><p className="staff-eyebrow">WORK QUEUE</p><h2>{copy.queue}</h2></div>
      </div>
      
      {role === 'kitchen' && kitchenTab === 'menu' ? <div className="staff-kitchen-menu-panel">
      <div className="staff-kitchen-menu-toolbar"><div><h3>Menu availability</h3><p>Mark items unavailable when stock runs out. Changes apply to this branch’s storefront.</p></div></div>
      {kitchenMenu?.items.length ? <><div className="staff-kitchen-menu-controls"><label className="staff-kitchen-menu-search"><span aria-hidden="true">⌕</span><input type="search" value={kitchenMenuSearch} onChange={event=>setKitchenMenuSearch(event.target.value)} placeholder="Search products" aria-label="Search menu items" /></label><nav className="staff-kitchen-category-tabs" aria-label="Menu categories"><button type="button" className={kitchenMenuCategory==='all'?'is-selected':''} onClick={()=>setKitchenMenuCategory('all')}>All</button>{(kitchenMenu?.categories ?? []).filter(category => category.is_published && (kitchenMenu?.items ?? []).some(item => item.category_id === category.id && item.status === 'published')).map(category=><button type="button" key={category.id} className={kitchenMenuCategory===category.id?'is-selected':''} onClick={()=>setKitchenMenuCategory(category.id)}>{category.name}</button>)}</nav></div></> : null}
      {kitchenMenuLoading ? <p className="staff-empty">Loading menu…</p> : kitchenMenuError ? <p className="staff-notice is-error" role="alert">{kitchenMenuError}</p> : !kitchenMenu?.items.length ? <div className="staff-empty"><h3>No menu items yet</h3><p>The restaurant owner can add products from menu management.</p></div> : !(kitchenMenu?.items ?? []).some(item => { const q=kitchenMenuSearch.trim().toLocaleLowerCase(); const category=kitchenMenu?.categories.find(entry=>entry.id===item.category_id); const matchesCategory=kitchenMenuCategory==='all'||item.category_id===kitchenMenuCategory; return matchesCategory && (!q || item.name.toLocaleLowerCase().includes(q) || (item.description ?? '').toLocaleLowerCase().includes(q) || (category?.name ?? '').toLocaleLowerCase().includes(q)); }) ? <div className="staff-empty"><h3>No matching menu items</h3><p>Try another product or category.</p></div> : <div className="staff-kitchen-menu-grid">{(kitchenMenu?.items ?? []).filter(item => { const q=kitchenMenuSearch.trim().toLocaleLowerCase(); const category=kitchenMenu?.categories.find(entry=>entry.id===item.category_id); const matchesCategory=kitchenMenuCategory==='all'||item.category_id===kitchenMenuCategory; return matchesCategory && (!q || item.name.toLocaleLowerCase().includes(q) || (item.description ?? '').toLocaleLowerCase().includes(q) || (category?.name ?? '').toLocaleLowerCase().includes(q)); }).map(item => {
        const category = kitchenMenu?.categories.find(entry => entry.id === item.category_id);
        const canToggle=item.status==='published';
        return <article className={'staff-kitchen-menu-card'+(!item.is_available?' is-unavailable':'')} key={item.id}>{publicMenuPhoto(item.image_path) ? <img src={publicMenuPhoto(item.image_path) ?? ''} alt="" loading="lazy" /> : <div className="staff-kitchen-menu-placeholder" aria-hidden="true">Menu item</div>}<div className="staff-kitchen-menu-details">{category && <span className="staff-kitchen-menu-category">{category.name}</span>}<h3>{item.name}</h3>{item.description && <p>{item.description}</p>}<strong>{money(item.price_centavos)}</strong><span className={'staff-kitchen-menu-status is-' + item.status}>{item.status === 'published' ? 'Published' : item.status === 'draft' ? 'Draft' : 'Archived'}</span><span className={'staff-kitchen-availability '+(item.is_available?'is-available':'is-unavailable')}>{item.is_available?'Available to order':'Unavailable to order'}</span>{canToggle && <button type="button" className={'staff-button '+(item.is_available?'staff-button-secondary':'staff-button-primary')} disabled={kitchenAvailabilityBusy===item.id||kitchenMenuLoading} onClick={()=>void changeKitchenAvailability(item.id,!item.is_available)}>{kitchenAvailabilityBusy===item.id?'Updating…':item.is_available?'Mark unavailable':'Mark available'}</button>}</div></article>;
      })}</div>}
    </div> : <div className="staff-kitchen-order-content"><div className="staff-queue-toolbar">
        <label className="staff-order-search"><span className="staff-search-icon" aria-hidden="true">⌕</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order number, customer, phone…" aria-label="Search orders" /></label>
        {role === 'cashier' && <div className="staff-queue-toolbar-end staff-payment-toolbar"><div className="staff-payment-tabs" role="tablist" aria-label="Payment category"><button type="button" role="tab" aria-selected={paymentTab === 'all'} className={paymentTab === 'all' ? 'is-selected' : ''} onClick={() => setPaymentTab('all')}>All</button><button type="button" role="tab" aria-selected={paymentTab === 'online_paid'} className={paymentTab === 'online_paid' ? 'is-selected' : ''} onClick={() => setPaymentTab('online_paid')}>Online Paid <span className="staff-payment-count">{paymentCounts.onlinePaid}</span></button><button type="button" role="tab" aria-selected={paymentTab === 'unpaid'} className={paymentTab === 'unpaid' ? 'is-selected' : ''} onClick={() => setPaymentTab('unpaid')}>Unpaid <span className="staff-payment-count">{paymentCounts.unpaid}</span></button></div><span className="staff-result-count">{visibleOrders.length} {visibleOrders.length === 1 ? 'order' : 'orders'}</span></div>}
      </div>
      {(error || notice) && <p className={'staff-notice ' + (error ? 'is-error' : 'is-success')} role={error ? 'alert' : 'status'}>{error || notice}</p>}
      {role === 'cashier' && latestKitchenTicket && !kitchenTicketPreviewOpen && <button className="staff-button staff-button-secondary" type="button" onClick={() => setKitchenTicketPreviewOpen(true)}>View latest kitchen ticket</button>}
      {loading ? <p className="staff-empty"><span className="staff-loading-dot" aria-hidden="true" /> Loading orders…</p> : visibleOrders.length === 0 ? <div className="staff-empty"><span className="staff-empty-icon" aria-hidden="true">{orders.length > 0 ? '⌕' : '✓'}</span><h3>{orders.length > 0 ? 'No matching orders' : 'You’re all caught up'}</h3><p>{orders.length > 0 ? (role === 'cashier' ? 'Try another payment tab or search term.' : 'Try another search term.') : (role === 'kitchen' ? 'Accepted orders will appear here. Start preparing each ticket, then mark it ready for handoff.' : 'New orders will appear here automatically. You can keep working while the queue stays up to date.')}</p></div> :
        <div className="staff-order-list">{visibleOrders.map(order => {
          const buttons = actions(order);
          const branchRiders = riders[order.branch_id] ?? [];
          const needsFee = role === 'cashier' && order.order_type === 'delivery' && order.order_status === 'pending_confirmation' && order.total_centavos == null;
          const needsAttention = (role === 'cashier' && order.order_status === 'pending_confirmation') || (role === 'kitchen' && ['confirmed', 'preparing'].includes(order.order_status)) || (role === 'dispatcher' && ((order.order_type === 'delivery' && order.order_status === 'ready_for_dispatch' && order.assignment_status !== 'dispatched') || (order.order_type !== 'delivery' && order.order_status === 'ready_for_pickup')));
          return <button type="button" className="staff-cashier-order-summary" key={order.id} onClick={() => setSelectedCashierOrderId(order.id)} aria-label={`Open order ${order.order_number} details`}>
            <span className={"staff-cashier-summary-main" + (role === 'kitchen' ? ' staff-kitchen-summary-main' : '')}><strong>ORD-{String(order.order_number).padStart(5, '0')}</strong>{role === 'kitchen' && <span className="staff-order-created-at">{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(order.created_at)) + ' · ' + new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' }).format(new Date(order.created_at))}</span>}</span>
            {role === 'kitchen' ? <span className="staff-cashier-summary-payment"><span>{typeLabel(order.order_type)}</span></span> : <span className="staff-cashier-summary-payment"><span>{typeLabel(order.order_type)} · {order.payment_channel === 'online' ? 'Online' : 'Cash'} · {['paid','succeeded','completed'].includes(order.payment_status.toLowerCase()) ? 'Paid' : 'Unpaid'}</span><strong>{money(order.total_centavos)}</strong></span>}
          </button>;
        })}</div>}
    </div>}
    </section>
    {selectedCashierOrderId && (() => {
      const order = orders.find(item => item.id === selectedCashierOrderId);
      if (!order) return null;
      const buttons = actions(order);
      const needsFee = order.order_type === 'delivery' && order.order_status === 'pending_confirmation' && order.total_centavos == null;
      return <div className="staff-cashier-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedCashierOrderId(null); }}>
        <section className="staff-cashier-modal" role="dialog" aria-modal="true" aria-labelledby="staff-cashier-modal-title">
          <button type="button" className="staff-cashier-modal-close" aria-label="Close order details" onClick={() => setSelectedCashierOrderId(null)}>×</button>
          <header><h2 id="staff-cashier-modal-title">ORD-{String(order.order_number).padStart(5, '0')}</h2><p>{order.order_status === 'ready_for_dispatch' ? null : <>{label(order.order_status)} · </>}{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(order.created_at)) + ' · ' + new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' }).format(new Date(order.created_at))}</p></header>
          <p className="staff-cashier-modal-meta">{role === 'kitchen' ? typeLabel(order.order_type) : <>{typeLabel(order.order_type)} · {order.payment_channel === 'online' ? 'Online' : 'Cash'} · {['paid','succeeded','completed'].includes(order.payment_status.toLowerCase()) ? 'Paid' : 'Unpaid'}</>}</p>
          {role === 'cashier' && order.order_status === 'pending_confirmation' && !maySendOrderToKitchen(order) && <p className="staff-notice is-error" role="note">This order must be paid before it can go to the kitchen. Unpaid cash is allowed only for delivery and pickup.</p>}
          {role === 'kitchen' ? <>
            {order.delivery_notes && <div className="staff-cashier-modal-note"><strong>Customer notes</strong><span>{order.delivery_notes}</span></div>}
            <ul className="staff-cashier-modal-items staff-kitchen-modal-items">{(order.items ?? []).map(item => <li key={item.id}><span>{item.item_name}{item.options?.length ? <small>{item.options.map(option => option.name).filter(Boolean).join(', ')}</small> : null}{item.special_instructions&&<small>Note: {item.special_instructions}</small>}</span><strong>× {item.quantity}</strong></li>)}</ul>
          </> : <>
            <div className="staff-cashier-modal-customer"><strong>Customer</strong><span>{order.customer_name}</span></div>
            {order.order_type === 'delivery' && order.delivery_address && <div className="staff-cashier-modal-note"><strong>Delivery address</strong><span>{order.delivery_address}</span></div>}
            {order.delivery_notes && <div className="staff-cashier-modal-note"><strong>Special Instructions</strong><span>{order.delivery_notes}</span></div>}
            <ul className="staff-cashier-modal-items staff-cashier-order-items">{(order.items ?? []).map(item => <li key={item.id}><strong className="staff-cashier-item-quantity">{item.quantity} ×</strong><span className="staff-cashier-item-detail">{item.item_name}{item.options?.length ? <small>{item.options.map(option => option.name).filter(Boolean).join(', ')}</small> : null}{item.special_instructions&&<small>Note: {item.special_instructions}</small>}</span><strong className="staff-cashier-item-price">{money(item.line_total_centavos)}</strong></li>)}</ul>
            <div className="staff-cashier-modal-breakdown">
              <div><span>Subtotal</span><strong>{money(order.subtotal_centavos)}</strong></div>
              {order.order_type === 'delivery' && <div><span>Delivery fee</span><strong>{order.delivery_fee_centavos == null ? 'Pending' : money(order.delivery_fee_centavos)}</strong></div>}
            </div>
            <div className="staff-cashier-modal-total"><strong>Total</strong><strong>{money(order.total_centavos)}</strong></div>
          </>}
          {role === 'dispatcher' && order.order_type === 'delivery' && order.order_status === 'ready_for_dispatch' && order.assignment_status !== 'dispatched' && <div className="staff-inline-control"><label htmlFor={'staff-rider-modal-' + order.id}>Assign branch rider</label><select id={'staff-rider-modal-' + order.id} value={selectedRiders[order.id] ?? order.assigned_rider_user_id ?? ''} onChange={event => setSelectedRiders(current => ({ ...current, [order.id]: event.target.value }))}><option value="">Choose a rider</option>{(riders[order.branch_id] ?? []).filter(rider => rider.display_name?.trim()).map(rider => <option key={rider.user_id} value={rider.user_id}>{rider.display_name!.trim()}</option>)}</select><button className="staff-button staff-button-secondary" type="button" disabled={busy === order.id || !(riders[order.branch_id] ?? []).some(rider => rider.display_name?.trim())} onClick={() => void assign(order)}>Assign rider</button>{!(riders[order.branch_id] ?? []).some(rider => rider.display_name?.trim()) && <small>No eligible rider with a complete name is available for this branch. Update the rider profile to enable assignment.</small>}</div>}{needsFee && <div className="staff-inline-control"><label htmlFor={'staff-fee-modal-' + order.id}>Delivery fee (PHP)</label><input id={'staff-fee-modal-' + order.id} type="number" min="0" max="10000000" step="0.01" inputMode="decimal" value={fees[order.id] ?? ''} onChange={event => setFees(current => ({ ...current, [order.id]: event.target.value }))} placeholder="e.g. 50.00" /><button className="staff-button staff-button-secondary" type="button" disabled={busy === order.id} onClick={() => void saveFee(order)}>Save fee</button></div>}
          {buttons.length > 0 && <footer className="staff-cashier-modal-actions">{buttons.map(button => <button key={button.action} type="button" disabled={busy === order.id || (button.action === 'confirm' && !maySendOrderToKitchen(order))} className={'staff-button ' + (button.primary ? 'staff-button-primary' : 'staff-button-secondary')} onClick={() => void act(order, button.action, button.label.toLowerCase())}>{busy === order.id ? 'Saving…' : button.label}</button>)}</footer>}
        </section>
      </div>;
    })()}
    {role === 'cashier' && kitchenTicketPreviewOpen && latestKitchenTicket && <KitchenTicketPreview
      order={latestKitchenTicket}
      restaurantName={restaurantName}
      onClose={() => setKitchenTicketPreviewOpen(false)}
    />}
    </>}
  </main>;
}
