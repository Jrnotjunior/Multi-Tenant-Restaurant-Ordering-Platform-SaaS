# W2T-005 — Restaurant provisioning and owner menu management

## Scope
Repository: Jrnotjunior/Multi-Tenant-Restaurant-Ordering-Platform-SaaS
Supabase project: Web2Table (`wvibrchebfwirbgkcnbr`).

The System Admin workspace now has an initial restaurant + first branch creation form, tenant listing, and owner invitation queueing interface. **Queueing is not sending:** the email delivery Edge Function is not deployed.

The Restaurant Owner workspace provides an MFA-guarded editor for:
- storefront name, tagline, hero copy, and brand color;
- draft/published storefront state;
- creation and publication of menu categories;
- creation/editing of menu products, PHP prices, description, popular flag and draft/published/archived status;
- branch availability for each product, with published branch price overrides supported in the database (UI editing of overrides later).

## Authorization
- `private.admin_create_restaurant` is a private SECURITY DEFINER function guarded by `private.is_platform_admin()`, requiring a verified AAL2 session. The public wrapper is SECURITY INVOKER.
- Creation atomically establishes an active tenant, active first branch, and **unpublished** storefront. No privileged users, domains or subscriptions are automatically assigned.
- RLS allows only MFA-verified active owners to view and edit catalog tables in their own tenant. Staff, anonymous users and other tenants cannot modify records.
- No direct catalog DELETE is permitted to browser roles; deletion/archive policies will be designed with order history.
- Shared immutable-identity triggers stop tenant/primary-key reassignment through UPDATE.
- Customer menu publication remains a separate read-only, whitelisted anonymous endpoint. Checkout is still disabled.
- Browser membership and routing gates are UX; Postgres policies and protected RPCs are authoritative.

## Verification
- Rollback-only synthetic integration transaction: admin AAL2 provisioning, admin AAL1 rejection, owner AAL1 denial, owner AAL2 catalog create/update/publish, public read of published menu, cross-tenant write and FK rejection, immutable tenant ID guard, and staff write/read restrictions all passed.
- First execution exposed a table-column error in the shared trigger; fixed by `w2t_005_fix_catalog_identity_trigger` and reran the test successfully.
- Both database migrations are applied and versioned in Supabase and committed verbatim in this repository.
- No real tenant, user, invitation email, or payment activity created.
- GitHub Actions and deployment checks should be reviewed for the final commit.

## Activation dependencies and remaining work
1. Explicit designation, identity verification and trusted bootstrap of the initial platform admin.
2. Approved Auth redirect allowlists, SMTP/email provider and deploy/test the invitation delivery Edge Function.
3. Real owner invitation acceptance and MFA browser E2E tests.
4. Owner branch creation / switching, business plan entitlements and storefront image management.
5. Product modifiers, inventory alignment and server-validated checkout prior to live orders.

The GitHub Pages preview still displays the clearly labeled example menu until a real tenant is onboarded and published.
