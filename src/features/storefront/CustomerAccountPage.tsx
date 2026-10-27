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
  const [signedIn, setSignedIn] = useState(false);
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
      if (error) {
        setMessage('We could not check your sign-in status. Please refresh or sign in again.');
        setLoading(false);
        return;
      }
      const user = data.session?.user;
      if (!user) {
        setName('Your account');
        setEmail('');
        setSignedIn(false);
        setLoading(false);
        return;
      }
      const metadata = (user.user_metadata ?? {}) as CustomerProfile;
      const fullName = [metadata.first_name?.trim(), metadata.last_name?.trim()].filter(Boolean).join(' ')
        || metadata.full_name?.trim()
        || user.email
        || 'Your account';
      setName(fullName);
      setEmail(user.email ?? '');
      setSignedIn(true);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage('Could not sign out. Please try again.');
      return;
    }
    setSignedIn(false);
    setName('Your account');
    setEmail('');
    window.location.assign(base + 'account');
  };

  const authHref = (mode: 'sign-in' | 'sign-up') => base + 'account/' + mode;
  const protectedHref = (path: string) => signedIn ? base + path : authHref('sign-in');

  return <div className="sf-storefront sf-account-page">
    <a className="sf-skip-link" href="#customer-account-main">Skip to account content</a>
    <header className="sf-header">
      <div className="sf-header-inner">
        <a href={base} className="sf-logo" aria-label="Web2Table storefront">
          <img className="sf-logo-image" src={WEB2TABLE_LOGO} alt="Web2Table" width={46} height={46} />
        </a>
        <nav className="sf-header-actions" aria-label="Store navigation">
          <a href={base} className="sf-track-order-button sf-account-storefront-link" aria-label="Back to storefront" title="Storefront">Storefront</a>
          {signedIn
            ? <button type="button" className="sf-account-button" aria-label="Sign out" title="Sign out" onClick={() => void signOut()}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            : <a className="sf-account-storefront-link" href={authHref('sign-in')}>Sign in</a>}
        </nav>
      </div>
    </header>
    <main id="customer-account-main" className="sf-main sf-account-main">
      <section className="sf-account-hero" aria-live="polite">
        <span className="sf-tracking-eyebrow">WEB2TABLE CUSTOMER ACCOUNT</span>
        <h1>{loading ? 'Loading your account…' : name}</h1>
        <p className="sf-account-email">{loading ? 'Checking your account…' : signedIn ? email : 'Sign in or create an account to manage your restaurant orders and rewards.'}</p>
        {!loading && !signedIn && <div className="sf-address-form-actions">
          <a className="sf-account-auth-action" href={authHref('sign-in')}>Sign in</a>
          <a className="sf-account-auth-action sf-account-auth-secondary" href={authHref('sign-up')}>Create account</a>
        </div>}
        {message && <p className="sf-account-message" role="status">{message}</p>}
      </section>
      <div className="sf-account-dashboard-grid">
        <a className="sf-tracking-details sf-account-dashboard-card" href={protectedHref('account/loyalty')}>
          <div><span className="sf-tracking-eyebrow">REWARDS</span><h2>Loyalty Points</h2><p>{signedIn ? 'View your restaurant rewards balance and points activity.' : 'Sign in to earn points and view rewards where loyalty is available.'}</p></div>
          <span aria-hidden="true">›</span>
        </a>
        <a className="sf-tracking-details sf-account-dashboard-card" href={protectedHref('account/orders')}>
          <div><span className="sf-tracking-eyebrow">PURCHASES</span><h2>Order History</h2><p>Review orders placed with your Web2Table account.</p></div>
          <span aria-hidden="true">›</span>
        </a>
        <a className="sf-tracking-details sf-account-dashboard-card" href={protectedHref('account/addresses')}>
          <div><span className="sf-tracking-eyebrow">DELIVERY</span><h2>Saved Addresses</h2><p>Manage addresses for faster checkout.</p></div>
          <span aria-hidden="true">›</span>
        </a>
      </div>
      <a className="sf-tracking-details sf-account-dashboard-card sf-account-legal-card" href={base + '#legal'}>
        <div><span className="sf-tracking-eyebrow">INFORMATION</span><h2>Legal</h2><p>View privacy, terms, and refund policies.</p></div>
        <span aria-hidden="true">›</span>
      </a>
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
