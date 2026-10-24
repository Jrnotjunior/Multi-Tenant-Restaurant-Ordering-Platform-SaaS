import { describe, expect, it } from 'vitest';
import { isGranted, mustUseMfa } from '../src/domain/authorization';
describe('role UI hints', () => {
  it('does not give customers platform controls', () => expect(isGranted('customer', 'tenants.manage')).toBe(false));
  it('does not give riders permission to assign orders', () => expect(isGranted('rider', 'dispatch.assign')).toBe(false));
  it('requires MFA for privileged roles', () => { expect(mustUseMfa('restaurant_owner')).toBe(true); expect(mustUseMfa('customer')).toBe(false); });
});
