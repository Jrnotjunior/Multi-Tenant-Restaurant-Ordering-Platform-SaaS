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
