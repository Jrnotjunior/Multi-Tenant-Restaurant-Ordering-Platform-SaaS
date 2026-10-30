import { describe, expect, it } from "vitest";
import {
  isValidPosTenantContext,
  isValidPosTransactionRequest,
  POS_INTEGRATION_VERSION,
  type PosTransactionRequest,
} from "../src/domain/posIntegration";

const validRequest: PosTransactionRequest = {
  contractVersion: POS_INTEGRATION_VERSION,
  tenantId: "tenant-1",
  branchId: "branch-1",
  idempotencyKey: "checkout-abc-123",
  source: "pos_manual",
  currency: "PHP",
  lines: [{
    productId: "product-1",
    name: "Chicken rice",
    quantity: 2,
    unitAmountMinor: 12500,
    lineAmountMinor: 25000,
  }],
  subtotalMinor: 25000,
  discountMinor: 0,
  taxAmountMinor: 0,
  totalMinor: 25000,
  paymentMethod: "cash",
  paymentStatus: "paid",
  occurredAt: "2026-10-30T12:00:00.000Z",
};

describe("POS integration contract", () => {
  it("requires explicit tenant and branch context", () => {
    expect(isValidPosTenantContext({ tenantId: "t1", branchId: "b1" })).toBe(true);
    expect(isValidPosTenantContext({ tenantId: "", branchId: "b1" })).toBe(false);
    expect(isValidPosTenantContext({ tenantId: "t1", branchId: " " })).toBe(false);
  });

  it("accepts a valid versioned transaction request", () => {
    expect(isValidPosTransactionRequest(validRequest)).toBe(true);
  });

  it("rejects empty idempotency keys and invalid amounts", () => {
    expect(isValidPosTransactionRequest({ ...validRequest, idempotencyKey: " " })).toBe(false);
    expect(isValidPosTransactionRequest({ ...validRequest, totalMinor: -1 })).toBe(false);
    expect(isValidPosTransactionRequest({
      ...validRequest,
      lines: [{ ...validRequest.lines[0], quantity: 0 }],
    })).toBe(false);
  });

  it("rejects empty lines and invalid timestamps", () => {
    expect(isValidPosTransactionRequest({ ...validRequest, lines: [] })).toBe(false);
    expect(isValidPosTransactionRequest({ ...validRequest, occurredAt: "not-a-date" })).toBe(false);
  });
});
