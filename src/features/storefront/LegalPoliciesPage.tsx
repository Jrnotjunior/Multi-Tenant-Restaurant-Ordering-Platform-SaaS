import type { ReactNode } from 'react';
import './storefront.css';
import './LegalPoliciesPage.css';


const WEB2TABLE_LOGO = 'https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png';

function CustomerPageShell({ children }: { children: ReactNode }) {
  const base = import.meta.env.BASE_URL;
  return <div className="sf-storefront sf-account-page sf-legal-shell">
    <a className="sf-skip-link" href="#customer-legal-title">Skip to page content</a>
    <header className="sf-header">
      <div className="sf-header-inner">
        <a href={base} className="sf-logo" aria-label="Web2Table storefront">
          <img className="sf-logo-image" src={WEB2TABLE_LOGO} alt="Web2Table" width={46} height={46} />
        </a>
        <nav className="sf-header-actions" aria-label="Store navigation">
          <a href={base} className="sf-track-order-button sf-account-storefront-link" aria-label="Back to storefront" title="Storefront">Storefront</a>
          <a href={base + 'account'} className="sf-account-button" aria-label="Open customer account" title="My account">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.5-3.8 3.1-5.7 7-5.7s6.5 1.9 7 5.7"/></svg>
          </a>
        </nav>
      </div>
    </header>
    <main className="sf-main sf-account-main sf-legal-main">{children}</main>
    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <section className="sf-footer-social-section" aria-label="Follow Web2Table">
          <h2 className="sf-footer-heading">Follow Us</h2>
          <nav className="sf-footer-socials" aria-label="Social media links">
            <span className="sf-footer-social-link is-disabled" aria-label="Facebook not configured" aria-disabled="true"><span aria-hidden="true">f</span></span>
            <span className="sf-footer-social-link is-disabled" aria-label="Instagram not configured" aria-disabled="true"><span aria-hidden="true">◎</span></span>
            <span className="sf-footer-social-link is-disabled" aria-label="TikTok not configured" aria-disabled="true"><span aria-hidden="true">♪</span></span>
          </nav>
        </section>
        <div className="sf-footer-bottom">
          <small>© {new Date().getFullYear()} All rights reserved.</small>
          <a className="sf-footer-powered-by" href="https://web2table.io" target="_blank" rel="noreferrer">Powered by <strong>Web2Table</strong></a>
        </div>
      </div>
    </footer>
  </div>;
}

const policies = [
  { href: '#privacy', title: 'Privacy Notice', description: 'Learn how personal information is collected, used, and protected.', icon: 'shield' },
  { href: '#terms', title: 'Terms & Conditions', description: 'Review the terms for using this storefront and placing orders.', icon: 'document' },
  { href: '#refunds', title: 'Refund & Cancellation Policy', description: 'Understand order cancellation, refund requests, and order issues.', icon: 'refresh' },
] as const;

function PolicyIcon({ type }: { type: (typeof policies)[number]['icon'] }) {
  if (type === 'shield') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></svg>;
  if (type === 'document') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4M9 12h6M9 16h6" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2" /></svg>;
}

