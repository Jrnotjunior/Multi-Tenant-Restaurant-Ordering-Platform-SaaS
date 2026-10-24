import { useEffect, useState } from 'react';
import { pathFor, storefrontSlugFromPath, viewForPath, type View } from './routes';
import { PrivilegedGate } from '../features/auth/PrivilegedGate';
import { Storefront } from '../features/storefront/Storefront';
import { StorefrontDirectory } from '../features/storefront/StorefrontDirectory';
import { AccountAuthPage } from '../features/storefront/AccountAuthPage';
import { RestaurantWorkspace } from '../features/operations/RestaurantWorkspace';

const protectedViews = {
  restaurant: {
    label: 'Restaurant Workspace',
    title: 'Restaurant management',
    body: 'Owners and authorized staff will manage their restaurant, kitchen, riders, inventory, recipes and loyalty here.',
  },
};

export function App() {
  const baseUrl = import.meta.env.BASE_URL;
  const [pathname, setPathname] = useState(window.location.pathname);
  const view = viewForPath(pathname, baseUrl);
  const cleanPath = pathname.replace(/\/+$/, '');
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const authMode = cleanPath === cleanBase + '/account/sign-up' ? 'sign-up' : cleanPath === cleanBase + '/account/sign-in' ? 'sign-in' : null;

  useEffect(() => {
    const syncHistory = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncHistory);
    return () => window.removeEventListener('popstate', syncHistory);
  }, []);

  function navigate(next: View) {
    const path = pathFor(next, baseUrl);
    window.history.pushState({}, '', path);
    setPathname(path);
    window.scrollTo(0, 0);
  }

  if (authMode) return <AccountAuthPage mode={authMode} baseUrl={baseUrl} restaurantSlug={new URLSearchParams(window.location.search).get('restaurant')} />;

  // The homepage of a restaurant ordering site is its menu, not an app dashboard.
  // For the public preview, both / and /order display a clearly labeled sample restaurant.
  if (view === 'home' || view === 'order') {
    const requestedSlug = storefrontSlugFromPath(pathname, baseUrl);
    if (requestedSlug === null) return <StorefrontDirectory baseUrl={baseUrl} />;
    return <Storefront key={requestedSlug} baseUrl={baseUrl} requestedSlug={requestedSlug} />;
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
