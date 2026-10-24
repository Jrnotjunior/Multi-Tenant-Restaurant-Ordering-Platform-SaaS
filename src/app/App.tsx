import { useEffect, useState } from 'react';
import { pathFor, storefrontSlugFromPath, viewForPath, type View } from './routes';
import { PrivilegedGate } from '../features/auth/PrivilegedGate';
import { Storefront } from '../features/storefront/Storefront';
import { OwnerDashboard } from '../features/management/OwnerDashboard';

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

  // The homepage of a restaurant ordering site is its menu, not an app dashboard.
  // For the public preview, both / and /order display a clearly labeled sample restaurant.
  if (view === 'home' || view === 'order') {
    return <Storefront key={storefrontSlugFromPath(pathname, baseUrl) ?? 'sample'} baseUrl={baseUrl} requestedSlug={storefrontSlugFromPath(pathname, baseUrl)} />;
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
          <p>Existing administrator accounts from the older identity project are not automatically authorized in Web2Table V10. A verified, approved administrator identity and MFA are required.</p>
          <a className="status-pill" href="https://jrnotjunior.github.io/web2table-system-admin/">Open Web2Table System Admin ↗</a>
        </section>
      </main>
    </div>;
  }

  const workspaceContent = <OwnerDashboard baseUrl={baseUrl} />;

  return <div className="app">
    <header className="topbar">
      <a className="brand" href={pathFor('home', baseUrl)} onClick={(event) => { event.preventDefault(); navigate('home'); }}>
        <span className="brandmark">W2T</span> Web2Table
      </a>
      <span className="environment">SECURE WORKSPACE · V10</span>
    </header>
    <div className="workspace">
      <nav className="sidebar" aria-label="Platform areas">
        <p className="nav-heading">WORKSPACES</p>
        <a href={pathFor('order', baseUrl)} onClick={(event) => { event.preventDefault(); navigate('order'); }}>← Customer menu</a>
        {(['restaurant'] as const).map((item) => <a key={item}
          href={pathFor(item, baseUrl)} aria-current={view === item ? 'page' : undefined}
          onClick={(event) => { event.preventDefault(); navigate(item); }}>{protectedViews[item].label}</a>)}
      </nav>
      <PrivilegedGate mode={view}>{workspaceContent}</PrivilegedGate>
    </div>
    <footer>Web2Table · Secure development workspace · No live orders</footer>
  </div>;
}
