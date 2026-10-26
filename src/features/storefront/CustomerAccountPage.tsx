import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase } from '../../app/routes';
import './storefront.css';

type CustomerProfile = {
  first_name?: string;
  last_name?: string;
  full_name?: string;
};

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

  return <main className="sf-order-tracking-page">
    <section className="sf-tracking-receipt" aria-live="polite">
      <span className="sf-tracking-eyebrow">WEB2TABLE CUSTOMER ACCOUNT</span>
      <h1>{name}</h1>
      <p>{loading ? 'Loading your account…' : email}</p>
      {message && <p role="status">{message}</p>}
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
      <a className="sf-tracking-back" href={base}>Back to storefront</a>
    </section>
  </main>;
}
