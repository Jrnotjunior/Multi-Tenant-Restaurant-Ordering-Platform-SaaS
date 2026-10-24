import type { OwnerPage } from './ownerWorkspaceConfig';

type Props = { filter: 'active' | 'all'; onFilterChange: (filter: 'active' | 'all') => void };

export function OwnerOrdersPage({ filter, onFilterChange }: Props) {
  return <main className="owner-content">
    <nav className="owner-order-tabs" aria-label="Order filter">
      <button className={filter === 'active' ? 'active' : ''} onClick={() => onFilterChange('active')}>Active (—)</button>
      <button className={filter === 'all' ? 'active' : ''} onClick={() => onFilterChange('all')}>All (—)</button>
    </nav>
    <section className="owner-order-stats">
      <article><div><h2>New Orders</h2><p>New customer orders waiting for cashier review</p></div><span>—</span></article>
      <article><div><h2>In the Kitchen</h2><p>Orders being prepared</p></div><span>—</span></article>
      <article><div><h2>Ready</h2><p>Ready for pickup or dine-in</p></div><span>—</span></article>
      <article><div><h2>Completed</h2><p>Finished orders</p></div><span>—</span></article>
    </section>
    <section className="owner-orders-empty">
      <h2>{filter === 'active' ? 'Active orders' : 'All orders'}</h2>
      <p>Live order counts will appear here when the secure tenant-scoped order service is connected. Counts are not fabricated.</p>
    </section>
  </main>;
}
