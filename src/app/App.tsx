import { useEffect, useState } from 'react';
import { pathFor, storefrontSlugFromPath, viewForPath, type View } from './routes';
import { PrivilegedGate } from '../features/auth/PrivilegedGate';
import { Storefront } from '../features/storefront/Storefront';
import { supabase } from '../lib/supabase';

const protectedViews = {
  restaurant: {
    label: 'Restaurant Workspace',
    title: 'Restaurant management',
    body: 'Owners and authorized staff will manage their restaurant, kitchen, riders, inventory, recipes and loyalty here.',
  },
  admin: {
    label: 'System Administration',
    title: 'Platform administration',
    body: 'Tenant onboarding, subscription management and platform security require a verified system administrator.',
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

  const details = protectedViews[view];
  const workspaceContent = <main className="content">
    <p className="eyebrow">WEB2TABLE · PHILIPPINES</p>
    <h1>{details.title}</h1>
    <p className="intro">{details.body}</p>
    <section className="panel">
      <div className="status-line"><span className="status-dot" /><strong>Protected workspace · under development</strong></div>
      <p>Restaurant and platform administration are not public storefront features. Authentication, MFA, tenant membership and verified permissions are required, and live operations are not enabled yet.</p>
      <span className="status-pill">{supabase ? 'Supabase connected · invitation-only access' : 'Supabase not configured'}</span>
    </section>
  </main>;

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
        {(['restaurant', 'admin'] as const).map((item) => <a key={item}
          href={pathFor(item, baseUrl)} aria-current={view === item ? 'page' : undefined}
          onClick={(event) => { event.preventDefault(); navigate(item); }}>{protectedViews[item].label}</a>)}
      </nav>
      <PrivilegedGate mode={view}>{workspaceContent}</PrivilegedGate>
    </div>
    <footer>Web2Table · Secure development workspace · No live orders</footer>
  </div>;
}
