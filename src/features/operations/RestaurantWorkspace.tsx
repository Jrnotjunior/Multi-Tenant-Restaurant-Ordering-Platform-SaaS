import { useEffect, useState } from 'react';
import { normalizeAppBase } from '../../app/routes';
import { userDisplayName } from '../../domain/userDisplayName';
import type { StaffWorkspaceRole } from './OperationalDashboard';
import { StaffOperationalWorkspace } from './StaffOperationalWorkspace';
import { OwnerAppShell } from './OwnerAppShell';
import { OwnerBrandingPage } from './OwnerBrandingPage';
import { OwnerOrdersPage } from './OwnerOrdersPage';
import { OwnerMenuPage } from './OwnerMenuPage';
import { OwnerStoreSettingsPage } from './OwnerStoreSettingsPage';
import { OwnerSectionPage } from './OwnerSectionPage';
import { OwnerReportingPage } from './OwnerReportingPage';
import { OwnerLoyaltyPage } from './OwnerLoyaltyPage';
import { OwnerEmployeesPage } from './OwnerEmployeesPage';
import { OwnerFiscalPage } from './OwnerFiscalPage';
import { OwnerSupportPage } from './OwnerSupportPage';
import { ownerNavGroups, type OwnerPage } from './ownerWorkspaceConfig';
import { loadPosIntegration } from '../management/posIntegrationService';
import { supabase } from '../../lib/supabase';
import { applyAppFavicon, clearAppFavicon } from '../storefront/appFavicon';
import './operations.css';

type WorkspaceRole = 'restaurant_owner' | StaffWorkspaceRole;
type Membership = { tenant_id: string; role: WorkspaceRole };
type CachedWorkspace = { userId: string; membership: Membership | null; restaurantName: string | null; displayName: string };
let cachedWorkspace: CachedWorkspace | null = null;

