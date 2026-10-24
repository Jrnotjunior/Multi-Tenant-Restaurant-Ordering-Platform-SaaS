# W2T-004 — Published tenant-specific mobile storefront

## Verified deployment scope

Project: Web2Table Supabase, project ref `wvibrchebfwirbgkcnbr`.
Repository: `Jrnotjunior/Multi-Tenant-Restaurant-Ordering-Platform-SaaS`.

The four new tables are `tenant_storefronts`, `menu_categories`, `menu_items`, and `branch_menu_items`.
All have RLS enabled and **no direct browser table grants**. They are managed only by trusted service provisioning until owner-facing menu editing is added with explicit authorization.

The Data API exposes the read-only `get_published_storefront(p_slug text)` RPC:
- Exposed wrapper is SECURITY INVOKER; private SECURITY DEFINER function whitelists only safe fields.
- Validates tenant slug, active tenant, published storefront and active default branch.
- Includes only published categories and items explicitly available at that branch.
- Reads optional branch price overrides and never exports private tenant IDs, memberships or draft data.
- Limits categories to 40 and published items to 200; invalid or unpublished restaurants return null.
- Does not enable product checkout, order submission or payment collection.
- Domain verification and domain-to-tenant binding still require trusted server infrastructure; browser Host values are not sufficient to authorize anything.

## Frontend routes

`/`, `/order`, and `/order/baryo-kitchen` continue to show the explicitly labeled sample menu (Baryo Kitchen).

`/order/<published-tenant-slug>` now requests the real published menu via the public Supabase endpoint, rendering its branding and items in the same mobile-first storefront. Unknown or unpublished tenants show an unavailable message; never substitute Baryo Kitchen data on a different restaurant's URL.

The cart remains entirely local. Its quantities and totals use the currently loaded tenant menu only, in integer centavos. Checkout stays disabled.

## Validation

Verified in a single SQL transaction with all fixtures rolled back:
- anonymous guest reads only published menu fields;
- branch price override is honored;
- draft storefront, hidden category, and suspended tenant are not published;
- another tenant's records do not leak;
- malformed slugs and cross-tenant foreign-key assignments are rejected;
- browser roles have no direct catalog data-table grants.

Add API/browser end-to-end tests, trusted tenant provisioning, owner menu editing, product image uploads, branch selection, real stock and checkout in follow-on milestones. Do not seed fictitious data into this project.
