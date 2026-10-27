import { useEffect, useState } from 'react';
import { isStorefrontCartPath, pathFor, routePathFromLocation, storefrontSlugFromPath, viewForPath, type View } from './routes';
import { PrivilegedGate } from '../features/auth/PrivilegedGate';
import { Storefront } from '../features/storefront/Storefront';
import { AccountAuthPage } from '../features/storefront/AccountAuthPage';
import { CustomerOrderHistoryPage } from '../features/storefront/CustomerOrderHistoryPage';
import { CustomerAccountPage } from '../features/storefront/CustomerAccountPage';
import { CustomerSavedAddressesPage } from '../features/storefront/CustomerSavedAddressesPage';
import { CustomerLoyaltyPage } from '../features/storefront/CustomerLoyaltyPage';
import { LegalPoliciesPage } from '../features/storefront/LegalPoliciesPage';
import { RestaurantWorkspace } from '../features/operations/RestaurantWorkspace';
import { restoreAppFavicon } from '../features/storefront/appFavicon';

const protectedViews = {
  restaurant: {
    label: 'Restaurant Workspace',
    title: 'Restaurant management',
    body: 'Owners and authorized staff will manage their restaurant, kitchen, riders, inventory, recipes and loyalty here.',
  },
};

export function App() {
  const baseUrl = import.meta.env.BASE_URL;

  useEffect(() => { restoreAppFavicon(); }, []);
  const [locationKey, setLocationKey] = useState(window.location.pathname + window.location.hash);
  const pathname = routePathFromLocation(window.location.pathname, window.location.hash, baseUrl);
  const view = viewForPath(pathname, baseUrl);
  const cleanPath = pathname.replace(/\/+$/, '');
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const authMode = cleanPath === cleanBase + '/account/sign-up' ? 'sign-up' : cleanPath === cleanBase + '/account/sign-in' ? 'sign-in' : null;

  useEffect(() => {
    const syncHistory = () => setLocationKey(window.location.pathname + window.location.hash);
    window.addEventListener('popstate', syncHistory);
    window.addEventListener('hashchange', syncHistory);
    return () => { window.removeEventListener('popstate', syncHistory); window.removeEventListener('hashchange', syncHistory); };
  }, []);

  function navigate(next: View) {
    const path = pathFor(next, baseUrl);
    window.history.pushState({}, '', path);
    setLocationKey(window.location.pathname + window.location.hash);
    window.scrollTo(0, 0);
  }

  void locationKey;

  if (authMode) return <AccountAuthPage mode={authMode} baseUrl={baseUrl} restaurantSlug={new URLSearchParams(window.location.search).get('restaurant')} />;

  // Legal hashes must take precedence over account routes so footer/content policy
  // links actually open the policy page instead of rendering the account dashboard again.
  const legalRoute = ['#legal', '#privacy', '#terms', '#refunds'].includes(window.location.hash) ? window.location.hash : null;
  if (legalRoute) return <LegalPoliciesPage route={legalRoute} />;

  if (cleanPath === cleanBase + '/account') return <CustomerAccountPage baseUrl={baseUrl} />;
  if (cleanPath === cleanBase + '/account/addresses') return <CustomerSavedAddressesPage baseUrl={baseUrl} />;
  if (cleanPath === cleanBase + '/account/loyalty') return <CustomerLoyaltyPage baseUrl={baseUrl} />;
  if (cleanPath === cleanBase + '/account/orders') return <CustomerOrderHistoryPage baseUrl={baseUrl} />;

  // PayMongo returns directly to the existing restaurant tracking route. Do not render a duplicate payment tracking page here.

  // The homepage of a restaurant ordering site is its menu, not an app dashboard.
  // The root storefront opens the published restaurant menu directly; do not show a separate restaurant directory.
  if (view === 'home' || view === 'order') {
    const requestedSlug = storefrontSlugFromPath(pathname, baseUrl);
    return <Storefront key={requestedSlug ?? 'default'} baseUrl={baseUrl} requestedSlug={requestedSlug} initialCartPage={isStorefrontCartPath(pathname, baseUrl)} />;
  }

  // The System Admin lives in its established, separate repository.
  // We link there instead of duplicating its implementation or routing its
  // privileged authentication through the restaurant-owner workspace.
  if (view === 'admin') {
    return <div className="app">
      <header className="topbar"><a className="brand" href={pathFor('home',baseUrl)}>
        <span className="brandmark">W2T</span> Web2Table</a></header>
      <main className="content">
        <p className="eyebrow">WEB2TABLE · SYSTEM ADMIN</p>
        <h1>System administration has its own application.</h1>
        <p className="intro">Restaurant platform administration is managed separately from the customer storefront and Restaurant Owner workspace. Sign-in uses its own protected application and the new Web2Table authorization checks.</p>
        <section className="panel">
          <p>Existing administrator accounts from the older identity project are not automatically authorized in Web2Table. A verified, approved administrator identity and MFA are required.</p>
          <a className="status-pill" href="https://admin.web2table.io/">Open Web2Table System Admin ↗</a>
        </section>
      </main>
    </div>;
  }

  // Restaurant Owner has its own application shell. Do not wrap it in the legacy
  // platform workspace navigation/header/footer.
  return <PrivilegedGate mode={view}><RestaurantWorkspace baseUrl={baseUrl} /></PrivilegedGate>;
}
