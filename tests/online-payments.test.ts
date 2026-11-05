import { describe, expect, it } from 'vitest';
import {
  enabledPayMongoPaymentTypes,
  hasActivePayMongoAccount,
  isTenantOnlinePaymentEligible,
} from '../supabase/functions/_shared/onlinePayments';

const allMethods = {
  card: true, gcash: true, qrph: true, grab_pay: true,
  paymaya: true, dob: true, billease: true,
};
const activeLiveAccount = {
  paymongo_account_id: 'org_testfixture',
  connection_status: 'active',
  activation_status: 'activated',
};

describe('shared tenant PayMongo eligibility', () => {
  it('requires the System Admin entitlement and at least one owner-enabled method', () => {
    expect(isTenantOnlinePaymentEligible({ enabled: false, methods: allMethods })).toBe(false);
    expect(isTenantOnlinePaymentEligible({ enabled: true, methods: {} })).toBe(false);
  });

  it('does not require a live merchant account for tenant test-mode availability', () => {
    expect(isTenantOnlinePaymentEligible({
      enabled: true,
      provider_configured: false,
      methods: { gcash: true },
    })).toBe(true);
  });

  it('uses tenant payment settings without branch-specific account requirements', () => {
    expect(enabledPayMongoPaymentTypes({ gcash: true, card: false, billease: true }))
      .toEqual(['gcash', 'billease']);
    // Branches share the same tenant settings; account readiness is enforced
    // separately by the checkout endpoint for its selected environment.
    expect(isTenantOnlinePaymentEligible({ enabled: true, methods: { gcash: true } })).toBe(true);
    expect(isTenantOnlinePaymentEligible({ enabled: true, methods: { gcash: false } })).toBe(false);
  });

  it('requires activation only for live accounts, preserving the test-mode account flow', () => {
    expect(hasActivePayMongoAccount({ ...activeLiveAccount, activation_status: null }, 'test')).toBe(true);
    expect(hasActivePayMongoAccount({ ...activeLiveAccount, activation_status: null }, 'live')).toBe(false);
  });
});