const ownerPages = new Set<OwnerPage>([
  'dashboard', 'orders', 'menu', 'employees',
  'sales', 'reports', 'loyalty', 'settings', 'branding', 'fiscal', 'support',
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
  const [restaurantLogoUrl, setRestaurantLogoUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(cachedWorkspace?.displayName ?? 'Store Owner');
  const [ownerPage, setOwnerPage] = useState<OwnerPage>(() => ownerPageFromHash());
  const [visitedOwnerPages, setVisitedOwnerPages] = useState<Set<OwnerPage>>(() => new Set<OwnerPage>([ownerPageFromHash()]));
  const [posIntegrationActive, setPosIntegrationActive] = useState<boolean | null>(null);
  const [orderFilter, setOrderFilter] = useState<'active' | 'all'>('active');
  const [loading, setLoading] = useState(!cachedWorkspace);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!restaurantName) return;
    document.title = restaurantName;
  }, [restaurantName]);

  useEffect(() => {
    const syncOwnerPage = () => {
      const nextPage = ownerPageFromHash();
      setOwnerPage(nextPage);
      setVisitedOwnerPages(current => current.has(nextPage) ? current : new Set(current).add(nextPage));
    };
    if (!/^#\/?restaurant\//.test(window.location.hash)) {
      window.history.replaceState(null, '', normalizeAppBase(baseUrl) + window.location.search + '#restaurant/' + ownerPage);
    }
    window.addEventListener('hashchange', syncOwnerPage);
    window.addEventListener('popstate', syncOwnerPage);
    return () => {
      window.removeEventListener('hashchange', syncOwnerPage);
      window.removeEventListener('popstate', syncOwnerPage);
    };
  }, []);

  useEffect(() => {
    // Every tenant workspace (owner and staff) must use the favicon configured
    // for that tenant, not the last customer storefront visited in this browser.
    if (!supabase || !membership) return;
    const client = supabase;
    let active = true;
    const loadFavicon = async () => {
      const [{ data: assets, error: assetsError }, { data: favicon, error: faviconError }] = await Promise.all([
        client.from('tenant_storefronts')
          .select('logo_path').eq('tenant_id', membership.tenant_id).maybeSingle(),
        client.rpc('get_workspace_storefront_favicon', { p_tenant_id: membership.tenant_id }),
      ]);
      if (assetsError) throw assetsError;
      if (faviconError) throw faviconError;
      if (!active) return;
      const logoUrl = assets?.logo_path ? client.storage.from('storefront-logos').getPublicUrl(assets.logo_path).data.publicUrl : null;
      setRestaurantLogoUrl(logoUrl);
      const faviconPath = favicon && typeof favicon === 'object' && 'faviconPath' in favicon
        ? (favicon as { faviconPath?: unknown }).faviconPath : null;
      if (typeof faviconPath === 'string' && faviconPath) {
        const url = client.storage.from('storefront-logos').getPublicUrl(faviconPath).data.publicUrl;
        applyAppFavicon(url);
      } else {
        clearAppFavicon();
      }
    };
    const handleLogoUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantId?: string; url?: string }>).detail;
      if (detail?.tenantId === membership.tenant_id && detail.url) setRestaurantLogoUrl(detail.url);
    };
    const handleFaviconUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ tenantId?: string; url?: string }>).detail;
      if (detail?.tenantId === membership.tenant_id && detail.url) applyAppFavicon(detail.url);
    };
    window.addEventListener('web2table:owner-favicon-updated', handleFaviconUpdate);
    window.addEventListener('web2table:owner-logo-updated', handleLogoUpdate);
    void loadFavicon().catch(() => {
      // A missing favicon should not prevent the workspace from rendering.
    });
    return () => {
      active = false;
      window.removeEventListener('web2table:owner-favicon-updated', handleFaviconUpdate);
      window.removeEventListener('web2table:owner-logo-updated', handleLogoUpdate);
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
        const currentHostname = window.location.hostname.toLowerCase();
        let domainTenantId: string | null = null;
        if (currentHostname !== 'app.web2table.io') {
          const { data: domainMatches, error: domainResolveError } = await supabase.rpc('resolve_restaurant_by_domain', {
            p_hostname: currentHostname,
          });
          if (domainResolveError) throw domainResolveError;
          const matches = Array.isArray(domainMatches) ? domainMatches : [];
          domainTenantId = matches.length === 1 && typeof matches[0]?.id === 'string' ? matches[0].id : null;
          if (!domainTenantId) throw new Error('This restaurant domain is not active or verified.');
        }
        const selected = domainTenantId
          ? memberships.find(item => item.tenant_id === domainTenantId) ?? null
          : memberships.find(item => item.role === 'restaurant_owner') ?? memberships[0] ?? null;
        if (domainTenantId && !selected) throw new Error('Your account does not have access to this restaurant workspace.');
        let nextRestaurantName: string | null = null;
        if (selected) {
          const [{ data: tenant, error: tenantError }, { data: tenantDomain, error: domainError }] = await Promise.all([
            supabase.from('tenants').select('name').eq('id', selected.tenant_id).maybeSingle(),
            supabase.rpc('get_workspace_tenant_domain', { p_tenant_id: selected.tenant_id }),
          ]);
          if (tenantError) throw tenantError;
          if (domainError) throw domainError;
          nextRestaurantName = tenant?.name ?? null;
        }
        if (!active) return;
        const nextDisplayName = userDisplayName(authData.user, selected?.role === 'restaurant_owner' ? 'Store Owner' : selected?.role === 'dispatcher' ? 'Dispatcher' : selected?.role === 'rider' ? 'Rider' : selected?.role === 'cashier' ? 'Cashier' : 'Kitchen Staff');
        cachedWorkspace = { userId, membership: selected, restaurantName: nextRestaurantName, displayName: nextDisplayName };
        setMembership(selected);
        setRestaurantName(nextRestaurantName);
        setDisplayName(nextDisplayName);
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

  useEffect(() => {
    if (!membership || membership.role !== 'restaurant_owner') {
      setPosIntegrationActive(false);
      return;
    }

    let active = true;
    setPosIntegrationActive(null);
    void loadPosIntegration(membership.tenant_id)
      .then(status => {
        if (active) setPosIntegrationActive(status === 'active');
      })
      .catch(() => {
        // Fail closed: only show the POS section after the server confirms it is active.
        if (active) setPosIntegrationActive(false);
      });

    return () => { active = false; };
  }, [membership]);

  useEffect(() => {
    if (membership?.role !== 'restaurant_owner' || ownerPage !== 'fiscal' || posIntegrationActive !== false) return;
    window.location.hash = 'restaurant/dashboard';
  }, [membership, ownerPage, posIntegrationActive]);

  if (loading) return <main className="op-shell owner-workspace-loading" role="status" aria-live="polite"><p>Loading your workspace…</p></main>;
  if (error) return <main className="op-shell"><p className="op-eyebrow">WORKSPACE UNAVAILABLE</p><h1>We couldn't load your workspace</h1><p className="op-intro" role="alert">{error}</p></main>;
  if (!membership) return <main className="op-shell">
    <p className="op-eyebrow">RESTAURANT WORKSPACE</p><h1>No restaurant assigned yet</h1>
    <p className="op-intro">Your account is signed in, but it has no active restaurant membership. A System Administrator must create a restaurant and invite its owner before restaurant workspaces can be used. Staff accounts must be invited by that restaurant's owner.</p>
  </main>;

  if (membership.role !== 'restaurant_owner') {
    return <StaffOperationalWorkspace tenantId={membership.tenant_id} role={membership.role} restaurantName={restaurantName} />;
  }

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) return;
    window.location.assign(new URL('account/sign-in', window.location.origin + normalizeAppBase(baseUrl)).toString());
  };
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

  const visibleOwnerNavGroups = ownerNavGroups
    .map(group => ({
      ...group,
      items: group.items.filter(item => item.key !== 'fiscal' || posIntegrationActive === true),
    }))
    .filter(group => group.items.length > 0);

  const renderOwnerPage = (page: OwnerPage) => {
    if (page === 'orders') return <OwnerOrdersPage tenantId={membership.tenant_id} filter={orderFilter} onFilterChange={setOrderFilter} />;
    if (page === 'menu') return <OwnerMenuPage tenantId={membership.tenant_id} restaurantName={restaurantName} />;
    if (page === 'settings') return <OwnerStoreSettingsPage tenantId={membership.tenant_id} />;
    if (page === 'branding') return <OwnerBrandingPage tenantId={membership.tenant_id} restaurantName={restaurantName} />;
    if (page === 'employees') return <OwnerEmployeesPage tenantId={membership.tenant_id} />;
    if (page === 'loyalty') return <OwnerLoyaltyPage tenantId={membership.tenant_id} />;
    if (page === 'sales' || page === 'reports') return <OwnerReportingPage tenantId={membership.tenant_id} page={page} />;
    if (page === 'fiscal') return <OwnerFiscalPage />;
    if (page === 'support') return <OwnerSupportPage />;
    return <OwnerSectionPage page={page} tenantId={membership.tenant_id} restaurantName={restaurantName} onNavigate={navigateOwnerPage} />;
  };

  return <OwnerAppShell baseUrl={baseUrl} groups={visibleOwnerNavGroups} page={ownerPage} displayName={displayName} restaurantLogoUrl={restaurantLogoUrl} restaurantName={restaurantName} onNavigate={navigateOwnerPage} onSignOut={signOut}>
    {visibleOwnerNavGroups.flatMap(group => group.items).filter(item => visitedOwnerPages.has(item.key)).map(item => (
      <div key={item.key} style={{ display: ownerPage === item.key ? 'contents' : 'none' }} aria-hidden={ownerPage !== item.key}>
        {renderOwnerPage(item.key)}
      </div>
    ))}
    {visitedOwnerPages.has('support') && (
      <div key="support" style={{ display: ownerPage === 'support' ? 'contents' : 'none' }} aria-hidden={ownerPage !== 'support'}>
        <OwnerSupportPage />
      </div>
    )}
  </OwnerAppShell>;
}
