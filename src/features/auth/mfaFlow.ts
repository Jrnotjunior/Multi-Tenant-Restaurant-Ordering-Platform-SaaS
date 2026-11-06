import type { SupabaseClient } from '@supabase/supabase-js';

export type MfaFlow =
  | { kind: 'ready' }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'enroll'; factorId: string; qrCode: string; uri: string };

const inFlight = new WeakMap<SupabaseClient, Promise<MfaFlow>>();
const enrollments = new WeakMap<SupabaseClient, Extract<MfaFlow, { kind: 'enroll' }>>();
const ENROLLMENT_STORAGE_PREFIX = 'web2table.pending-totp.v1:';
const ENROLLMENT_TTL_MS = 30 * 60 * 1000;

function enrollmentStorageKey(userId: string) {
  return `${ENROLLMENT_STORAGE_PREFIX}${userId}`;
}

function readStoredEnrollment(userId: string): Extract<MfaFlow, { kind: 'enroll' }> | null {
  try {
    const raw = window.sessionStorage.getItem(enrollmentStorageKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as {
      factorId?: unknown; qrCode?: unknown; uri?: unknown; expiresAt?: unknown;
    };
    if (
      typeof value.factorId !== 'string'
      || typeof value.qrCode !== 'string'
      || typeof value.uri !== 'string'
      || typeof value.expiresAt !== 'number'
      || value.expiresAt <= Date.now()
    ) {
      window.sessionStorage.removeItem(enrollmentStorageKey(userId));
      return null;
    }
    return { kind: 'enroll', factorId: value.factorId, qrCode: value.qrCode, uri: value.uri };
  } catch {
    return null;
  }
}

function storeEnrollment(userId: string, enrollment: Extract<MfaFlow, { kind: 'enroll' }>) {
  try {
    window.sessionStorage.setItem(enrollmentStorageKey(userId), JSON.stringify({
      factorId: enrollment.factorId,
      qrCode: enrollment.qrCode,
      uri: enrollment.uri,
      expiresAt: Date.now() + ENROLLMENT_TTL_MS,
    }));
  } catch {
    throw new Error('Your browser could not retain the pending authenticator setup. Keep this page open and do not refresh until setup is verified.');
  }
}

function clearStoredEnrollment(userId: string) {
  try { window.sessionStorage.removeItem(enrollmentStorageKey(userId)); } catch { /* best effort */ }
}

export function clearPendingMfa(client: SupabaseClient) {
  inFlight.delete(client);
  enrollments.delete(client);
}

export function getMfaFlow(client: SupabaseClient): Promise<MfaFlow> {
  const current = inFlight.get(client);
  if (current) return current;
  const pending = resolve(client).finally(() => {
    if (inFlight.get(client) === pending) inFlight.delete(client);
  });
  inFlight.set(client, pending);
  return pending;
}

async function resolve(client: SupabaseClient): Promise<MfaFlow> {
  const [{ data: sessionData, error: sessionError }, { data: assurance, error: assuranceError }, { data: factors, error: factorsError }] =
    await Promise.all([
      client.auth.getSession(),
      client.auth.mfa.getAuthenticatorAssuranceLevel(),
      client.auth.mfa.listFactors(),
    ]);

  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    throw new Error('Your sign-in session is no longer active. Sign in again to continue secure account setup.');
  }
  if (assuranceError) throw assuranceError;
  if (factorsError) throw factorsError;

  const userId = sessionData.session.user.id;

  if (assurance.currentLevel === 'aal2') {
    enrollments.delete(client);
    clearStoredEnrollment(userId);
    return { kind: 'ready' };
  }

  // Inspect every factor type before enrolling. Supabase can reject TOTP
  // enrollment when another factor type (for example, phone MFA) is verified.
  // The aggregate "all" collection can be empty even while the typed
  // collections contain verified factors. Always inspect both typed lists;
  // otherwise we may try to enroll over an existing verified factor.
  const allFactors = [...factors.totp, ...factors.phone];
  const verifiedFactors = allFactors.filter((factor) => factor.status === 'verified');
  const verifiedTotp = verifiedFactors.find((factor) => factor.factor_type === 'totp');
  if (verifiedTotp) {
    enrollments.delete(client);
    return { kind: 'challenge', factorId: verifiedTotp.id };
  }
  if (verifiedFactors.length > 0) {
    enrollments.delete(client);
    throw new Error('This account already has a verified security factor that this screen cannot verify. No verified factor was changed. Ask an administrator to review the account MFA setup.');
  }

  const pendingFactors = factors.totp.filter((factor) => factor.status !== 'verified');
  const cached = enrollments.get(client) ?? readStoredEnrollment(userId);
  if (cached && pendingFactors.some((factor) => factor.id === cached.factorId)) {
    enrollments.set(client, cached);
    // Reuse the exact enrollment/QR already shown in this browser session.
    // Clean up only duplicate pending factors, never verified factors.
    for (const factor of pendingFactors) {
      if (factor.id === cached.factorId) continue;
      const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
    return cached;
  }

  // A pending factor from an earlier page load has no recoverable QR secret.
  // Remove only unverified factors before starting a fresh enrollment; a
  // verified factor was handled above and is never removed by this recovery.
  enrollments.delete(client);
  clearStoredEnrollment(userId);
  for (const factor of pendingFactors) {
    const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (error) throw error;
  }

  let enrollment: Awaited<ReturnType<typeof client.auth.mfa.enroll>>['data'] = null;
  let enrollmentError: Awaited<ReturnType<typeof client.auth.mfa.enroll>>['error'] = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
    const friendlyName = `Web2Table Authenticator ${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)} ${suffix}`;
    const result = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName });
    enrollment = result.data;
    enrollmentError = result.error;
    if (!enrollmentError) break;
    const factorLimitError = /mfa_verified_factor_exists|too_many_enrolled_mfa_factors/i.test(String(enrollmentError.code ?? ''))
      || /maximum number of verified factors|max(imum)? number.*verified factors|verified factors reached|verified phone factor already exists|too many enrolled mfa factors/i.test(enrollmentError.message);
    if (factorLimitError) {
      // Re-read the authoritative typed factor collections. Do not refresh the
      // session or silently unenroll factors as a side effect of enrollment.
      const { data: refreshed, error: refreshError } = await client.auth.mfa.listFactors();
      if (refreshError) throw refreshError;

      const refreshedFactors = [...refreshed.totp, ...refreshed.phone];
      const refreshedVerified = refreshedFactors.filter((factor) => factor.status === 'verified');
      const refreshedTotp = refreshedVerified.find((factor) => factor.factor_type === 'totp');
      if (refreshedTotp) {
        enrollments.delete(client);
        return { kind: 'challenge', factorId: refreshedTotp.id };
      }
      if (refreshedVerified.length > 0) {
        throw new Error('This account already has a verified security factor that this screen cannot verify. No factor was changed. Use the account recovery process or ask an administrator for help.');
      }

      const pendingTotp = refreshed.totp.filter((factor) => factor.status !== 'verified');
      if (pendingTotp.length > 0) {
        throw new Error('An incomplete authenticator setup is already registered. Use “Restart incomplete authenticator setup” to remove only the unfinished setup, then try again. No verified factor was changed.');
      }

      throw new Error('Supabase is still reporting an authenticator factor limit, but no verified factor is visible to this session. No factors were changed. Please ask an administrator to review the account MFA state.');
    }
    if (!/friendly name.*already exists|already exists.*friendly name/i.test(enrollmentError.message)) {
      throw enrollmentError;
    }
  }

  if (enrollmentError) {
    throw new Error('Authenticator setup could not be started. Please try again; any verified authenticator has been preserved.');
  }
  if (!enrollment?.totp?.qr_code || !enrollment.totp.uri) {
    throw new Error('Authenticator enrollment information unavailable.');
  }

  const result: MfaFlow = {
    kind: 'enroll',
    factorId: enrollment.id,
    qrCode: enrollment.totp.qr_code,
    uri: enrollment.totp.uri,
  };
  enrollments.set(client, result);
  storeEnrollment(userId, result);
  return result;
}

