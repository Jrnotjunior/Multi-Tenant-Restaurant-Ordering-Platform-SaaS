import { useEffect, useState } from 'react';
import { OperationalDashboard, type StaffWorkspaceRole } from './OperationalDashboard';
import { OwnerAppShell } from './OwnerAppShell';
import { OwnerBrandingPage } from './OwnerBrandingPage';
import { OwnerOrdersPage } from './OwnerOrdersPage';
import { OwnerStoreSettingsPage } from './OwnerStoreSettingsPage';
import { OwnerSectionPage } from './OwnerSectionPage';
import { ownerNavGroups, type OwnerPage } from './ownerWorkspaceConfig';
import { supabase } from '../../lib/supabase';
import './operations.css';

type WorkspaceRole = 'restaurant_owner' | StaffWorkspaceRole;
type Membership = { tenant_id: string; role: WorkspaceRole };
type CachedWorkspace = { userId: string; membership: Membership | null; restaurantName: string | null; accountEmail: string };
let cachedWorkspace: CachedWorkspace | null = null;

export function RestaurantWorkspace({ baseUrl }: { baseUrl: string }) {
  const [membership, setMembership] = useState<Membership | null>(cachedWorkspace?.membership ?? null);
  const [restaurantName, setRestaurantName] = useState<string | null>(cachedWorkspace?.restaurantName ?? null);
  const [accountEmail, setAccountEmail] = useState(cachedWorkspace?.accountEmail ?? 'Store Owner');
  const [ownerPage, setOwnerPage] = useState<OwnerPage>('orders');
  const [orderFilter, setOrderFilter] = useState<'active' | 'all'>('active');
  const [loading, setLoading] = useState(!cachedWorkspace);
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
        if (active && cachedWorkspace?.userId !== authData.user.id) setLoading(true);
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
        if (active) cachedWorkspace = { userId: authData.user.id, membership: selected, restaurantName: selected ? (await supabase.from('tenants').select('name').eq('id', selected.tenant_id).maybeSingle()).data?.name ?? null : null, accountEmail: authData.user.email ?? 'Store Owner' };
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

  const signOut = () => { void supabase?.auth.signOut(); };
  let pageContent;
  if (ownerPage === 'orders') {
    pageContent = <OwnerOrdersPage filter={orderFilter} onFilterChange={setOrderFilter} />;
  } else if (ownerPage === 'settings') {
    pageContent = <OwnerStoreSettingsPage tenantId={membership.tenant_id} restaurantName={restaurantName} />;
  } else if (ownerPage === 'branding') {
    pageContent = <OwnerBrandingPage tenantId={membership.tenant_id} restaurantName={restaurantName} />;
  } else {
    pageContent = <OwnerSectionPage page={ownerPage} restaurantName={restaurantName} onNavigate={setOwnerPage} />;
  }

  return <OwnerAppShell baseUrl={baseUrl} groups={ownerNavGroups} page={ownerPage} email={accountEmail} onNavigate={setOwnerPage} onSignOut={signOut}>
    {pageContent}
  </OwnerAppShell>;
}
