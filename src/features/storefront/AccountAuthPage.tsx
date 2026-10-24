import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeAppBase } from '../../app/routes';

type AuthMode = 'sign-in' | 'sign-up';

export function AccountAuthPage({ mode, baseUrl }: { mode: AuthMode; baseUrl: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
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
    if (password.length < 8) {
      setMessage('Use a password with at least 8 characters.');
      return;
    }
    if (isSignUp && name.trim().length < 2) {
      setMessage('Enter your name (at least 2 characters).');
      return;
    }

    setBusy(true);
    try {
      if (isSignUp) {
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
      <h1 id="sf-auth-title">{isSignUp ? 'Create your account' : 'Welcome back'}</h1>
      <p className="sf-auth-intro">{isSignUp ? 'Sign up to make ordering easier and keep your details in one place.' : 'Sign in to continue to your restaurant ordering experience.'}</p>
      <form className="sf-auth-form" onSubmit={submit} noValidate>
        {isSignUp && <label>
          Full name
          <input autoComplete="name" name="name" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120} placeholder="Your name" />
        </label>}
        <label>
          Email address
          <input autoComplete="email" inputMode="email" type="email" name="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" />
        </label>
        <label>
          Password
          <input autoComplete={isSignUp ? 'new-password' : 'current-password'} type="password" name="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} placeholder={isSignUp ? 'At least 8 characters' : 'Your password'} />
        </label>
        {message && <p className={success ? 'sf-auth-message sf-auth-success' : 'sf-auth-message'} role="status">{message}</p>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="sf-auth-switch">
        {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
        <a href={base + (isSignUp ? 'account/sign-in' : 'account/sign-up')}>{isSignUp ? 'Sign in' : 'Sign up'}</a>
      </p>
      <p className="sf-auth-legal">By continuing, you agree to the restaurant's applicable terms and privacy policy.</p>
    </section>
  </main>;
}