export async function verifyMfa(client: SupabaseClient, factorId: string, code: string) {
  if (!/^[0-9]{6}$/.test(code)) throw new Error('Enter the six-digit authenticator code.');
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    throw new Error('Your sign-in session is no longer active. Sign in again before verifying your authenticator.');
  }
  const { data, error } = await client.auth.mfa.challenge({ factorId });
  if (error) throw error;
  const { error: verifyError } = await client.auth.mfa.verify({ factorId, challengeId: data.id, code });
  if (verifyError) {
    const normalized = verifyError.message.toLowerCase();
    if (normalized.includes('invalid') || normalized.includes('token') || normalized.includes('code')) {
      throw new Error('That authenticator code was rejected. Make sure your phone date and time are set automatically, use the newest six-digit code, and keep using the same QR code unless you explicitly restart setup.');
    }
    throw verifyError;
  }
  const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== 'aal2') throw new Error('MFA verification did not complete.');
  enrollments.delete(client);
  clearStoredEnrollment(sessionData.session.user.id);
}

/** Explicit user recovery action; never removes verified authenticator factors. */
export async function restartIncompleteMfa(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  if (data.totp.some((factor) => factor.status === 'verified')) {
    throw new Error('A verified authenticator exists. Sign in with it or request an administrator-assisted recovery.');
  }
  for (const factor of data.totp) {
    const { error: unenrollError } = await client.auth.mfa.unenroll({ factorId: factor.id });
    if (unenrollError) throw unenrollError;
  }
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) clearStoredEnrollment(sessionData.session.user.id);
  clearPendingMfa(client);
}
