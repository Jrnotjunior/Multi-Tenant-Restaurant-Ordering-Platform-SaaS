import { useEffect, useState } from 'react';
import { OwnerDashboard } from '../management/OwnerDashboard';
import { OperationalDashboard, type StaffWorkspaceRole } from './OperationalDashboard';
import { supabase } from '../../lib/supabase';
import './operations.css';

type WorkspaceRole = 'restaurant_owner' | StaffWorkspaceRole;
type Membership = { tenant_id: string; role: WorkspaceRole };

export function RestaurantWorkspace({ baseUrl }: { baseUrl: string }) {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [activeOwnerSection, setActiveOwnerSection] = useState<'overview' | 'menu' | 'orders' | 'team'>('overview');
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
        const { data, error: membershipError } = await supabase
          .from('tenant_memberships')
          .select('tenant_id,role')
          .eq('status', 'active');
        if (membershipError) throw membershipError;
        const memberships = (data ?? []) as Membership[];
        const selected = memberships.find(item => item.role === 'restaurant_owner') ?? memberships[0] ?? null;
        if (!active) return;
        setMembership(selected);
        if (selected) {
          const { data: tenant, error: tenantError } = await supabase
            .from('tenants')
            .select('name')
            .eq('id', selected.tenant_id)
            .maybeSingle();
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
    <p className="op-eyebrow">RESTAURANT WORKSPACE</p>
    <h1>No restaurant assigned yet</h1>
    <p className="op-intro">Your account is signed in, but it has no active restaurant membership. A System Administrator must create a restaurant and invite its owner before restaurant workspaces can be used. Staff accounts must be invited by that restaurant's owner.</p>
  </main>;

  if (membership.role !== 'restaurant_owner') {
    return <OperationalDashboard role={membership.role} restaurantName={restaurantName} />;
  }

  if (activeOwnerSection === 'menu') return <div>
    <div className="op-owner-overview">
      <div className="op-owner-actions">
        <button type="button" onClick={() => setActiveOwnerSection('overview')}>← Overview</button>
      </div>
    </div>
    <OwnerDashboard baseUrl={baseUrl} />
  </div>;

  const ownerSections = [
    { key: 'orders' as const, title: 'Order management', detail: 'Order inbox, confirmation and rejection controls will be connected in the order-operations milestone. Checkout is currently disabled.' },
    { key: 'team' as const, title: 'Team and branches', detail: 'Branch-scoped staff invitations and team management will be added after the role-based order workflow is in place.' },
  ];
  const plannedSection = ownerSections.find(section => section.key === activeOwnerSection);

  return <main className="op-owner-overview">
    <p className="op-eyebrow">RESTAURANT OWNER · OVERVIEW</p>
    <h1>{restaurantName ? restaurantName + ' overview' : 'Restaurant overview'}</h1>
    <p>Manage your restaurant operations from one place. Your data will appear here after your restaurant is provisioned and operational workflows are connected.</p>
    <div className="op-owner-actions" aria-label="Owner workspace sections">
      <button type="button" className={activeOwnerSection === 'overview' ? 'is-active' : ''} onClick={() => setActiveOwnerSection('overview')}>Overview</button>
      <button type="button" onClick={() => setActiveOwnerSection('menu')}>Menu and branding</button>
      <button type="button" className={activeOwnerSection === 'orders' ? 'is-active' : ''} onClick={() => setActiveOwnerSection('orders')}>Orders</button>
      <button type="button" className={activeOwnerSection === 'team' ? 'is-active' : ''} onClick={() => setActiveOwnerSection('team')}>Team and branches</button>
    </div>
    {plannedSection ? <section className="op-work-panel">
      <p className="op-eyebrow">COMING WITH OPERATIONAL WORKFLOWS</p>
      <h2>{plannedSection.title}</h2>
      <p className="op-intro">{plannedSection.detail}</p>
    </section> : <>
      <section className="op-owner-cards" aria-label="Restaurant summary">
        <article><h2>Orders today</h2><p>Not available yet — live order intake is not connected.</p></article>
        <article><h2>Kitchen and dispatch</h2><p>Not available yet — order status and delivery events are not connected.</p></article>
        <article><h2>Restaurant setup</h2><p>Manage your restaurant's name, logo, colors, branches and menu from Menu and branding.</p></article>
      </section>
      <section className="op-work-panel" style={{ marginTop: 20 }}>
        <p className="op-eyebrow">NEXT STEP</p>
        <h2>Prepare your restaurant</h2>
        <p className="op-intro">Once a restaurant is created and assigned to your account, start by setting up its branding, branches and menu. Then we can connect order acceptance, kitchen preparation, dispatch and rider delivery in sequence.</p>
        <div className="op-owner-actions"><button type="button" className="is-active" onClick={() => setActiveOwnerSection('menu')}>Open menu and branding</button></div>
      </section>
    </>}
  </main>;
}
