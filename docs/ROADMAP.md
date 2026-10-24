# Web2Table V10 incremental roadmap

- **W2T-001 — Initial repository foundation:** React+TS UI shells, public client config, pure tenancy/role helpers, tests, documentation, initial CI. Not a functioning SaaS.
- **W2T-002 — Schema and RLS foundation:** design tenants, memberships, branches and active domain ownership; implement minimal migration and cross-tenant access tests in designated development database.
- **W2T-003 — Identity:** invitation-only privileged account workflow, TOTP MFA gate, staff/branch role enforcement.
- **W2T-004 — Tenant/domain/branch settings:** verified DNS, TLS, branch settings and secure hostname resolution.
- **W2T-005 — Plans:** three packages and backend entitlements; baseline ordering, kitchen, dispatch, riders, inventory, recipes, loyalty and advanced reports remain in all tiers.
- **W2T-006 — Ordering slice:** public menu, server-validated prices and guest/registered delivery checkout.
- **W2T-007 — Payments and order state:** PayMongo linked merchant readiness, checkout, signed child webhooks, refunds, separate payment/fulfillment state.
- **W2T-008 — Kitchen and realtime:** state machine, queues, event history and replay/recovery.
- **W2T-009 — Dispatch and delivery:** Mapbox central location integration, rider assignments and external Google Maps/Waze navigation.
- **W2T-010 — Operations:** branch inventory/recipes, restaurant-wide loyalty ledger and analytics.
- **W2T-011 — Hardening:** integration/e2e/security testing, incident response, data privacy review, backup/restore, production deployment verification.

Each NEXT delivers the smallest independently verifiable task. Avoid speculative abstractions and microservices. No POS, official invoices or other fulfillment methods are part of this plan.
