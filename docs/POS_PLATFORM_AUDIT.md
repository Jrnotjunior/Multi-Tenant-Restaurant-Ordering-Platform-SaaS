# Web2table POS Readiness Audit

**Date:** 2026-10-30  
**Scope:** Read-only review of the Web2table SaaS repository and connected Supabase schema/catalog. This is an architecture review, not a penetration test, SOC 2 assessment, or legal opinion. No database writes or migrations were performed.

## Summary

The platform has useful foundations: tenant and branch identities, tenant/branch memberships, server-validated online order creation, line-item snapshots, integer-centavo money values, idempotency for online orders, PayMongo payment sessions/webhooks, guarded order transitions, order audit events, and realtime order notifications.

**Production POS integration is not implemented.** `docs/POS_INTEGRATION_CONTRACT.md` and `src/domain/posIntegration.ts` are a design/types foundation. The reviewed repository does not have a production POS API or a complete POS transaction, tender, cashier shift, void/return, or invoice-issuance model.

## Findings

### Tenant and branch access

- `tenants`, `branches`, `tenant_memberships`, and `branch_memberships` exist in Supabase.
- Composite foreign keys keep branch membership and order branch references aligned to their tenant.
- Core tables use RLS policies and private authorization helpers, including active membership/owner and branch access checks.
- Several privileged functions use `SECURITY DEFINER` with a fixed empty `search_path`; each new function must follow the same careful review of authorization and execute grants.
- RLS being enabled is not proof of complete isolation. This audit did not exercise live requests as separate tenant users or exhaustively test all policies, function grants, edge functions, storage, or realtime permissions.

### Orders and payments

- `customer_orders` stores tenant/branch scope, order status, payment status/method, currency, and amounts in integer centavos.
- `customer_order_items` stores line snapshots including item name, unit price, quantity, line total, and options.
- Existing order creation uses server-side validation and tenant-scoped idempotency.
- Payment sessions, PayMongo webhook/finalization functions, staff order transitions, audit events, and realtime order updates already exist.
- These are online-order/fulfillment primitives, not a full POS ledger. Do not create a second fulfillment order when a POS transaction settles an existing online order.

### CI and tests

- The project uses TypeScript, React, Vite, and Vitest; scripts include typecheck, tests, and build.
- GitHub Actions runs dependency audit, typecheck, unit tests, and build.
- CI currently uses `npm install` and notes the lockfile is pending. A committed lockfile with `npm ci` would improve reproducibility.
- POS tests cover client-side contract validators only; they do not prove API authorization, tenant isolation, concurrency-safe idempotency, or production POS behavior.

## Recommended boundary

**Existing Web2table SaaS owns:** tenant/branch identity, memberships/roles, published menu IDs, online/QR order intake and fulfillment, and its current online payment lifecycle.

**New POS repository owns:** POS UI/device printing, cashier sessions and shifts, POS-originated manual sales, tender breakdowns, cash drawer events, void/return workflows, and POS reports.

**Trusted integration backend owns:** authentication, membership/role/branch authorization, a versioned API, server-side amount validation, persisted idempotency, durable events/retries/reconciliation, and security/transaction audit records.

The POS browser must not access SaaS tables directly as a substitute for an API and must never receive Supabase service-role or provider secrets. Tenant/branch IDs from the browser are selectors, not proof of authorization.

## Gaps before production

1. No live, versioned POS API endpoints; proposed `/api/pos/v1` routes are documentation only.
2. No implemented POS transaction/tender/shift/void/return data model.
3. No shared integration authentication and credential-rotation contract.
4. No durable POS integration outbox/reconciliation workflow.
5. No API-level cross-tenant, cross-branch, role, revoked-membership, or concurrent duplicate-request tests.
6. No verified invoice issuance integration or authoritative invoice evidence flow.
7. BIR obligations need written confirmation for the actual taxpayer/product/service model. Separate repositories or databases do not by themselves settle whether ESP accreditation or another registration/accreditation route applies.
8. CI dependency installation should be made reproducible with a lockfile and `npm ci` after the dependency workflow is confirmed.

## Recommended implementation sequence

1. Agree the trusted API boundary, caller identity flow, tenant/branch role matrix, and error/versioning contract.
2. Implement a read-only endpoint for POS-authorized staff to list eligible online orders, returning immutable snapshots in integer centavos.
3. Add cross-tenant/cross-branch negative tests and role/revocation tests before any POS writes.
4. Design transaction/tender/shift/idempotency/audit/outbox models and reconciliation rules before implementing writes.
5. Confirm the applicable BIR path with a qualified Philippine tax adviser/BIR before implementing or advertising compliant e-invoicing.
6. Gate commercial invoicing on verified legal/provider requirements, end-to-end tests, monitoring, backups, incident response, and audit evidence.

## Conclusion

**Status: integration foundation exists; production POS integration is not implemented.** The next safest engineering step is a tested, read-only, tenant- and branch-authorized API endpoint—not direct database access or immediate invoice issuance. This report is not a claim of BIR compliance or SOC 2 certification.
