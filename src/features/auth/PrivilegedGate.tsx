import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { clearPendingMfa, getMfaFlow, restartIncompleteMfa, verifyMfa, type MfaFlow } from './mfaFlow';

type Mode = 'admin' | 'restaurant';
type State = 'checking' | 'signedout' | 'passwordsetup' | 'mfa' | 'authorized' | 'denied' | 'error';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function PrivilegedGate({ mode, children }: { mode: Mode; children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<State>('checking');
  const [flow, setFlow] = useState<MfaFlow | null>(null);
  const [revision, setRevision] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const passwordRules = [
    { label: 'At least 8 characters', valid: newPassword.length >= 8 },
    { label: 'One uppercase letter (A–Z)', valid: /[A-Z]/.test(newPassword) },
    { label: 'One lowercase letter (a–z)', valid: /[a-z]/.test(newPassword) },
    { label: 'One number (0–9)', valid: /[0-9]/.test(newPassword) },
    { label: 'One special character (!@#$…)', valid: /[^A-Za-z0-9]/.test(newPassword) },
  ];
  const passwordMeetsStandard = passwordRules.every(rule => rule.valid);
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
        // AAL1 preflight only checks whether this identity may attempt privileged access.
        // The backend still requires AAL2 and tenant/branch permissions for all private data.
        const invitationType = new URLSearchParams(window.location.search).get('type');
      const isInviteSetup = invitationType === 'invite' || user.user_metadata?.invitation_type === 'tenant_owner';
      if (isInviteSetup && invitationType === 'invite') {
        if (!active) return;
        setStatus('passwordsetup');
        return;
      }
      const { data: eligible, error: eligibilityError } = await client.rpc('privileged_route_eligible', {
          p_workspace: mode,
        });
        if (eligibilityError) throw eligibilityError;
        if (!active) return;
        if (eligible !== true) { setStatus('denied'); return; }
        const next = await getMfaFlow(client);
        if (!active) return;
        if (next.kind !== 'ready') { setFlow(next); setStatus('mfa'); return; }
        setFlow(null);
        const invitationId = new URLSearchParams(window.location.search).get('invite_id')
          ?? (typeof user.user_metadata?.tenant_invitation_id === 'string' ? user.user_metadata.tenant_invitation_id : null);
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
    if (!client || busy || !passwordMeetsStandard) { setMessage('Please meet all password requirements before continuing.'); return; }
    setBusy(true); setMessage('');
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      const url = new URL(window.location.href);
      url.searchParams.delete('type');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
      setMessage('Password saved. Now finish authenticator setup.');
      setRevision((previous) => previous + 1);
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

  const isSetup = status === 'passwordsetup';
  const isMfa = status === 'mfa';
  return <main className="privileged-onboarding" aria-live="polite">
    <aside className="onboarding-story">
      <a className="onboarding-brand" href="/" aria-label="Web2Table home"><span>W2T</span><strong>Web2Table</strong></a>
      <div className="onboarding-story-copy">
        <span className="onboarding-kicker">YOUR RESTAURANT. ONE WORKSPACE.</span>
        <h1>Welcome to<br />Web2Table</h1>
        <p>Everything you need to manage your restaurant — in one place.</p>
        <div className="onboarding-benefits">
          <div><span className="onboarding-benefit-icon">▣</span><span><strong>Manage your restaurant</strong><small>Menus, orders, and team access</small></span></div>
          <div><span className="onboarding-benefit-icon">▥</span><span><strong>Grow your business</strong><small>Insights and real-time analytics</small></span></div>
          <div><span className="onboarding-benefit-icon">♧</span><span><strong>Built for your team</strong><small>Simple, secure, and reliable</small></span></div>
        </div>
      </div>
      <div className="onboarding-story-glow" aria-hidden="true" />
    </aside>
    <section className="auth-panel onboarding-card">
      {(isSetup || isMfa) && <div className="onboarding-steps" aria-label="Account setup progress">
        <div className={isSetup ? 'active' : 'done'}><span>1</span><small>Create password</small></div><i />
        <div className={isMfa ? 'active' : ''}><span>2</span><small>Set up MFA</small></div><i />
        <div className={''}><span>3</span><small>Get started</small></div>
      </div>}
      <span className="auth-eyebrow">{isSetup ? 'STEP 1 OF 3 · ACCOUNT SECURITY' : isMfa ? 'STEP 2 OF 3 · ACCOUNT SECURITY' : 'PRIVILEGED ACCESS · MFA REQUIRED'}</span>
      <h2>{isSetup ? 'Create your password' : isMfa ? 'Secure your account' : mode === 'admin' ? 'System administrator sign-in' : 'Restaurant team sign-in'}</h2>
      <p>{isSetup ? 'Set a secure password to activate your restaurant owner account.' : isMfa ? 'One quick security step, then you’re ready to get started.' : 'Accounts are provisioned by invitation only. Access is based on your verified role and database membership.'}</p>
      {message && <p className="auth-message" role="alert">{message}</p>}
    {status === 'checking' && <p>Verifying your session and access permissions…</p>}
    {status === 'passwordsetup' && <form onSubmit={(e) => void savePassword(e)} className="auth-form">
      <label>Password<div className="onboarding-password-wrap"><input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /><button className="onboarding-password-toggle" type="button" onClick={() => setShowNewPassword(v => !v)} aria-label={showNewPassword ? 'Hide password' : 'Show password'}>{showNewPassword ? 'Hide' : 'Show'}</button></div></label>
      <div className="onboarding-password-rules"><strong>Your password must have:</strong><ul className="sf-password-checklist" aria-label="Password requirements">{passwordRules.map(rule => <li key={rule.label} className={rule.valid ? 'is-valid' : ''}><span className="sf-password-check-icon" aria-hidden="true">{rule.valid ? '✓' : '○'}</span>{rule.label}</li>)}<li className={newPassword.length <= 128 ? 'is-valid' : ''}><span className="sf-password-check-icon" aria-hidden="true">✓</span>Maximum 128 characters</li></ul></div>
      <button type="submit" disabled={busy || !passwordMeetsStandard}>{busy ? 'Saving password…' : 'Continue to security setup　 →'}</button>
    </form>}
    {status === 'signedout' && <div className="auth-form">
      <p>Sign in through the Web2Table storefront. After authentication, your verified role and membership determine which workspace you can access.</p>
      <a className="auth-primary-link" href={new URL('account/sign-in', window.location.origin + (import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/')).toString()}>Continue to storefront sign-in</a>
    </div>}
    {status === 'mfa' && flow && flow.kind !== 'ready' && <div>
      {flow.kind === 'enroll' && <div><p>Set up an authenticator app, then enter a six-digit code.</p>
        <img className="auth-qr" src={flow.qrCode} alt="Authenticator enrollment QR code" />
        <p>Scan the QR code in an authenticator app. Keep it private.</p>
      </div>}
      {flow.kind === 'challenge' && <p>Enter the current six-digit code from your authenticator app.</p>}
      <form onSubmit={(e) => void submitMfa(e)} className="auth-form onboarding-mfa-form">
        <label>Authenticator code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required /></label>
        <button className="onboarding-mfa-verify" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>
      </form>

    </div>}
    {status === 'denied' && <p>This account has no active access or valid invitation for this workspace. Contact your platform or restaurant administrator.</p>}
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
    {user && <button className="auth-secondary onboarding-signout" type="button" onClick={() => void logout()}>Sign out</button>}
    </section>
  </main>;
}
