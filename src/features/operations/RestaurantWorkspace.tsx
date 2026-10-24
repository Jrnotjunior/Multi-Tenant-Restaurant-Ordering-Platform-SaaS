import { useEffect, useState } from 'react';
import { OwnerDashboard } from '../management/OwnerDashboard';
import { OperationalDashboard, type StaffWorkspaceRole } from './OperationalDashboard';
import { supabase } from '../../lib/supabase';
import './operations.css';

type WorkspaceRole = 'restaurant_owner' | StaffWorkspaceRole;
type Membership = { tenant_id: string; role: WorkspaceRole };
type OwnerPage = 'dashboard' | 'orders' | 'menu' | 'inventory' | 'recipes' | 'employees' | 'sales' | 'reports' | 'loyalty' | 'settings' | 'branding';

const navGroups: { label: string; items: { key: OwnerPage; label: string; icon: string }[] }[] = [
  { label: 'OVERVIEW', items: [{ key: 'dashboard', label: 'Dashboard', icon: '▦' }] },
  { label: 'OPERATIONS', items: [
    { key: 'orders', label: 'Orders', icon: '▤' }, { key: 'menu', label: 'Menu', icon: '⚒' },
    { key: 'inventory', label: 'Inventory', icon: '⬡' }, { key: 'recipes', label: 'Recipes', icon: '▣' },
  ] },
  { label: 'PEOPLE', items: [{ key: 'employees', label: 'Employees', icon: '♙' }] },
  { label: 'BUSINESS', items: [
    { key: 'sales', label: 'Sales', icon: '⌁' }, { key: 'reports', label: 'Business Reports', icon: '▥' },
    { key: 'loyalty', label: 'Loyalty', icon: '⚙' },
  ] },
  { label: 'STORE', items: [
    { key: 'settings', label: 'Store Settings', icon: '☼' }, { key: 'branding', label: 'Website & Branding', icon: '☷' },
  ] },
];

const pageTitles: Record<OwnerPage, string> = {
  dashboard: 'Dashboard', orders: 'Orders', menu: 'Menu', inventory: 'Inventory', recipes: 'Recipes',
  employees: 'Employees', sales: 'Sales', reports: 'Business Reports', loyalty: 'Loyalty',
  settings: 'Store Settings', branding: 'Website & Branding',
};

