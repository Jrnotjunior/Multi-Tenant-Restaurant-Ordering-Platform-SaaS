# Architecture — W2T-001

**Decision:** begin with a modular monolith and a single repository. Physical apps or deployment boundaries may be separated later when justified by operational constraints.

## Boundaries

1. `app`: composition and route shells. Not yet authenticated.
2. `domain`: pure tenancy and role helpers for UI and validation. **These do not enforce security**.
3. `lib`: public runtime configuration and Supabase browser client.
4. Future modules: tenant/branch, auth, subscriptions, menus, ordering, payments, kitchen, dispatch, rider, inventory, recipes, loyalty and reporting.

## Non-negotiable isolation

- Resolve a verified hostname to exactly one active tenant on a trusted server.
- Treat all client tenant and branch identifiers as untrusted.
- Apply tenant-aware foreign keys and Postgres RLS to every exposed tenant-owned table.
- Enforce role, membership, MFA, branch assignment and subscription entitlements in backend RPCs/APIs.
- Keep payments, inventory and loyalty transitions idempotent and transactional.
- Use private, authorized real-time streams and storage policies.
- No access to operational data before identity and authorization are implemented.

## Deployment

The initial scaffold is a static Vite app. Hostinger can serve built static assets. Backend logic will use Supabase, but shared hosting features must be verified before production selection. Support SPA fallback routing for /order, /restaurant and /admin on the eventual host.

## Current limitations

No database schema is deployed, no customer or staff login exists, and no order placement is operational. The visual route shells are explicitly nonfunctional. No live payment, domain activation or subscription capability is claimed.

## Mandatory modularity rule — applies to the entire system

This is a project-wide engineering rule, not a dashboard-only convention. All new code and all substantial refactors must preserve clear module boundaries so faults can be isolated, tested and fixed without collateral changes.

### Required module boundaries

- **Application shell and routing:** compose pages and route requests; do not contain business rules or database workflows.
- **Feature modules:** keep each business capability in its own feature area (for example authentication/MFA, tenant and branch management, menus, ordering, payments, kitchen, dispatch, riders, inventory, recipes, employees, sales, loyalty, subscriptions, reporting and branding).
- **UI components:** presentation and user interaction only; do not embed privileged authorization decisions or complex data access.
- **Application services/use cases:** coordinate feature workflows and business operations.
- **Domain layer:** reusable types, invariants and pure business rules; avoid UI framework and network dependencies.
- **Data-access layer:** centralize Supabase queries, RPC calls and persistence mapping per feature. Do not scatter raw database calls throughout page components.
- **Shared platform modules:** centralize configuration, logging/error reporting, reusable UI primitives and cross-cutting utilities without turning them into a dumping ground for feature logic.

### Troubleshooting and change-safety requirements

1. Keep modules small, cohesive and named for one responsibility. Split files when they mix routing, UI, business logic and persistence.
2. Give modules explicit inputs/outputs and typed interfaces. Avoid hidden global coupling and circular imports.
3. Keep tenant/branch authorization and role checks enforced server-side through database RLS and trusted backend operations; UI visibility is not security.
4. Model loading, empty, error, permission-denied and success states explicitly. Never invent operational data to fill a UI.
5. Add focused tests for domain rules and service behavior, plus integration tests for critical flows such as sign-in/MFA, tenant isolation, order lifecycle and payment transitions.
6. Before committing, run the relevant type checks, tests and production build. Report failures honestly; do not describe queued checks as passing.
7. Make changes in the smallest relevant module, update its tests and document cross-module contract changes. Avoid unrelated rewrites and preserve established behavior unless the change explicitly requires otherwise.
8. Keep logs useful for diagnosing failures, but never log passwords, MFA codes, session tokens, payment secrets or other sensitive data.
9. Each feature must document its responsibility, dependencies, data access, authorization boundary and test entry points.
10. Prefer a **modular monolith** with enforced internal boundaries over premature microservices. Extract a separately deployed service only when there is a demonstrated operational reason.

### Definition of done for architecture changes

A feature is not complete merely because its screen renders. Its responsibilities must be separated into appropriate modules, data access and authorization must be explicit, failure states must be actionable, relevant tests/checks must run, and any unverified behavior must be clearly disclosed.
