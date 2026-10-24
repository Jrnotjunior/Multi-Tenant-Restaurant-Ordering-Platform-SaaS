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
  const { data: assurance, error: assuranceError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) throw assuranceError;
  if (assurance.currentLevel === 'aal2') {
    enrollments.delete(client);
    return { kind: 'ready' };
  }

  const { data: factors, error: factorsError } = await client.auth.mfa.listFactors();
  if (factorsError) throw factorsError;

  // If the user already completed MFA, never enroll again: challenge the
  // existing verified factor. After successful verification the gate will
  // re-check AAL2 and continue to the authorized restaurant dashboard.
  const verified = factors.totp.find((factor) => factor.status === 'verified');
  if (verified) {
    enrollments.delete(client);
    return { kind: 'challenge', factorId: verified.id };
  }

  const cached = enrollments.get(client);
  if (cached && factors.totp.some((factor) => factor.id === cached.factorId)) return cached;

  // Reuse a pending factor when possible instead of creating a duplicate.
  // The QR secret is not available from listFactors, so we cannot safely
  // reconstruct its QR. Tell the user explicitly that this is not a fresh
  // enrollment and offer the recovery action below.
  if (factors.totp.length > 0) {
    throw new Error('An incomplete authenticator setup exists for this account. Your authenticator has not been confirmed as verified. Use “Restart incomplete authenticator setup” to replace only unverified factors, then scan the new QR code once.');
  }

  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Web2Table Authenticator ${Date.now()}`,
  });
  if (error) {
    // Enrollment can succeed server-side even if its response is interrupted.
    // Re-read factors before showing an error or creating another factor.
    const { data: latestFactors, error: latestFactorsError } = await client.auth.mfa.listFactors();
    if (!latestFactorsError) {
      const latestVerified = latestFactors.totp.find((factor) => factor.status === 'verified');
      if (latestVerified) return { kind: 'challenge', factorId: latestVerified.id };
      if (latestFactors.totp.length > 0) {
        throw new Error('An authenticator setup is already pending for this account. Restart the incomplete setup only if you have not verified an authenticator yet.');
      }
    }
    throw error;
  }
  if (!data?.totp?.qr_code || !data.totp.uri) throw new Error('Authenticator enrollment information unavailable.');
  const result: MfaFlow = { kind: 'enroll', factorId: data.id, qrCode: data.totp.qr_code, uri: data.totp.uri };
  enrollments.set(client, result);
  return result;
}

export async function verifyMfa(client: SupabaseClient, factorId: string, code: string) {
  if (!/^[0-9]{6}$/.test(code)) throw new Error('Enter the six-digit authenticator code.');
  const { data, error } = await client.auth.mfa.challenge({ factorId });
  if (error) throw error;
  const { error: verifyError } = await client.auth.mfa.verify({ factorId, challengeId: data.id, code });
  if (verifyError) throw verifyError;
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
