/** Browser-visible tenancy helpers are hints, NEVER authorization. */
export type TenantContext = Readonly<{ tenantId: string; branchId?: string }>;
export function matchesTenant(context: TenantContext, tenantId: string): boolean {
  return Boolean(context.tenantId) && context.tenantId === tenantId;
}
export function matchesBranch(context: TenantContext, tenantId: string, branchId: string): boolean {
  return matchesTenant(context, tenantId) && context.branchId === branchId;
}
export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}
/** Custom domains are accepted ONLY after server-side ownership verification and active tenant lookup. */
export function findVerifiedTenantByHostname(hostname: string, verifiedDomains: ReadonlyArray<Readonly<{ hostname: string; tenantId: string; active: boolean }>>): string | null {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return null;
  const matches = verifiedDomains.filter((entry) => entry.active && normalizeHostname(entry.hostname) === normalized);
  return matches.length === 1 ? matches[0].tenantId : null;
}
