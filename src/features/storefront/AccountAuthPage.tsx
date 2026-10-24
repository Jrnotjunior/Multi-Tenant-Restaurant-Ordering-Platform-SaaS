import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase } from '../../app/routes';

type AuthMode = 'sign-in' | 'sign-up';

export function AccountAuthPage({ mode, baseUrl }: { mode: AuthMode; baseUrl: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const isSignUp = mode === 'sign-up';
  const base = normalizeAppBase(baseUrl);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setSuccess(false);

    if (!supabase) {
      setMessage('Account services are not configured yet. Please try again later.');
      return;
    }
    if (!resetMode && password.length < 8) {
      setMessage('Use a password with at least 8 characters.');
      return;
    }
    if (isSignUp && name.trim().length < 2) {
      setMessage('Enter your name (at least 2 characters).');
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
            data: { full_name: name.trim() },
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
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        window.location.assign(base);
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
      <a className="sf-auth-back" href={base}>← Back to menu</a>
      <p className="sf-auth-eyebrow">YOUR ACCOUNT</p>
      <h1 id="sf-auth-title">{resetMode ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome back'}</h1>
      <p className="sf-auth-intro">{resetMode ? 'Enter your email and we’ll send you a link to reset your password.' : isSignUp ? 'Sign up to make ordering easier and keep your details in one place.' : 'Sign in to continue to your restaurant ordering experience.'}</p>
      <form className="sf-auth-form" onSubmit={submit} noValidate>
        {isSignUp && <label>
          Full name
          <input autoComplete="name" name="name" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120} placeholder="Your name" />
        </label>}
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
        </label>}
        {!isSignUp && !resetMode && <button className="sf-auth-text-button" type="button" onClick={() => { setResetMode(true); setMessage(''); setSuccess(false); }}>Forgot password?</button>}
        {message && <p className={success ? 'sf-auth-message sf-auth-success' : 'sf-auth-message'} role="status">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : resetMode ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="sf-auth-switch">
        {resetMode ? <button className="sf-auth-text-button" type="button" onClick={() => { setResetMode(false); setMessage(''); setSuccess(false); }}>Back to sign in</button> : <>{isSignUp ? 'Already have an account? ' : "Don't have an account? "}<a href={base + (isSignUp ? 'account/sign-in' : 'account/sign-up')}>{isSignUp ? 'Sign in' : 'Sign up'}</a></>}
      </p>
      <p className="sf-auth-legal">By continuing, you agree to the restaurant's applicable terms and privacy policy.</p>
    </section>
  </main>;
}
