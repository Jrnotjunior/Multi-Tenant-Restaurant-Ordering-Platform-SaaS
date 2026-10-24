# W2T-009 — System Admin dashboard integration (read-only)

The **original finalized System Admin UI** stays in its own repository, with unchanged styling, layout and screens. Its dashboard now calls `public.web2table_admin_dashboard_snapshot()` instead of the older project's nonexistent `system_admin_get_dashboard_summary` and `system_admin_get_restaurant_monitoring` APIs.

## Live data

The endpoint returns current `public.tenants` counts and real active `public.platform_admins` counts, plus a bounded list of up to 100 restaurant monitoring rows. Existing restaurant list UI adapts `tenants` rows to its current view model. No tenant data, accounts or admin roles are created.

## Security

- Public API wrapper: SECURITY INVOKER; GRANT EXECUTE only to `authenticated`.
- Private implementation: SECURITY DEFINER with empty search path and a first-statement `private.is_platform_admin()` check. That helper enforces BOTH an active platform administrator row and a JWT containing AAL2 after MFA.
- `anon` gets no EXECUTE privilege. No table-level RLS is loosened. No service secret is used by the browser.
- Rollback SQL verified guests cannot execute the endpoint, an AAL1 administrator is rejected, an AAL2 active admin gets a well-formed snapshot, and a synthetic tenant is reflected in the report; synthetic tenant was rolled back.
- True customer orders, order history, active customer sessions, system audit events and health telemetry are **not integrated yet**. Metrics are zero for unimplemented product features and the frontend reports a health-monitoring warning. Empty audit activity is not a claim of complete audit coverage.
- Legacy restaurant detail and mutation services still require migration; do not assume existing buttons are connected.

## Table Editor

The correct System Administrator table in the Web2Table Supabase project is `public.platform_admins`; user identities are in `auth.users` (Authentication → Users). There is no need to create a duplicate `system_administrator` table.
