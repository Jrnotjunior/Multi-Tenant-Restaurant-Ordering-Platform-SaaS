import { describe, expect, it } from 'vitest';
import { isGranted, mustUseMfa } from '../src/domain/authorization';

describe('privileged identity frontend guardrails', () => {
  it('requires MFA for every operational role', () => {
    for (const role of ['platform_admin', 'restaurant_owner', 'kitchen', 'dispatcher', 'rider'] as const) {
      expect(mustUseMfa(role)).toBe(true);
    }
  });
  it('does not give staff permission to provision tenants', () => {
    for (const role of ['restaurant_owner', 'kitchen', 'dispatcher', 'rider'] as const) {
      expect(isGranted(role, 'tenants.manage')).toBe(false);
    }
  });
});
