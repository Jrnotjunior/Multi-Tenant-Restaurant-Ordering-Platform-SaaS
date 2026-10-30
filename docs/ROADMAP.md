# Web2Table incremental roadmap

- **W2T-001 — Initial repository foundation:** React+TS UI shells, public client config, pure tenancy/role helpers, tests, documentation, initial CI. Not a functioning SaaS.
- **W2T-002 — Schema and RLS foundation:** design tenants, memberships, branches and active domain ownership; implement minimal migration and cross-tenant access tests in designated development database.
- **W2T-003 — Identity:** invitation-only privileged account workflow, TOTP MFA gate, staff/branch role enforcement.
- **W2T-004 — Tenant/domain/branch settings:** verified DNS, TLS, branch settings and secure hostname resolution.
- **W2T-005 — Plans:** three packages and backend entitlements; baseline ordering, kitchen, dispatch, riders, inventory, recipes, loyalty and advanced reports remain in all tiers.
- **W2T-006 — Multi-branch menus (delivered):** owner-guarded branch creation and activation, branch-specific prices, public branch selection, and branch-scoped carts.
- **W2T-007A — Server order-request API (implemented and rollback-tested):** private order/order-line snapshots, server-calculated prices and modifiers, branch availability, idempotency, bounded guest details, RLS/table-grant isolation, and a default-off `accepting_orders` gate. Checkout remains preparation-only until restaurant operations can receive and act on requests.
- **W2T-007B — Restaurant order operations (in progress):** added MFA-gated owner/cashier order inbox RPC, branch-scoped cashier reads/writes, guarded order transitions and owner-controlled order acceptance. Owner Orders UI now reads real order snapshots and exposes status actions. Rollback test added; run the SQL verification against the target development database before considering this task delivered. Customer checkout/payment remain disabled until order flow is verified.
- **W2T-007 — Payments and order state:** PayMongo linked merchant readiness, signed child webhooks, refunds, separate payment/fulfillment state. No live payments are enabled.
- **W2T-008 — Kitchen and realtime:** state machine, queues, event history and replay/recovery.
- **W2T-009 — Dispatch and delivery:** Mapbox central location integration, rider assignments and external Google Maps/Waze navigation.
- **W2T-010 — Operations:** branch inventory/recipes, restaurant-wide loyalty ledger and analytics.
- **W2T-011 — Hardening:** integration/e2e/security testing, incident response, data privacy review, backup/restore, production deployment verification.\n- **W2T-POS-001 — POS integration contract (design/types added):** define tenant/branch-safe API contract, money/status types, idempotency expectations, ownership boundaries and contract tests. Production endpoints, persistence, RLS, durable events and BIR-compliant invoicing are not implemented; see `docs/POS_INTEGRATION_CONTRACT.md`.

Each NEXT delivers the smallest independently verifiable task. Avoid speculative abstractions and microservices. POS integration preparation is now documented, but no production POS API or official invoice issuance is enabled.
