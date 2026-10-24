import { useState } from 'react';
import './operations.css';

export type StaffWorkspaceRole = 'cashier' | 'kitchen' | 'dispatcher' | 'rider';

const roleCopy: Record<StaffWorkspaceRole, { eyebrow: string; title: string; intro: string; sections: { title: string; description: string; status: string }[] }> = {
  cashier: {
    eyebrow: 'FRONT OF HOUSE',
    title: 'Cashier workspace',
    intro: 'Review incoming restaurant orders and keep order and payment status clear.',
    sections: [
      { title: 'New orders', description: 'Orders waiting for restaurant review will appear here.', status: 'Order inbox not connected yet' },
      { title: 'Payment status', description: 'Payment confirmation will be shown here when the payment integration is enabled.', status: 'Payments not enabled' },
      { title: 'Recent orders', description: 'A branch-scoped history of orders will appear here.', status: 'Waiting for live orders' },
    ],
  },
  kitchen: {
    eyebrow: 'KITCHEN OPERATIONS',
    title: 'Kitchen display',
    intro: 'Keep preparation work organized and update tickets as the kitchen progresses.',
    sections: [
      { title: 'To prepare', description: 'Accepted orders will appear here when the order inbox is connected.', status: 'No live tickets' },
      { title: 'Preparing', description: 'Tickets marked as in progress will be grouped here.', status: 'Queue not connected yet' },
      { title: 'Ready for dispatch', description: 'Completed orders will appear here for handoff.', status: 'Waiting for kitchen events' },
    ],
  },
  dispatcher: {
    eyebrow: 'DELIVERY OPERATIONS',
    title: 'Dispatch workspace',
    intro: 'Coordinate ready orders, rider assignments, and delivery handoffs for your branch.',
    sections: [
      { title: 'Ready to dispatch', description: 'Kitchen-completed orders will appear here.', status: 'No ready orders' },
      { title: 'Rider assignments', description: 'Available riders and their active assignments will appear here.', status: 'Assignments not connected yet' },
      { title: 'Active deliveries', description: 'Track dispatched orders through delivery completion.', status: 'Waiting for delivery data' },
    ],
  },
  rider: {
    eyebrow: 'RIDER WORKSPACE',
    title: 'My deliveries',
    intro: 'Review your assigned deliveries and record progress from pickup to completion.',
    sections: [
      { title: 'Assigned to me', description: 'Deliveries assigned to your account will appear here.', status: 'No assigned deliveries' },
      { title: 'Pickup', description: 'Pickup details and handoff confirmation will be shown for assigned orders.', status: 'Waiting for assignments' },
      { title: 'On the way', description: 'Active deliveries and customer delivery instructions will appear here.', status: 'No active deliveries' },
    ],
  },
};

export function OperationalDashboard({ role, restaurantName }: { role: StaffWorkspaceRole; restaurantName?: string | null }) {
  const [activeSection, setActiveSection] = useState(0);
  const copy = roleCopy[role];
  const nav = role === 'cashier'
    ? ['Overview', 'New orders', 'Recent orders']
    : role === 'kitchen'
      ? ['Overview', 'To prepare', 'Ready for dispatch']
      : role === 'dispatcher'
        ? ['Overview', 'Ready to dispatch', 'Active deliveries']
        : ['Overview', 'Assigned to me', 'Delivery history'];

  return <main className="op-shell">
    <header className="op-heading">
      <div>
        <p className="op-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="op-intro">{copy.intro}</p>
        {restaurantName && <p className="op-tenant-name">{restaurantName}</p>}
      </div>
      <span className="op-role">{role.replace('_', ' ')}</span>
    </header>

    <nav className="op-tabs" aria-label="Workspace sections">
      {nav.map((item, index) => <button type="button" key={item}
        aria-current={activeSection === index ? 'page' : undefined}
        className={activeSection === index ? 'is-active' : ''}
        onClick={() => setActiveSection(index)}>{item}</button>)}
    </nav>

    <section className="op-summary-grid" aria-label="Operational summary">
      <article><span>Open work</span><strong>—</strong><small>Waiting for live order data</small></article>
      <article><span>In progress</span><strong>—</strong><small>Waiting for operational events</small></article>
      <article><span>Completed today</span><strong>—</strong><small>Metrics will appear when connected</small></article>
    </section>

    <section className="op-work-panel" aria-live="polite">
      <div className="op-panel-heading">
        <div><p className="op-eyebrow">WORK QUEUE</p><h2>{activeSection === 0 ? 'Your workspace' : nav[activeSection]}</h2></div>
        <span className="op-status">Not connected</span>
      </div>
      {activeSection === 0
        ? <div className="op-empty">
            <span className="op-empty-mark" aria-hidden="true">✓</span>
            <h3>Workspace ready</h3>
            <p>Your role-specific workspace is in place. Live orders and actions will appear after the order workflow and branch-scoped permissions are connected.</p>
          </div>
        : <div className="op-queue-list">
            {copy.sections.filter((_, index) => index === Math.min(activeSection - 1, copy.sections.length - 1)).map(section =>
              <article key={section.title}>
                <div><h3>{section.title}</h3><p>{section.description}</p></div>
                <span>{section.status}</span>
              </article>
            )}
          </div>}
    </section>
    <p className="op-footnote">This screen does not create, change, or complete orders yet. All operational actions will be enforced by the server for your tenant, branch, and role.</p>
  </main>;
}
