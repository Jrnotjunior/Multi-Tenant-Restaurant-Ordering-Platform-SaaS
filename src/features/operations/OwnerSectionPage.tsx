import type { OwnerPage } from './ownerWorkspaceConfig';
import { ownerPageTitles } from './ownerWorkspaceConfig';

type Props = { page: OwnerPage; restaurantName: string | null; onNavigate: (page: OwnerPage) => void };

export function OwnerSectionPage({ page, restaurantName, onNavigate }: Props) {
  if (page === 'dashboard') return <main className="owner-content">
    <h1>{restaurantName ?? 'Restaurant'} Dashboard</h1>
    <section className="owner-order-stats">
      <article><div><h2>Orders Today</h2><p>Current restaurant orders</p></div><span>—</span></article>
      <article><div><h2>Sales Today</h2><p>Confirmed sales total</p></div><span>—</span></article>
      <article><div><h2>Menu Items</h2><p>Restaurant menu</p></div><span>—</span></article>
      <article><div><h2>Team Members</h2><p>Active restaurant staff</p></div><span>—</span></article>
    </section>
    <section className="owner-orders-empty"><h2>Restaurant overview</h2><p>Choose a section in the sidebar to manage restaurant operations.</p></section>
  </main>;

  return <main className="owner-content"><section className="owner-orders-empty">
    <h1>{ownerPageTitles[page]}</h1>
    <p>This section is not yet connected to its tenant- and branch-scoped service. It will remain unavailable rather than showing fabricated records.</p>
    {page === 'employees' && <button onClick={() => onNavigate('settings')}>Open store settings</button>}
  </section></main>;
}
