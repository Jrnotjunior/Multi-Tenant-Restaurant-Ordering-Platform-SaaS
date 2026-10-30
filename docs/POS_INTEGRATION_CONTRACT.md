# POS integration contract (W2T-POS-001)

**Status: initial read API implemented; transaction API pending.** The `pos-api` Supabase Edge Function implements authenticated session and branch-menu reads. Initial access is restricted to active restaurant owners with an `aal2` (MFA-verified) session. It does not implement transaction writes, cashier provisioning, or BIR compliance.

## Product boundaries

- **Web2table platform** remains authoritative for tenant and branch identity, user membership/roles, online/QR order intake, menu/order snapshots, kitchen, dispatch and delivery.
- **Web2table POS** will own cashier sessions, POS-originated sales, payment tender records, cash drawer/shift operations, receipt printing, void/return workflows and POS-specific reports.
- **Invoicing** is a separate compliance boundary. A printed receipt is not assumed to be a compliant e-invoice. Do not label an invoice as issued unless the legally applicable invoicing workflow confirms issuance.

## Integration rule

The POS must not directly read or write Web2table tables from a browser using a publishable key as a substitute for a contract. Integrate through versioned, trusted server-side endpoints/RPCs. The server resolves the authenticated user and authorized tenant/branch from verified membership; never trust a tenant ID supplied by the browser on its own.

Client contract base path: `/api/pos/v1` (mapped by the POS client to the deployed `pos-api` Edge Function). Implemented reads: `GET /session` and `GET /branches/{branchId}/menu`. Transaction endpoints remain pending.

Initial endpoints to design and secure:
- `GET /branches/{branchId}/orders?status=...` — list orders visible to the authenticated POS user.
- `GET /orders/{orderId}` — return an authorized immutable order/line snapshot.
- `POST /transactions` — record a POS transaction using an idempotency key.
- `POST /orders/{orderId}/checkout` — link a POS transaction to an eligible Web2table order, with an explicit transition guard.
- `POST /transactions/{transactionId}/invoice-status` — record a trusted invoice-provider callback/status, never accept a browser's claim as proof of issuance.
- `GET /transactions/{transactionId}` — retrieve authorized transaction status.

Endpoint names are proposals, not live routes.

## Contract rules

1. **Tenant + branch scope:** Every request and response is scoped to the authenticated user's active tenant and branch membership. Reject cross-tenant and unauthorized cross-branch access server-side.
2. **Server-calculated money:** Treat browser prices, totals, tax, discounts and fees as untrusted. Recalculate or compare against server-authoritative order snapshots before accepting a transaction.
3. **Integer minor units:** Represent PHP amounts as integer minor units (centavos), not floating-point values.
4. **Idempotency:** Require a unique, persisted idempotency key per transaction request, scoped by tenant and operation. Retries return the original result; they do not create a duplicate sale or invoice.
5. **Separate states:** Keep order fulfillment, payment, POS transaction and invoice statuses distinct. A paid order is not proof an invoice was issued; an invoice status is not proof payment settled.
6. **Immutable history:** Preserve transaction snapshots and append-only audit events for payment changes, voids, refunds, invoice issuance/failure and operator actions. Corrections should be compensating records, not silent rewrites.
7. **No secrets in browser:** Never ship service-role/secret keys or invoice-provider credentials to the POS client.
8. **RLS and grants:** Any exposed table needs explicit grants, RLS policies and cross-tenant negative tests. Supabase's service role bypasses RLS and must remain server-side.
9. **Reliable events:** Use an outbox/durable queue or equivalent for cross-system updates; support retries, deduplication, observability and reconciliation.
10. **Versioning:** Keep `contractVersion: "v1"`; make breaking changes through a new version and documented migration.

## Data ownership (initial proposal)

| Data | System of record |
|---|---|
| Tenant, branch, membership, role and entitlement | Web2table |
| Published menu and catalog identifiers | Web2table |
| Online/QR order and fulfillment state | Web2table |
| POS manual-sale transaction and tender/shift details | POS |
| Invoice issuance evidence/status | The compliant invoicing component, referenced by POS and/or Web2table as permitted |
| Cross-system integration event/deduplication record | Trusted integration backend |

A POS transaction linked to an online order must reference the Web2table order ID and must not create a second fulfillment order. Establish explicit reconciliation rules for cancellation, partial refund, full refund, cash on delivery and failed invoice issuance before enabling production checkout.

## Security and delivery gates

Before production use, implement and test:
- Trusted authentication and membership resolution for every endpoint.
- Tenant/branch negative tests, including attempts to substitute another tenant or branch ID.
- Idempotency persistence and concurrent duplicate-request tests.
- Server-side price/tax/discount validation.
- Role/MFA/branch permission checks for cashier, owner and platform support roles.
- Audit trail, monitoring, retries and reconciliation.
- API contract tests shared by both repositories.
- Backup/restore and incident response procedures.

**Not yet implemented:** POS transaction endpoints/tables, explicit cashier role and provisioning, idempotent transaction writes, transaction audit records, durable event delivery, and e-invoicing. The read API is not sufficient to process sales. Do not represent this repository as POS-ready for production until the gates above pass and the applicable BIR path is confirmed.