export function RestaurantWorkspace({ baseUrl }: { baseUrl: string }) {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState('Store Owner');
  const [ownerPage, setOwnerPage] = useState<OwnerPage>('orders');
  const [orderFilter, setOrderFilter] = useState<'active' | 'all'>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      if (!supabase) {
        setError('Restaurant workspace services are not configured.');
        setLoading(false);
        return;
      }
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!authData.user) throw new Error('Sign in again to access your restaurant workspace.');
        if (active && authData.user.email) setAccountEmail(authData.user.email);
        const { data, error: membershipError } = await supabase
          .from('tenant_memberships').select('tenant_id,role')
          .eq('user_id', authData.user.id).eq('status', 'active');
        if (membershipError) throw membershipError;
        const memberships = (data ?? []) as Membership[];
        const selected = memberships.find(item => item.role === 'restaurant_owner') ?? memberships[0] ?? null;
        if (!active) return;
        setMembership(selected);
        if (selected) {
          const { data: tenant, error: tenantError } = await supabase.from('tenants')
            .select('name').eq('id', selected.tenant_id).maybeSingle();
          if (tenantError) throw tenantError;
          if (active) setRestaurantName(tenant?.name ?? null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your restaurant workspace.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadWorkspace();
    return () => { active = false; };
  }, []);

  if (loading) return <main className="op-shell"><p>Loading your role and restaurant access…</p></main>;
  if (error) return <main className="op-shell"><p className="op-eyebrow">WORKSPACE UNAVAILABLE</p><h1>We couldn't load your workspace</h1><p className="op-intro" role="alert">{error}</p></main>;
  if (!membership) return <main className="op-shell">
    <p className="op-eyebrow">RESTAURANT WORKSPACE</p><h1>No restaurant assigned yet</h1>
    <p className="op-intro">Your account is signed in, but it has no active restaurant membership. A System Administrator must create a restaurant and invite its owner before restaurant workspaces can be used. Staff accounts must be invited by that restaurant's owner.</p>
  </main>;

  if (membership.role !== 'restaurant_owner') {
    return <OperationalDashboard role={membership.role} restaurantName={restaurantName} />;
  }

  if (ownerPage === 'menu' || ownerPage === 'branding' || ownerPage === 'settings') {
    return <div className="owner-app">
      <aside className="owner-sidebar">
        <a className="owner-brand" href={baseUrl}><span className="owner-brand-mark">W</span><span><strong>Web2Table</strong><small>RESTAURANT<br/>MANAGEMENT</small></span></a>
        {navGroups.map(group => <section className="owner-nav-group" key={group.label}><h2>{group.label}</h2>
          {group.items.map(item => <button key={item.key} className={ownerPage === item.key ? 'active' : ''} onClick={() => setOwnerPage(item.key)}><span className="owner-nav-icon">{item.icon}</span>{item.label}</button>)}
        </section>)}
        <div className="owner-support">♧　Contact Customer Support</div>
      </aside>
      <div className="owner-main"><header className="owner-topbar"><span className="owner-live"><i/>Live<small>System Online</small></span><span className="owner-avatar">AD</span><span className="owner-account"><strong>{accountEmail.split('@')[0]}</strong><small>Store Owner</small></span><button aria-label="Account options" className="owner-account-caret" onClick={() => { void supabase?.auth.signOut(); }}>⌄</button></header>
        <OwnerDashboard baseUrl={baseUrl} />
      </div>
    </div>;
  }

  const choosePage = (page: OwnerPage) => setOwnerPage(page);
  return <div className="owner-app">
    <aside className="owner-sidebar">
      <a className="owner-brand" href={baseUrl}><span className="owner-brand-mark">W</span><span><strong>Web2Table</strong><small>RESTAURANT<br/>MANAGEMENT</small></span></a>
      {navGroups.map(group => <section className="owner-nav-group" key={group.label}><h2>{group.label}</h2>
        {group.items.map(item => <button key={item.key} className={ownerPage === item.key ? 'active' : ''} onClick={() => choosePage(item.key)}><span className="owner-nav-icon">{item.icon}</span>{item.label}</button>)}
      </section>)}
      <div className="owner-support">♧　Contact Customer Support</div>
    </aside>
    <div className="owner-main">
      <header className="owner-topbar"><span className="owner-live"><i/>Live<small>System Online</small></span><span className="owner-avatar">{(accountEmail.slice(0,2)||'AD').toUpperCase()}</span><span className="owner-account"><strong>{accountEmail.split('@')[0]}</strong><small>Store Owner</small></span><button aria-label="Sign out" className="owner-account-caret" onClick={() => { void supabase?.auth.signOut(); }}>⌄</button></header>
      <main className="owner-content">
        {ownerPage === 'orders' ? <>
          <nav className="owner-order-tabs" aria-label="Order filter">
            <button className={orderFilter === 'active' ? 'active' : ''} onClick={() => setOrderFilter('active')}>Active (—)</button>
            <button className={orderFilter === 'all' ? 'active' : ''} onClick={() => setOrderFilter('all')}>All (—)</button>
          </nav>
          <section className="owner-order-stats">
            <article><div><h2>New Orders</h2><p>New customer orders waiting for cashier review</p></div><span>—</span></article>
            <article><div><h2>In the Kitchen</h2><p>Orders being prepared</p></div><span>—</span></article>
            <article><div><h2>Ready</h2><p>Ready for pickup or dine-in</p></div><span>—</span></article>
            <article><div><h2>Completed</h2><p>Finished orders</p></div><span>—</span></article>
          </section>
          <section className="owner-orders-empty"><h2>{orderFilter === 'active' ? 'Active orders' : 'All orders'}</h2><p>Live order counts are not connected to a secured owner-order query yet. No order totals are being fabricated.</p></section>
        </> : ownerPage === 'dashboard' ? <>
          <h1>{restaurantName ?? 'Restaurant'} Dashboard</h1>
          <section className="owner-order-stats">
            <article><div><h2>Orders Today</h2><p>Current restaurant orders</p></div><span>—</span></article>
            <article><div><h2>Sales Today</h2><p>Confirmed sales total</p></div><span>—</span></article>
            <article><div><h2>Menu Items</h2><p>Restaurant menu</p></div><span>—</span></article>
            <article><div><h2>Team Members</h2><p>Active restaurant staff</p></div><span>—</span></article>
          </section>
          <section className="owner-orders-empty"><h2>Restaurant overview</h2><p>Choose a section in the sidebar to manage restaurant operations.</p></section>
        </> : <section className="owner-orders-empty"><h1>{pageTitles[ownerPage]}</h1><p>This section is part of the restaurant-owner workspace. Its live data and actions must be connected to tenant- and branch-scoped services before it can be marked operational.</p>{ownerPage === 'employees' && <button onClick={() => setOwnerPage('settings')}>Open store settings</button>}</section>}
      </main>
    </div>
  </div>;
}
