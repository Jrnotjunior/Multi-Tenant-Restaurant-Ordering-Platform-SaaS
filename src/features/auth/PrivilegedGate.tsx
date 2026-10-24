import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { clearPendingMfa, getMfaFlow, restartIncompleteMfa, verifyMfa, type MfaFlow } from './mfaFlow';

type Mode = 'admin' | 'restaurant';
type State = 'checking' | 'signedout' | 'mfa' | 'authorized' | 'denied' | 'error';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function PrivilegedGate({ mode, children }: { mode: Mode; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<State>('checking');
  const [flow, setFlow] = useState<MfaFlow | null>(null);
  const [revision, setRevision] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const client = supabase;

  useEffect(() => {
    if (!client) { setStatus('error'); setMessage('Supabase must be configured for account access.'); return; }
    let active = true;
    void client.auth.getUser().then(({ data, error }) => {
      if (active) { if (error) setMessage(error.message); setUser(data.user ?? null); setStatus(data.user ? 'checking' : 'signedout'); }
    }).catch((err: unknown) => { if (active) { setMessage(String(err)); setStatus('error'); } });
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_OUT') clearPendingMfa(client);
      setUser(session?.user ?? null);
      setRevision((previous) => previous + 1);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);

  useEffect(() => {
    if (!client || !user) { if (client) setStatus('signedout'); return; }
    let active = true;
    async function checkAccess() {
      if (!client || !user) return;
      setStatus('checking');
      try {
        const next = await getMfaFlow(client);
        if (!active) return;
        if (next.kind !== 'ready') { setFlow(next); setStatus('mfa'); return; }
        setFlow(null);
        const invitationId = new URLSearchParams(window.location.search).get('invite_id');
        if (invitationId) {
          if (!uuid.test(invitationId)) throw new Error('Invalid invitation link.');
          const { error } = await client.rpc('accept_privileged_invitation', { p_invitation_id: invitationId });
          if (error) throw error;
          const url = new URL(window.location.href);
          url.searchParams.delete('invite_id');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        }
        if (mode === 'admin') {
          const { data, error } = await client.from('platform_admins').select('user_id')
            .eq('user_id', user.id).eq('is_active', true).maybeSingle();
          if (error) throw error;
          if (active) setStatus(data ? 'authorized' : 'denied');
        } else {
          const { data, error } = await client.from('tenant_memberships')
            .select('id').eq('user_id', user.id).eq('status', 'active').limit(1);
          if (error) throw error;
          if (active) setStatus((data?.length ?? 0) > 0 ? 'authorized' : 'denied');
        }
      } catch (err) {
        if (active) { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Authorization check failed.'); }
      }
    }
    void checkAccess();
    return () => { active = false; };
  }, [client, user, mode, revision]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true); setMessage('');
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword('');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Login failed.'); }
    finally { setBusy(false); }
  }
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy || newPassword.length < 12) { setMessage('Use a password of at least 12 characters.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setMessage('Password saved. Continue with MFA to unlock your account.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not update password.'); }
    finally { setBusy(false); }
  }
  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !flow || flow.kind === 'ready' || busy) return;
    setBusy(true); setMessage('');
    try {
      await verifyMfa(client, flow.factorId, code);
      setCode('');
      setRevision((previous) => previous + 1);
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Authenticator verification failed.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!client) return;
    clearPendingMfa(client);
    const { error } = await client.auth.signOut();
    if (error) setMessage(error.message);
    else { setUser(null); setStatus('signedout'); setMessage(''); }
  }

  if (status === 'authorized') return <>{children}<p className="auth-footer"><button type="button" onClick={() => void logout()}>Sign out</button></p></>;

  return <section className="auth-panel" aria-live="polite">
    <span className="auth-eyebrow">PRIVILEGED ACCESS · MFA REQUIRED</span>
    <h2>{mode === 'admin' ? 'System administrator' : 'Restaurant team'} sign-in</h2>
    <p>Accounts are provisioned by invitation only. Authentication never grants restaurant access without a verified database membership.</p>
    {message && <p className="auth-message" role="alert">{message}</p>}
    {status === 'checking' && <p>Verifying your session and access permissions…</p>}
    {status === 'signedout' && <form onSubmit={(e) => void login(e)} className="auth-form">
      <label>Email<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in securely'}</button>
    </form>}
    {status === 'mfa' && flow && flow.kind !== 'ready' && <div>
      {flow.kind === 'enroll' && <div><p>Set up an authenticator app, then enter a six-digit code.</p>
        <img className="auth-qr" src={flow.qrCode} alt="Authenticator enrollment QR code" />
        <p>Scan the QR code in an authenticator app. Keep it private.</p>
      </div>}
      {flow.kind === 'challenge' && <p>Enter the current six-digit code from your authenticator app.</p>}
      <form onSubmit={(e) => void submitMfa(e)} className="auth-form">
        <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required /></label>
        <button type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify authenticator'}</button>
      </form>
      {new URLSearchParams(window.location.search).has('invite_id') && <form className="auth-form" onSubmit={(e) => void savePassword(e)}>
        <label>Set account password (recommended for invited users)<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        <button type="submit" disabled={busy}>Save password</button>
      </form>}
    </div>}
    {status === 'denied' && <p>Your account has no active authorization for this workspace. Contact your platform or restaurant administrator.</p>}
    {status === 'error' && <div>
      <button type="button" onClick={() => { setMessage(''); setRevision((previous) => previous + 1); }}>Retry secure access check</button>
      {message.includes('Incomplete authenticator enrollment') && client && <button className="auth-secondary" type="button" disabled={busy} onClick={() => {
        setBusy(true);
        void restartIncompleteMfa(client)
          .then(() => { setMessage(''); setRevision((previous) => previous + 1); })
          .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'MFA reset failed.'))
          .finally(() => setBusy(false));
      }}>Restart incomplete authenticator setup</button>}
    </div>}
    {user && <button className="auth-secondary" type="button" onClick={() => void logout()}>Sign out</button>}
  </section>;
}
