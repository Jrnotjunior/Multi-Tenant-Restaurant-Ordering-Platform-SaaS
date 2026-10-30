import type { ReactNode } from 'react';

export function OwnerFiscalPage() {
  const items: Array<{ title: string; detail: string; status: string }> = [
    { title: 'Taxpayer profile', detail: 'Registered taxpayer identity, TIN, address, and branch details.', status: 'API integration required' },
    { title: 'Tax policy', detail: 'Reviewed, effective-dated tax treatment for this branch.', status: 'Not enabled' },
    { title: 'Invoice controls', detail: 'Controlled invoice series and immutable transaction references.', status: 'Not enabled' },
    { title: 'Receipt and X/Z readings', detail: 'Operational receipts and shift readings reconciled to finalized POS records.', status: 'Not enabled' },
  ];

  return <main className="owner-content">
    <div className="owner-page-heading">
      <div><p className="owner-page-eyebrow">OWNER CONTROLS</p><h1>Fiscal &amp; POS</h1><p>Business and fiscal configuration belongs here, separate from cashier workflows.</p></div>
      <span className="owner-page-status">Setup in progress</span>
    </div>
    <section className="owner-fiscal-notice" role="status">
      <strong>Fiscal issuance is not enabled.</strong>
      <p>This workspace is the intended home for taxpayer and POS configuration. The owner-scoped API and branch selection still need to be connected here before settings can be edited. No authorization status or tax treatment can be granted from this screen.</p>
    </section>
    <div className="owner-fiscal-grid">
      {items.map(item => <article className="owner-fiscal-card" key={item.title}>
        <div><h2>{item.title}</h2><p>{item.detail}</p></div>
        <span>{item.status}</span>
      </article>)}
    </div>
  </main>;
}