export function LegalPoliciesPage({ route = '#legal' }: { route?: string }) {
  const details = {
    '#privacy': {
      eyebrow: 'Data Privacy', title: 'Privacy Notice',
      intro: 'This notice explains how the restaurant operating this storefront and Web2Table process personal information when you browse, create an account, or place an order.',
      sections: [
        ['Who is responsible for your information?', 'The restaurant is responsible for its restaurant operations and order fulfilment. Web2Table provides the online ordering software and supporting services. Each party handles information according to its role and applicable law.'],
        ['What information may be collected?', 'Depending on how you use the service, this may include your name, phone number, email address, account information, order items and status, delivery details, and payment status or transaction references. Payment credentials are handled by the applicable payment provider.'],
        ['Why is information processed?', 'Information is used to create and secure accounts, receive and fulfil orders, communicate about orders, process and reconcile payments, prevent misuse, and operate and improve the service.'],
        ['Retention and security', 'Information is retained for as long as reasonably necessary for ordering, account, payment, security, operational, and legal purposes. Access should be restricted to authorized people and service providers who need it for those purposes.'],
        ['Your privacy rights', 'Under the Data Privacy Act of 2012 (Republic Act No. 10173), you may have rights to be informed, access or correct personal information, and exercise other rights subject to applicable conditions and limitations. Contact the restaurant using the contact details it provides for privacy requests.'],
      ],
    },
    '#terms': {
      eyebrow: 'Storefront Terms', title: 'Terms & Conditions',
      intro: 'These terms apply when you browse this ordering storefront or place an order with the restaurant. By submitting an order, you confirm that you have read these terms. They do not remove consumer rights that cannot be excluded under applicable law.',
      sections: [
        ['Products, prices, and availability', 'Menu descriptions, images, prices, options, and availability may change. Review the items, quantities, selected options, fees, and total shown at checkout before submitting your order.'],
        ['Orders and fulfilment', 'Submitting an order sends a request to the restaurant; fulfilment depends on item availability and restaurant acceptance. Follow the pickup or delivery instructions shown during ordering and provide accurate contact and fulfilment information.'],
        ['Payments', 'Use the payment methods offered at checkout. Payment status is determined by the ordering flow and payment provider confirmation. Do not send full card details, security codes, or passwords in support messages.'],
        ['Food information and special instructions', 'Review menu and allergen information carefully. Contact the restaurant before ordering if you have a critical allergy or dietary concern. Special instructions may not be possible unless the restaurant confirms them.'],
        ['Cancellations, refunds, and consumer rights', 'Cancellation and refund requests are handled under the Refund & Cancellation Policy and applicable law. Nothing in these terms excludes rights, remedies, or liability that cannot lawfully be excluded.'],
        ['Personal information and service availability', 'Personal information is handled as described in the Privacy Notice. The storefront may occasionally be unavailable or affected by technical issues; contact the restaurant with your order reference if an issue affects an order or payment.'],
      ],
    },
    '#refunds': {
      eyebrow: 'Order Support', title: 'Refund & Cancellation Policy',
      intro: 'This policy explains how cancellation and refund requests are handled. Outcomes depend on order status, the issue reported, payment method, and applicable law. Nothing here removes a consumer right or remedy that cannot legally be excluded.',
      sections: [
        ['How to request help', 'Contact the restaurant promptly using its published contact details. Include your order reference and a description of the issue. Never send full payment-card numbers, security codes, passwords, or other sensitive credentials.'],
        ['Cancellation requests', 'Request cancellation as soon as possible. Whether an order can be cancelled depends on its preparation and fulfilment status and applicable law. A change of mind does not automatically qualify for a refund, but mandatory consumer rights remain available.'],
        ['Unavailable or unfulfilled orders', 'If the restaurant cannot fulfil an order, it should inform you and work with you on an appropriate resolution, including a refund where applicable. Do not place a duplicate order solely because a status is unclear; contact the restaurant first.'],
        ['Incorrect, missing, or quality issues', 'Contact the restaurant promptly with the order reference and affected items. The restaurant will review the issue and determine an appropriate resolution, subject to applicable law; this may include a refund, replacement, or another agreed solution.'],
        ['Refund timing', 'Approved refunds are returned through the applicable payment method and provider procedures. Processing times can vary. Keep your order confirmation and payment reference until the matter is resolved.'],
      ],
    },
  } as const;
  const detail = details[route as keyof typeof details];
  if (detail) return <CustomerPageShell><article className="customer-legal-page customer-legal-detail" aria-labelledby="customer-legal-title">
    <p className="customer-legal-eyebrow">{detail.eyebrow}</p>
    <h1 id="customer-legal-title">{detail.title}</h1>
    <p className="customer-legal-intro-copy">{detail.intro}</p>
    {detail.sections.map(([heading, body], index) => <section className="customer-legal-section" key={heading}><h2>{heading}</h2><p>{body}</p></section>)}
  </article></CustomerPageShell>;
  return <CustomerPageShell><section className="customer-legal-page" aria-labelledby="customer-legal-title">
    <section className="customer-legal-intro"><h1 id="customer-legal-title">Legal &amp; Policies</h1></section>
    <nav className="customer-legal-list" aria-label="Legal documents">
      {policies.map((policy) => <a className="customer-legal-link" href={policy.href} key={policy.href}>
        <span className="customer-legal-icon"><PolicyIcon type={policy.icon} /></span>
        <span className="customer-legal-copy"><strong>{policy.title}</strong><span>{policy.description}</span></span>
        <span className="customer-legal-arrow" aria-hidden="true">›</span>
      </a>)}
    </nav>
  </section></CustomerPageShell>;
}
