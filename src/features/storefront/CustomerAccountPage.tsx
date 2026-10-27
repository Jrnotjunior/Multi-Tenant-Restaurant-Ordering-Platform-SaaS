import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase } from '../../app/routes';
import './storefront.css';

type CustomerProfile = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
};

const WEB2TABLE_LOGO = 'https://wvibrchebfwirbgkcnbr.supabase.co/storage/v1/object/public/web2table-assets/web2table.png';

export function CustomerAccountPage({ baseUrl }: { baseUrl: string }) {
  const [name, setName] = useState('Your account');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const base = normalizeAppBase(baseUrl);

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setMessage('Account services are not configured.');
      setLoading(false);
      return;
    }
    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      const user = data.session?.user;
      if (error || !user) {
        window.location.assign(base + 'account/sign-in');
        return;
      }
      const metadata = (user.user_metadata ?? {}) as CustomerProfile;
      const fullName = [metadata.first_name?.trim(), metadata.last_name?.trim()].filter(Boolean).join(' ')
        || metadata.full_name?.trim()
        || 'Your account';
      setName(fullName);
      setEmail(user.email ?? '');
      setLoading(false);
    })();
    return () => { active = false; };
  }, [base]);

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage('Could not sign out. Please try again.');
      return;
    }
    window.location.assign(base + 'account/sign-in');
  };

  return <div className="sf-storefront sf-account-page">
    <a className="sf-skip-link" href="#customer-account-main">Skip to account content</a>
    <header className="sf-header">
      <div className="sf-header-inner">
        <a href={base} className="sf-logo" aria-label="Web2Table storefront">
          <img className="sf-logo-image" src={WEB2TABLE_LOGO} alt="Web2Table" width={46} height={46} />
        </a>
        <nav className="sf-header-actions" aria-label="Store navigation">
          <a href={base} className="sf-track-order-button sf-account-storefront-link" aria-label="Back to storefront" title="Storefront">Storefront</a>
          <button type="button" className="sf-account-button" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </nav>
      </div>
    </header>
    <main id="customer-account-main" className="sf-main sf-account-main">
      <section className="sf-account-hero" aria-live="polite">
        <span className="sf-tracking-eyebrow">WEB2TABLE CUSTOMER ACCOUNT</span>
        <h1>{name}</h1>
        <p className="sf-account-email">{loading ? 'Loading your account…' : email}</p>
        {message && <p className="sf-account-message" role="status">{message}</p>}
      </section>
      <div className="sf-account-dashboard-grid">
        <a className="sf-tracking-details sf-account-dashboard-card" href={base + 'account/loyalty'}>
          <div><span className="sf-tracking-eyebrow">REWARDS</span><h2>Loyalty Points</h2><p>View your rewards balance and points activity.</p></div>
          <span aria-hidden="true">›</span>
        </a>
        <a className="sf-tracking-details sf-account-dashboard-card" href={base + 'account/orders'}>
          <div><span className="sf-tracking-eyebrow">PURCHASES</span><h2>Order History</h2><p>Review orders placed with your Web2Table account.</p></div>
          <span aria-hidden="true">›</span>
        </a>
        <a className="sf-tracking-details sf-account-dashboard-card" href={base + 'account/addresses'}>
          <div><span className="sf-tracking-eyebrow">DELIVERY</span><h2>Saved Addresses</h2><p>Manage addresses for faster checkout.</p></div>
          <span aria-hidden="true">›</span>
        </a>
      </div>
      <section className="sf-account-legal-main" aria-labelledby="sf-account-legal-heading">
        <h2 id="sf-account-legal-heading">Legal</h2>
        <nav className="sf-account-legal-links" aria-label="Legal policies">
          <a href={base + '#privacy'}>Privacy</a>
          <a href={base + '#terms'}>Terms</a>
          <a href={base + '#refunds'}>Refunds</a>
        </nav>
      </section>
    </main>
    <footer className="sf-footer">
      <div className="sf-footer-inner">
        <section className="sf-footer-social-section" aria-label="Follow the restaurant">
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
