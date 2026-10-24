# W2T-006 — Branch-aware ordering menus (2026-10-24)

## Scope and isolation
- Repository: `Jrnotjunior/Multi-Tenant-Restaurant-Ordering-Platform-SaaS`
- Supabase project: Web2Table `wvibrchebfwirbgkcnbr`
- **Separate System Admin repository is NOT connected, read, modified or integrated.**
- Checkout, billing, and production order acceptance remain disabled.

## Database changes
Applied migration: `20261024020007_w2t_006_branch_menus_owner_controls`.

New public invoker RPCs with privately implemented, verified authorization:
- `create_owner_branch(p_tenant_id,p_slug,p_name)` — creates *inactive* branch, max 20 per tenant, requires tenant owner and AAL2
- `update_owner_branch(p_tenant_id,p_branch_id,p_name,p_active)` — renames or activates a branch, prevents disabling default branch, requires tenant owner and AAL2
- `get_branch_storefront(p_slug,p_branch_slug)` — anonymous read of only active, published restaurant and requested active branch; branch choices return only safe slug/name fields and items are priced and filtered per branch

The previous `get_published_storefront(p_slug)` remains intact for compatibility. No new direct table INSERT/UPDATE grants are issued to browsers. Database FKs prevent cross-tenant branch/item assignments. Privileged RPC wrappers in `public` are invoker-only, with restricted EXECUTE; trusted implementations are in `private`.

## Customer mobile storefront
- `/` and `/order/baryo-kitchen` still show explicitly fictitious **Baryo Kitchen** data, now with two sample branch choices
- Sample Main contains all sample items; Sample Makati has a subset with intentionally different illustrative prices
- Customer branch choice is stored as `?branch=makati` in the URL and preserved in the restaurant menu link
- Published tenants use `/order/<tenant-slug>?branch=<branch-slug>`; no cross-tenant or invalid branch fallback
- A branch change clears basket contents and category/search filters to avoid mixing stock and prices across locations
- Mobile touch-friendly select, sticky cart, responsive layout retained
- Customer-facing menu no longer links to internal System Admin

The branch choice is a menu preview selection, NOT verified delivery eligibility: server-side dispatch/geofence selection comes with secure delivery checkout.

## Restaurant Owner dashboard
- Create an inactive branch with safe slug and name
- Rename an existing branch and activate/deactivate non-default branches
- Choose a branch and edit per-product availability
- Set an optional branch-specific PHP price (integer centavos); blank restores base price
- Default branch remains active and cannot be changed in this slice
- No unrestricted public registration or privileged bootstrap

## Verification
Single SQL rollback-only test passed with synthetic Auth users, tenants, items and branches. It checked:
1. Owner AAL1 and staff forbidden from branch creation
2. Owner AAL2 can create only in own tenant
3. New branches start inactive
4. Cross-tenant branch mutation denied
5. Default branch deactivation denied
6. Anonymous published branch menu gives correct branch price/availability and safe branch choices
7. Unknown, invalid, unpublished, or deactivated branches return no menu
8. Existing default branch lookup remains compatible
9. Browser roles have no direct branch writes or anonymous branch-table SELECT

All database test fixtures were rolled back. No real restaurants, admins, members, or orders were created. Supabase security advisor: 0 findings. Existing unused-index and an older multiple-permissive-policy *performance* note are not security-advisor errors and will be addressed in a future performance review.

## Later milestones
- Real tenant onboarding after separate System Admin integration is approved
- Auto-select fulfillment branch from validated delivery location
- Product photos and modifier options, stock alignment, subscriptions
- Secure customer checkout and PayMongo integrations, server-side price validation
- Browser end-to-end tests on live, intentionally invited accounts once provisioning is enabled
