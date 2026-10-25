import { useEffect, useState } from 'react';
import type { StaffWorkspaceRole } from './OperationalDashboard';
import { StaffOperationalWorkspace } from './StaffOperationalWorkspace';
import { OwnerAppShell } from './OwnerAppShell';
import { OwnerBrandingPage } from './OwnerBrandingPage';
import { OwnerOrdersPage } from './OwnerOrdersPage';
import { OwnerMenuPage } from './OwnerMenuPage';
import { OwnerStoreSettingsPage } from './OwnerStoreSettingsPage';
import { OwnerSectionPage } from './OwnerSectionPage';
import { OwnerEmployeesPage } from './OwnerEmployeesPage';
import { ownerNavGroups, type OwnerPage } from './ownerWorkspaceConfig';
import { supabase } from '../../lib/supabase';
import './operations.css';

type WorkspaceRole = 'restaurant_owner' | StaffWorkspaceRole;
type Membership = { tenant_id: string; role: WorkspaceRole };
type CachedWorkspace = { userId: string; membership: Membership | null; restaurantName: string | null; accountEmail: string };
let cachedWorkspace: CachedWorkspace | null = null;

const ownerPages = new Set<OwnerPage>([
  'dashboard', 'orders', 'menu', 'inventory', 'recipes', 'employees',
  'sales', 'reports', 'loyalty', 'settings', 'branding',
]);

