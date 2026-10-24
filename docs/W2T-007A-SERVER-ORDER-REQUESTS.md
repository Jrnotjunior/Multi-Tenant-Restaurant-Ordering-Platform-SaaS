# W2T-007A — Server-validated customer order requests

## Scope

This slice adds the private order model and trusted order-request endpoint required for guest and registered customer delivery ordering. It does **not** enable the storefront's submit button: owner order operations and an explicit acceptance control must exist before customer-facing live order intake is enabled.

Project: Web2Table Supabase, `wvibrchebfwirbgkcnbr`.
Repository: `Jrnotjunior/Multi-Tenant-Restaurant-Ordering-Platform-SaaS`.

## Database model

- `public.customer_orders` holds the customer delivery contact details, tenant and branch, generated order number, idempotency key/fingerprint, server-calculated subtotal, and independent order/payment states.
- `public.customer_order_items` stores immutable item-name, unit-price, quantity, line-total and selected-modifier snapshots. It does not depend on the menu remaining unchanged after the request.
- Both tables have RLS enabled, no browser table grants and no direct browser policies. Reads and writes must go through reviewed functions.
- `tenant_storefronts.accepting_orders` defaults to `false`. A published menu alone does not enable order requests.

## RPC and validation

`public.create_customer_order(p_restaurant_slug, p_branch_slug, p_customer_name, p_customer_phone, p_delivery_address, p_delivery_notes, p_idempotency_key, p_items)` is an invoker wrapper around `private.create_customer_order` (fixed empty search path, security definer).

At request time the server:
- requires an active tenant, published storefront with `accepting_orders = true`, and active requested branch;
- accepts only bounded JSON line objects containing item ID, quantity and modifier-option IDs—client price/name fields are rejected;
- rechecks that every item/category/branch assignment is currently published and available and locks catalog rows while building the snapshot;
- revalidates every selected modifier ID, active group and required/min/max cardinality;
- calculates line prices from current branch override/base price plus current modifier prices using integer centavos;
- limits lines, quantities, payload size, phone format and subtotal; applies a basic per-phone throttle;
- uses a per-tenant idempotency key and payload fingerprint so same-request retries return the original order, while changed-payload key reuse is rejected.

A successful response creates a `pending_confirmation` request with `payment_status = not_started`. The delivery fee and payable total remain unconfirmed. This API does not charge money, confirm delivery eligibility, send notifications, or replace the missing restaurant order inbox. An edge/WAF rate limiter is still needed before broad public release.

## Verification

Migration sequence applied to the Web2Table Supabase project:
- `20261024042000_w2t_007a_server_validated_customer_orders.sql`
- `20261024043000_w2t_007a_fix_customer_order_validation.sql`
- `20261024044000_w2t_007a_order_acceptance_gate.sql`

Rollback-only smoke test: `supabase/tests/w2t_007a_customer_orders_rollback.sql`.

Verified against synthetic fixtures in a single rollback transaction:
1. Published-but-not-accepting storefront is rejected by default.
2. Enabling acceptance in the fixture allows a valid server-calculated request; an item at 19,900 centavos with a 5,000-centavo modifier and quantity 2 returns 49,800 centavos.
3. Item and modifier snapshots are persisted within the test transaction.
4. Same key + same payload returns the original order; same key + changed payload is rejected.
5. Unknown modifier IDs, missing required selections and client-supplied price fields are rejected.
6. Anonymous execute on the RPC is granted, while anonymous/authenticated direct SELECT/INSERT access to order tables is not granted.
7. The test transaction rolls back completely. Follow-up catalog checks found no persisted test tenant or orders; no current storefront is configured to accept orders.

## Next

Implement the MFA-protected restaurant-owner order inbox and explicit acceptance toggle, then connect the checkout form to this RPC. Payment, delivery-fee quotation, notifications and dispatch remain later work.
