export type OnlinePaymentSettings = {
  enabled?: unknown;
  methods?: unknown;
  [key: string]: unknown;
} | null;

export type PayMongoAccountStatus = {
  paymongo_account_id?: unknown;
  connection_status?: unknown;
  activation_status?: unknown;
} | null;

export type PayMongoEnvironment = 'live' | 'test';

const PAYMENT_METHODS: ReadonlyArray<readonly [string, string]> = [
  ['card', 'card'],
  ['gcash', 'gcash'],
  ['qrph', 'qrph'],
  ['grab_pay', 'grab_pay'],
  ['paymaya', 'paymaya'],
  ['dob', 'dob'],
  ['billease', 'billease'],
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function enabledPayMongoPaymentTypes(methods: unknown): string[] {
  if (!isRecord(methods)) return [];
  return PAYMENT_METHODS
    .filter(([key]) => methods[key] === true)
    .map(([, providerType]) => providerType);
}

export function hasActivePayMongoAccount(
  account: PayMongoAccountStatus,
  environment: PayMongoEnvironment = 'live',
): boolean {
  if (!account || typeof account.paymongo_account_id !== 'string' || !account.paymongo_account_id.trim()) return false;
  if (account.connection_status !== 'active') return false;
  return environment !== 'live' || account.activation_status === 'activated';
}

export function isTenantOnlinePaymentEligible(settings: OnlinePaymentSettings): boolean {
  return isRecord(settings)
    && settings.enabled === true
    && enabledPayMongoPaymentTypes(settings.methods).length > 0;
}
