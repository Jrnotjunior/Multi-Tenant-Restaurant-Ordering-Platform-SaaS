import { describe, expect, it } from 'vitest';
import { findVerifiedTenantByHostname, matchesBranch, matchesTenant } from '../src/domain/tenancy';
describe('tenant boundaries (pure helpers; not a replacement for database RLS)', () => {
  it('rejects cross-tenant identity', () => { expect(matchesTenant({ tenantId: 'restaurant-a' }, 'restaurant-b')).toBe(false); });
  it('requires both tenant and branch match', () => { expect(matchesBranch({ tenantId: 'a', branchId: 'manila' }, 'a', 'makati')).toBe(false); });
  it('resolves only unique, active, verified domains', () => {
    const domains = [{ hostname: 'orders.example.ph', tenantId: 'tenant-a', active: true }, { hostname: 'other.example.ph', tenantId: 'tenant-b', active: false }];
    expect(findVerifiedTenantByHostname('ORDERS.EXAMPLE.PH.', domains)).toBe('tenant-a');
    expect(findVerifiedTenantByHostname('other.example.ph', domains)).toBeNull();
    expect(findVerifiedTenantByHostname('unknown.ph', domains)).toBeNull();
    expect(findVerifiedTenantByHostname('orders.example.ph', [...domains, domains[0]])).toBeNull();
  });
});
