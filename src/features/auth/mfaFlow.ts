import type { SupabaseClient } from '@supabase/supabase-js';

export type MfaFlow =
  | { kind: 'ready' }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'enroll'; factorId: string; qrCode: string; uri: string };

const inFlight = new WeakMap<SupabaseClient, Promise<MfaFlow>>();
const enrollments = new WeakMap<SupabaseClient, Extract<MfaFlow, { kind: 'enroll' }>>();

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
  const [{ data: assurance, error: assuranceError }, { data: factors, error: factorsError }] =
    await Promise.all([
      client.auth.mfa.getAuthenticatorAssuranceLevel(),
      client.auth.mfa.listFactors(),
    ]);

  if (assuranceError) throw assuranceError;
  if (factorsError) throw factorsError;

  if (assurance.currentLevel === 'aal2') {
    enrollments.delete(client);
    return { kind: 'ready' };
  }

  const verified = factors.totp.find((factor) => factor.status === 'verified');
  if (verified) {
    enrollments.delete(client);
    return { kind: 'challenge', factorId: verified.id };
  }

  const pendingFactors = factors.totp.filter((factor) => factor.status !== 'verified');
  const cached = enrollments.get(client);
  if (cached && pendingFactors.some((factor) => factor.id === cached.factorId)) {
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
  return result;
}

export async function verifyMfa(client: SupabaseClient, factorId: string, code: string) {
  if (!/^[0-9]{6}$/.test(code)) throw new Error('Enter the six-digit authenticator code.');
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
  clearPendingMfa(client);
}
