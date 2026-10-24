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
  const verified = factors.totp.find((factor) => factor.status === 'verified');
  if (verified) {
    enrollments.delete(client);
    return { kind: 'challenge', factorId: verified.id };
  }
  const cached = enrollments.get(client);
  if (cached && factors.totp.some((factor) => factor.id === cached.factorId)) return cached;

  // An unverified factor may have been created on another device. Don't
  // silently delete it: failed enrollment requires a controlled recovery path.
  if (factors.totp.length > 0) {
    throw new Error('Incomplete authenticator enrollment detected. Contact the platform administrator to reset MFA safely.');
  }

  let { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Web2Table Authenticator',
  });
  if (error) {
    // Re-check first: the initial request may have succeeded server-side even
    // if its response was interrupted, or another tab may have enrolled MFA.
    const { data: latestFactors, error: latestFactorsError } = await client.auth.mfa.listFactors();
    if (!latestFactorsError) {
      const latestVerified = latestFactors.totp.find((factor) => factor.status === 'verified');
      if (latestVerified) return { kind: 'challenge', factorId: latestVerified.id };
      const latestPending = latestFactors.totp.find((factor) => factor.status !== 'verified');
      if (latestPending) {
        throw new Error('An authenticator setup is already pending for this account. Sign out and reopen your invitation link to resume setup, or ask the platform administrator to reset the incomplete setup.');
      }
    }

    // Supabase requires factor friendly names to be unique for a user. If a
    // stale factor name still conflicts but isn't returned by listFactors,
    // retry once with a unique label rather than looping on the same 422.
    if (/friendly name|already exists|duplicate/i.test(error.message)) {
      const uniqueName = `Web2Table Authenticator ${Date.now()}`;
      const retry = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: uniqueName });
      data = retry.data;
      error = retry.error;
    }
    if (error) throw error;
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
