import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase, restaurantMenuPath } from '../../app/routes';
import { loadPublishedMenu } from './publishedMenu';

type AuthMode = 'sign-in' | 'sign-up';

export function AccountAuthPage({ mode, baseUrl, restaurantSlug }: { mode: AuthMode; baseUrl: string; restaurantSlug: string | null }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resolvedRestaurantSlug, setResolvedRestaurantSlug] = useState<string | null>(restaurantSlug);
  const [configuredLogoUrl, setConfiguredLogoUrl] = useState<string | null>(null);
  const isSignUp = mode === 'sign-up';
  const passwordRules = [
    { label: 'At least 8 characters', valid: password.length >= 8 },
    { label: 'One uppercase letter (A–Z)', valid: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a–z)', valid: /[a-z]/.test(password) },
    { label: 'One number (0–9)', valid: /[0-9]/.test(password) },
    { label: 'One special character (!@#$…)', valid: /[^A-Za-z0-9]/.test(password) },
  ];
  const passwordMeetsStandard = passwordRules.every(rule => rule.valid);
  const base = normalizeAppBase(baseUrl);
  const backToMenu = resolvedRestaurantSlug ? restaurantMenuPath(resolvedRestaurantSlug, baseUrl) : base;

  useEffect(() => {
    let slug = restaurantSlug;
    if (!slug) {
      try { slug = window.sessionStorage.getItem('web2table:customer-auth-restaurant'); } catch { /* Storage may be unavailable. */ }
    }
    const validSlug = slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
    setResolvedRestaurantSlug(validSlug);
    setConfiguredLogoUrl(null);
    if (!validSlug) return;
    let active = true;
    void loadPublishedMenu(validSlug).then(catalog => {
      if (active) setConfiguredLogoUrl(catalog?.restaurant.logoUrl ?? null);
    }).catch(() => {
      // The configured logo is optional; keep the sign-in layout usable if it cannot load.
    });
    return () => { active = false; };
  }, [restaurantSlug]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSuccess(false);

    if (!supabase) {
      setMessage('Account services are not configured yet. Please try again later.');
      return;
    }
    if (!resetMode && isSignUp && !passwordMeetsStandard) {
      setMessage('Please meet all password requirements before creating your account.');
      return;
    }
    if (!resetMode && !isSignUp && password.length < 8) {
      setMessage('Enter your password.');
      return;
    }
    if (isSignUp && (!firstName.trim() || !lastName.trim())) {
      setMessage('Enter both your first name and last name.');
      return;
    }

    setBusy(true);
    try {
      if (resetMode) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: new URL(base + 'account/reset-password', window.location.origin).toString(),
        });
        if (error) throw error;
        setSuccess(true);
        setMessage('If an account exists for this email, a password reset link will be sent. Check your inbox.');
      } else if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { first_name: firstName.trim(), last_name: lastName.trim(), full_name: `${firstName.trim()} ${lastName.trim()}` },
            emailRedirectTo: new URL(base, window.location.origin).toString(),
          },
        });
        if (error) throw error;
        if (data.session) {
          window.location.assign(base);
          return;
        }
        setSuccess(true);
        setMessage('Account created. Check your email for a confirmation link before signing in.');
      } else {
        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        // The storefront is the single sign-in gateway. A newly invited owner
        // may not have an active membership until the protected setup flow
        // accepts the invitation, so route that identity to the workspace gate
        // instead of leaving them on the public storefront.
        const isInvitedOwner = signInData.user?.user_metadata?.invitation_type === 'tenant_owner'
          || typeof signInData.user?.user_metadata?.tenant_invitation_id === 'string';
        if (isInvitedOwner) {
          window.location.assign(new URL('restaurant', window.location.origin + base).toString());
          return;
        }

        // Existing staff/owners must pass the server-side eligibility check.
        // Customers and other non-privileged accounts stay on the storefront.
        const { data: canEnterWorkspace, error: accessError } = await supabase.rpc('privileged_route_eligible', {
          p_workspace: 'restaurant',
        });
        if (accessError) throw accessError;
        window.location.assign(canEnterWorkspace === true ? new URL('restaurant', window.location.origin + base).toString() : base);
        return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'We could not complete your request. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="sf-auth-page">
    <section className="sf-auth-card" aria-labelledby="sf-auth-title">
      {!isSignUp && !resetMode && configuredLogoUrl && <img className="sf-auth-configured-logo" src={configuredLogoUrl} alt="Restaurant logo" />}
      <h1 id="sf-auth-title">{resetMode ? 'Reset your password' : isSignUp ? 'Sign Up' : 'Sign In'}</h1>
      <p className="sf-auth-intro">{resetMode ? 'Enter your email and we’ll send you a link to reset your password.' : isSignUp ? 'Create an account to make ordering easier and keep your details in one place.' : 'Welcome back. Sign in to continue your ordering experience.'}</p>
      <form className="sf-auth-form" onSubmit={submit} noValidate>
        {isSignUp && <>
          <label>
            First name
            <input autoComplete="given-name" name="firstName" value={firstName} onChange={event => setFirstName(event.target.value)} required maxLength={60} placeholder="First name" />
          </label>
          <label>
            Last name
            <input autoComplete="family-name" name="lastName" value={lastName} onChange={event => setLastName(event.target.value)} required maxLength={60} placeholder="Last name" />
          </label>
        </>}
        <label>
          Email address
          <input autoComplete="email" inputMode="email" type="email" name="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" />
        </label>
        {!resetMode && <label>
          Password
          <span className="sf-auth-password-field">
            <input autoComplete={isSignUp ? 'new-password' : 'current-password'} type={showPassword ? 'text' : 'password'} name="password" value={password} onChange={event => { setPassword(event.target.value); if (!event.target.value) setShowPassword(false); }} required minLength={8} maxLength={128} placeholder={isSignUp ? 'At least 8 characters' : 'Your password'} />
            {password.length > 0 && <button className="sf-auth-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>
              {showPassword ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.8 4.5 10 7-.4.9-1.3 2.2-2.6 3.4M6.2 6.2C3.9 7.7 2.5 9.8 2 12c1.2 2.5 4.8 7 10 7 1 0 2-.2 2.9-.5" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
            </button>}
          </span>
          {isSignUp && password.length > 0 && <ul className="sf-password-checklist" aria-label="Password requirements">
            {passwordRules.map(rule => <li key={rule.label} className={rule.valid ? 'is-valid' : ''}>
              <span className="sf-password-check-icon" aria-hidden="true">{rule.valid ? '✓' : '○'}</span>
              <span>{rule.label}</span>
            </li>)}
          </ul>}
        </label>}
        {!isSignUp && !resetMode && <button className="sf-auth-text-button" type="button" onClick={() => { setResetMode(true); setMessage(''); setSuccess(false); }}>Forgot password?</button>}
        {message && <p className={success ? 'sf-auth-message sf-auth-success' : 'sf-auth-message'} role="status">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : resetMode ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="sf-auth-switch">
        {resetMode ? <button className="sf-auth-text-button" type="button" onClick={() => { setResetMode(false); setMessage(''); setSuccess(false); }}>Back to sign in</button> : <>{isSignUp ? 'Already have an account? ' : 'New customer? '}<a href={base + (isSignUp ? 'account/sign-in' : 'account/sign-up') + (resolvedRestaurantSlug ? '?restaurant=' + encodeURIComponent(resolvedRestaurantSlug) : '')}>{isSignUp ? 'Sign In' : 'Sign Up'}</a></>}
      </p>
    </section>
  </main>;
}
