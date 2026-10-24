# W2T-007 — Product images and modifiers (October 24, 2026)

## Repository and scope
Work performed exclusively in `Jrnotjunior/Multi-Tenant-Restaurant-Ordering-Platform-SaaS` with existing Web2Table Supabase project `wvibrchebfwirbgkcnbr`.
No reading, connecting, or modifying the user's separate System Admin repository.

## Database and storage
Applied migration `20261024020734_w2t_007_product_images_modifiers` creates two tenant-scoped tables:
- `menu_modifier_groups` — each group belongs to an existing product, with minimum/maximum selections, sort order and publication state
- `menu_modifier_options` — price additions (integer centavos), visibility state and parent group relation using composite tenant+item+group foreign key

Owner read/write RLS requires an active owner membership with MFA AAL2. Browser roles cannot DELETE records. An anonymous browser cannot SELECT draft groups/options directly. The existing whitelisted public branch menu RPC was expanded to return only active groups and active options for already published, available items. It includes optional `imagePath`; published photos remain in a dedicated **public** media bucket, not a private customer-data bucket.

The public Storage bucket `menu-images` restricts formats to JPEG/PNG/WebP and object uploads to 3 MiB. An authenticated owner with MFA may INSERT a uniquely named object only under `<tenant UUID>/<item UUID>/<random UUID>.<extension>`. A database constraint prevents attaching a cross-tenant or cross-item image to a product. The browser cannot overwrite or delete an existing image object.

## Restaurant Owner interface
- Choose a product, create an initially hidden modifier group, specify required minimum and maximum selections
- Add an initially hidden option with an additional PHP price
- Enable published options and groups independently
- Upload a product photo and replace the product's photo pointer with the newly uploaded object
- Photos are intended for **public restaurant advertising only**. Stale/orphaned objects require controlled cleanup later.

## Customer experience
- Real menu cards display published restaurant photos, or the existing artwork fallback
- Products with modifier groups open a responsive, accessible customization dialog
- Required/optional selections have limits; the UI refuses to add an invalid selection
- A customer's customized selections are stored as distinct cart variants, displaying option labels and updated prices
- Switching restaurants or branches clears the basket; prices remain whole integer centavos
- The Baryo Kitchen demo includes one item with a required size selection and optional extras

## Verification
Rollback-only synthetic database test passed:
- AAL1 owner denied modifier write
- AAL2 owner allowed within own tenant only
- Cross-tenant modifier linkage rejected
- Cross-tenant image path rejected
- Anonymous public menu includes only whitelisted active choices and valid attached photo path
- Draft option remains invisible, other owner cannot read draft modifiers
- No synthetic data persisted

No real tenants, photos, accounts, menu records or orders were created. Checkout, payment, and server-side validation of selected customizations for real orders are **not implemented**. Before production: clean old images, enforce group cardinality at publish time and checkout, implement recipe/inventory linkage, verify real browser upload and storage flows using explicitly onboarded users, and finalize order snapshots with server-authoritative prices.

The older performance advisor notes are separate from the zero-findings security advisor.
