import { useState } from 'react';
import { supabase } from '../lib/supabase';

type View = 'home' | 'order' | 'restaurant' | 'admin';
const views: Record<View, { label: string; title: string; body: string }> = {
  home: { label: 'Overview', title: 'Restaurant ordering, thoughtfully built.', body: 'Web2Table helps restaurants operate branded ordering websites with kitchen, dispatch and delivery workflows. This is the initial platform foundation.' },
  order: { label: 'Customer Ordering', title: 'Customer ordering', body: 'Delivery-only ordering, guest checkout, registration and payment workflows will be built and verified in subsequent phases.' },
  restaurant: { label: 'Restaurant Workspace', title: 'Restaurant management', body: 'Restaurant owners and invited staff will manage menus, orders, kitchen, riders, inventory, recipes and loyalty here.' },
  admin: { label: 'System Administration', title: 'Platform administration', body: 'Tenant onboarding, subscription management, support operations and security controls require privileged authentication.' },
};
function currentView(): View {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/order') return 'order';
  if (pathname === '/restaurant') return 'restaurant';
  if (pathname === '/admin') return 'admin';
  return 'home';
}
export function App() {
  const [view, setView] = useState<View>(currentView);
  function navigate(next: View) {
    const path = next === 'home' ? '/' : '/' + next;
    window.history.pushState({}, '', path);
    setView(next);
  }
  window.onpopstate = () => setView(currentView());
  return <div className="app">
    <header className="topbar"><a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('home'); }}><span className="brandmark">W2T</span> Web2Table</a><span className="environment">FOUNDATION · V10</span></header>
    <div className="workspace"><nav className="sidebar" aria-label="Platform areas"><p className="nav-heading">PLATFORM</p>{(Object.keys(views) as View[]).map((item) => <a key={item} href={item === 'home' ? '/' : '/' + item} aria-current={view === item ? 'page' : undefined} onClick={(e) => { e.preventDefault(); navigate(item); }}>{views[item].label}</a>)}</nav>
    <main className="content"><p className="eyebrow">WEB2TABLE · PHILIPPINES</p><h1>{views[view].title}</h1><p className="intro">{views[view].body}</p><section className="panel" aria-label="Development status"><div className="status-line"><span className="status-dot" /> <strong>W2T-001: Application foundation</strong></div><p>This page is a scaffold. Live ordering and management actions are disabled until the database, authentication and authorization controls are implemented and tested.</p><span className="status-pill">{supabase ? 'Supabase configured · authorization not implemented' : 'Supabase not configured · offline scaffold'}</span></section><div className="feature-grid"><article><h2>Tenant isolation</h2><p>Tenant and branch boundaries, RLS and server-validated access will protect each restaurant.</p></article><article><h2>Secure ordering</h2><p>Server-validated menus, checkout and PayMongo webhook processing will drive real orders.</p></article><article><h2>Delivery operations</h2><p>Kitchen, dispatch, rider tracking and location services will share one order lifecycle.</p></article></div></main></div>
    <footer>Web2Table · Development foundation · Not a live ordering website</footer>
  </div>;
}
