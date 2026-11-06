import { supabase } from '../../lib/supabase';

export type PosIntegrationStatus = 'not_enabled' | 'pending' | 'active' | 'suspended' | 'revoked';
export type PosIntegrationAction = 'enable' | 'suspend' | 'revoke';

function requireClient() {
  if (!supabase) throw new Error('Supabase client is not configured.');
  return supabase;
}

/** Read and manage POS entitlements. Authorization is enforced by MFA-protected database RPCs. */
export async function loadPosIntegration(tenantId: string): Promise<PosIntegrationStatus> {
  const { data, error } = await requireClient().rpc('get_tenant_pos_integration', { p_tenant_id: tenantId });
  if (error) throw error;
  const status = (data as { status?: unknown } | null)?.status;
  if (typeof status !== 'string' || !['not_enabled', 'pending', 'active', 'suspended', 'revoked'].includes(status)) {
    throw new Error('The POS integration status response is invalid.');
  }
  return status as PosIntegrationStatus;
}

export async function setPosIntegration(
  tenantId: string,
  action: PosIntegrationAction,
  reason = '',
): Promise<PosIntegrationStatus> {
  if (reason.length > 500) throw new Error('Reason must be 500 characters or fewer.');
  const { data, error } = await requireClient().rpc('set_tenant_pos_integration', {
    p_tenant_id: tenantId,
    p_action: action,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  const status = (data as { status?: unknown } | null)?.status;
  if (typeof status !== 'string' || !['not_enabled', 'pending', 'active', 'suspended', 'revoked'].includes(status)) {
    throw new Error('The POS integration update response is invalid.');
  }
  return status as PosIntegrationStatus;
}

export async function requestPosIntegration(tenantId: string): Promise<PosIntegrationStatus> {
  const { data, error } = await requireClient().rpc('request_pos_integration', { p_tenant_id: tenantId });
  if (error) throw error;
  const status = (data as { status?: unknown } | null)?.status;
  if (typeof status !== 'string' || !['not_enabled', 'pending', 'active', 'suspended', 'revoked'].includes(status)) {
    throw new Error('The POS integration request response is invalid.');
  }
  return status as PosIntegrationStatus;
}
