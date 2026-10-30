/**
 * Stable, versioned contract between Web2table and the separate POS application.
 *
 * These are transport/domain types only. They do not authorize a tenant, create
 * sales, or issue tax invoices. Trusted backend APIs must validate every field.
 */
export const POS_INTEGRATION_VERSION = "v1" as const;

export type PosOrderSource = "web2table_online" | "web2table_qr" | "pos_manual";
export type PosFulfillmentType = "delivery" | "pickup" | "takeout" | "dine_in";
export type PosPaymentStatus = "unpaid" | "pending" | "paid" | "partially_refunded" | "refunded" | "failed";

export type PosTenantContext = Readonly<{
  tenantId: string;
  branchId: string;
}>;

export type PosOrderLineSnapshot = Readonly<{
  productId: string;
  name: string;
  quantity: number;
  unitAmountMinor: number;
  lineAmountMinor: number;
  modifiers?: readonly Readonly<{ name: string; amountMinor: number }>[];
}>;

export type PosOrderSnapshot = Readonly<{
  contractVersion: typeof POS_INTEGRATION_VERSION;
  externalOrderId: string;
  tenantId: string;
  branchId: string;
  source: Exclude<PosOrderSource, "pos_manual">;
  fulfillmentType: PosFulfillmentType;
  currency: "PHP";
  lines: readonly PosOrderLineSnapshot[];
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  paymentStatus: PosPaymentStatus;
  createdAt: string;
  updatedAt: string;
}>;

export type PosTransactionRequest = Readonly<{
  contractVersion: typeof POS_INTEGRATION_VERSION;
  tenantId: string;
  branchId: string;
  idempotencyKey: string;
  source: PosOrderSource;
  externalOrderId?: string;
  currency: "PHP";
  lines: readonly PosOrderLineSnapshot[];
  subtotalMinor: number;
  discountMinor: number;
  taxAmountMinor?: number;
  totalMinor: number;
  paymentMethod: "cash" | "card" | "online" | "ewallet" | "other";
  paymentStatus: PosPaymentStatus;
  occurredAt: string;
}>;

export type PosTransactionAcknowledgement = Readonly<{
  transactionId: string;
  tenantId: string;
  branchId: string;
  idempotencyKey: string;
  accepted: boolean;
  createdAt: string;
}>;

export type PosInvoiceStatus =
  | "not_requested"
  | "pending"
  | "issued"
  | "failed"
  | "voided";

export type PosInvoiceReference = Readonly<{
  transactionId: string;
  tenantId: string;
  branchId: string;
  status: PosInvoiceStatus;
  providerReference?: string;
  issuedAt?: string;
}>;

/** Basic client-side guard only; repeat validation on the trusted server. */
export function isValidPosTenantContext(value: PosTenantContext): boolean {
  return isNonEmpty(value.tenantId) && isNonEmpty(value.branchId);
}

/** Money is represented as integer minor units to avoid floating-point amounts. */
export function isValidPosTransactionRequest(value: PosTransactionRequest): boolean {
  if (value.contractVersion !== POS_INTEGRATION_VERSION) return false;
  if (!isNonEmpty(value.tenantId) || !isNonEmpty(value.branchId) || !isNonEmpty(value.idempotencyKey)) return false;
  if (!Number.isSafeInteger(value.subtotalMinor) || value.subtotalMinor < 0) return false;
  if (!Number.isSafeInteger(value.discountMinor) || value.discountMinor < 0) return false;
  if (!Number.isSafeInteger(value.totalMinor) || value.totalMinor < 0) return false;
  if (value.taxAmountMinor !== undefined && (!Number.isSafeInteger(value.taxAmountMinor) || value.taxAmountMinor < 0)) return false;
  if (!Number.isFinite(Date.parse(value.occurredAt))) return false;
  if (value.lines.length === 0) return false;
  return value.lines.every((line) =>
    isNonEmpty(line.productId)
    && isNonEmpty(line.name)
    && Number.isSafeInteger(line.quantity) && line.quantity > 0
    && Number.isSafeInteger(line.unitAmountMinor) && line.unitAmountMinor >= 0
    && Number.isSafeInteger(line.lineAmountMinor) && line.lineAmountMinor >= 0
    && (line.modifiers ?? []).every((modifier) =>
      isNonEmpty(modifier.name)
      && Number.isSafeInteger(modifier.amountMinor)
      && modifier.amountMinor >= 0
    )
  );
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}