function ownerPageFromHash(): OwnerPage {
  const route = window.location.hash.replace(/^#\/?/, '');
  const match = route.match(/^restaurant\/([^/?#]+)/);
  const candidate = match?.[1] as OwnerPage | undefined;
  return candidate && ownerPages.has(candidate) ? candidate : 'orders';
}

export function RestaurantWorkspace({ baseUrl }: { baseUrl: string }) {
  const [membership, setMembership] = useState<Membership | null>(cachedWorkspace?.membership ?? null);
  const [restaurantName, setRestaurantName] = useState<string | null>(cachedWorkspace?.restaurantName ?? null);
  const [accountEmail, setAccountEmail] = useState(cachedWorkspace?.accountEmail ?? 'Store Owner');
  const [ownerPage, setOwnerPage] = useState<OwnerPage>(() => ownerPageFromHash());
  const [visitedOwnerPages, setVisitedOwnerPages] = useState<Set<OwnerPage>>(() => new Set<OwnerPage>([ownerPageFromHash()]));
  const [orderFilter, setOrderFilter] = useState<'active' | 'all'>('active');
  const [loading, setLoading] = useState(!cachedWorkspace);
  const [error, setError] = useState('');

  useEffect(() => {
    const syncOwnerPage = () => {
      const nextPage = ownerPageFromHash();
      setOwnerPage(nextPage);
      setVisitedOwnerPages(current => current.has(nextPage) ? current : new Set(current).add(nextPage));
    };
    if (!/^#\/?restaurant\//.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#restaurant/' + ownerPage);
    }
    window.addEventListener('hashchange', syncOwnerPage);
    window.addEventListener('popstate', syncOwnerPage);
    return () => {
      window.removeEventListener('hashchange', syncOwnerPage);
      window.removeEventListener('popstate', syncOwnerPage);
    };
  }, []);

  useEffect(() => {
    if (!supabase || !membership || membership.role !== 'restaurant_owner') return;
    const client = supabase;
    let active = true;
    let managedLink: HTMLLinkElement | null = null;
    const applyFavicon = (url: string | null) => {
      if (!url) return;
      let link = document.querySelector<HTMLLinkElement>('link[data-owner-storefront-favicon="true"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        link.dataset.ownerStorefrontFavicon = 'true';
        document.head.appendChild(link);
      }
      link.href = url;
      managedLink = link;
    };
    const loadFavicon = async () => {
      const { data, error } = await client.from('tenant_storefronts')
        .select('favicon_path').eq('tenant_id', membership.tenant_id).maybeSingle();
      if (error) throw error;
      if (!active || !data?.favicon_path) return;
      applyFavicon(client.storage.from('storefront-logos').getPublicUrl(data.favicon_path).data.publicUrl);
    };
    const handleFaviconUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantId?: string; url?: string }>).detail;
      if (detail?.tenantId === membership.tenant_id && detail.url) applyFavicon(detail.url);
    };
    window.addEventListener('web2table:owner-favicon-updated', handleFaviconUpdate);
    void loadFavicon().catch(() => {
      // A missing favicon should not prevent the owner workspace from rendering.
    });
    return () => {
      active = false;
      window.removeEventListener('web2table:owner-favicon-updated', handleFaviconUpdate);
    };
  }, [membership]);

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
        const userId = authData.user.id;
        if (active && cachedWorkspace?.userId !== userId) setLoading(true);
        const { data, error: membershipError } = await supabase
          .from('tenant_memberships').select('tenant_id,role')
          .eq('user_id', userId).eq('status', 'active');
        if (membershipError) throw membershipError;
        const memberships = (data ?? []) as Membership[];
        const selected = memberships.find(item => item.role === 'restaurant_owner') ?? memberships[0] ?? null;
        let nextRestaurantName: string | null = null;
        if (selected) {
          const { data: tenant, error: tenantError } = await supabase.from('tenants')
            .select('name').eq('id', selected.tenant_id).maybeSingle();
          if (tenantError) throw tenantError;
          nextRestaurantName = tenant?.name ?? null;
        }
        if (!active) return;
        const nextEmail = authData.user.email ?? 'Store Owner';
        cachedWorkspace = { userId, membership: selected, restaurantName: nextRestaurantName, accountEmail: nextEmail };
        setMembership(selected);
        setRestaurantName(nextRestaurantName);
        setAccountEmail(nextEmail);
        setError('');
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your restaurant workspace.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadWorkspace();
    return () => { active = false; };
  }, []);

  if (loading) return <main className="op-shell owner-workspace-loading" role="status" aria-live="polite"><p>Loading your workspace…</p></main>;
  if (error) return <main className="op-shell"><p className="op-eyebrow">WORKSPACE UNAVAILABLE</p><h1>We couldn't load your workspace</h1><p className="op-intro" role="alert">{error}</p></main>;
  if (!membership) return <main className="op-shell">
    <p className="op-eyebrow">RESTAURANT WORKSPACE</p><h1>No restaurant assigned yet</h1>
    <p className="op-intro">Your account is signed in, but it has no active restaurant membership. A System Administrator must create a restaurant and invite its owner before restaurant workspaces can be used. Staff accounts must be invited by that restaurant's owner.</p>
  </main>;

  if (membership.role !== 'restaurant_owner') {
    return <StaffOperationalWorkspace tenantId={membership.tenant_id} role={membership.role} restaurantName={restaurantName} />;
  }

  const signOut = () => { void supabase?.auth.signOut(); };
  const navigateOwnerPage = (nextPage: OwnerPage) => {
    setVisitedOwnerPages(current => {
      if (current.has(nextPage)) return current;
      const next = new Set(current);
      next.add(nextPage);
      return next;
    });
    if (ownerPage !== nextPage) {
      window.location.hash = 'restaurant/' + nextPage;
      setOwnerPage(nextPage);
    }
  };

  const renderOwnerPage = (page: OwnerPage) => {
    if (page === 'orders') return <OwnerOrdersPage tenantId={membership.tenant_id} filter={orderFilter} onFilterChange={setOrderFilter} />;
    if (page === 'menu') return <OwnerMenuPage tenantId={membership.tenant_id} restaurantName={restaurantName} />;
    if (page === 'settings') return <OwnerStoreSettingsPage tenantId={membership.tenant_id} restaurantName={restaurantName} />;
    if (page === 'branding') return <OwnerBrandingPage tenantId={membership.tenant_id} restaurantName={restaurantName} />;
    if (page === 'employees') return <OwnerEmployeesPage tenantId={membership.tenant_id} restaurantName={restaurantName} />;
    return <OwnerSectionPage page={page} restaurantName={restaurantName} onNavigate={navigateOwnerPage} />;
  };

  return <OwnerAppShell baseUrl={baseUrl} groups={ownerNavGroups} page={ownerPage} email={accountEmail} onNavigate={navigateOwnerPage} onSignOut={signOut}>
    {ownerNavGroups.flatMap(group => group.items).filter(item => visitedOwnerPages.has(item.key)).map(item => (
      <div key={item.key} style={{ display: ownerPage === item.key ? 'contents' : 'none' }} aria-hidden={ownerPage !== item.key}>
        {renderOwnerPage(item.key)}
      </div>
    ))}
  </OwnerAppShell>;
}
