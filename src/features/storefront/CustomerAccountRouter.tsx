import { useEffect, useState } from 'react';
import { CustomerAccountPage } from './CustomerAccountPage';
import { CustomerOrderHistoryPage } from './CustomerOrderHistoryPage';
import { CustomerSavedAddressesPage } from './CustomerSavedAddressesPage';
import { CustomerLoyaltyPage } from './CustomerLoyaltyPage';
import { LegalPoliciesPage } from './LegalPoliciesPage';
import { CustomerAccountShell } from './CustomerAccountShell';

type AccountRoute = 'home' | 'orders' | 'addresses' | 'loyalty' | 'legal' | 'privacy' | 'terms' | 'refunds';

function routeFromLocation(): AccountRoute {
  const fragment = window.location.hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  if (fragment === 'account/orders') return 'orders';
  if (fragment === 'account/addresses') return 'addresses';
  if (fragment === 'account/loyalty') return 'loyalty';
  if (fragment === 'account/legal') return 'legal';
  if (fragment === 'account/legal/privacy') return 'privacy';
  if (fragment === 'account/legal/terms') return 'terms';
  if (fragment === 'account/legal/refunds') return 'refunds';
  return 'home';
}

/** Keeps the account shell and visited screens mounted during hash navigation. */
export function CustomerAccountRouter({ baseUrl }: { baseUrl: string }) {
  const [activeRoute, setActiveRoute] = useState<AccountRoute>(() => routeFromLocation());
  const [visitedRoutes, setVisitedRoutes] = useState<Set<AccountRoute>>(() => new Set([routeFromLocation()]));

  useEffect(() => {
    const syncRoute = () => {
      const next = routeFromLocation();
      setActiveRoute(next);
      setVisitedRoutes(current => current.has(next) ? current : new Set(current).add(next));
    };
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('popstate', syncRoute);
    return () => {
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('popstate', syncRoute);
    };
  }, []);

  const visible = (route: AccountRoute) => activeRoute === route;
  const styleFor = (route: AccountRoute) => ({ display: visible(route) ? undefined : 'none' });

  return <CustomerAccountShell baseUrl={baseUrl}>
    {visitedRoutes.has('home') && <div style={styleFor('home')} aria-hidden={!visible('home')}><CustomerAccountPage baseUrl={baseUrl} /></div>}
    {visitedRoutes.has('orders') && <div style={styleFor('orders')} aria-hidden={!visible('orders')}><CustomerOrderHistoryPage baseUrl={baseUrl} /></div>}
    {visitedRoutes.has('addresses') && <div style={styleFor('addresses')} aria-hidden={!visible('addresses')}><CustomerSavedAddressesPage baseUrl={baseUrl} /></div>}
    {visitedRoutes.has('loyalty') && <div style={styleFor('loyalty')} aria-hidden={!visible('loyalty')}><CustomerLoyaltyPage baseUrl={baseUrl} /></div>}
    {(['legal', 'privacy', 'terms', 'refunds'] as const).some(route => visitedRoutes.has(route)) && <div style={{ display: ['legal', 'privacy', 'terms', 'refunds'].includes(activeRoute) ? undefined : 'none' }} aria-hidden={!['legal', 'privacy', 'terms', 'refunds'].includes(activeRoute)}>
      <LegalPoliciesPage route={activeRoute === 'privacy' ? '#privacy' : activeRoute === 'terms' ? '#terms' : activeRoute === 'refunds' ? '#refunds' : '#legal'} />
    </div>}
  </CustomerAccountShell>;
}
