# Web2Table Foundation Reconciliation

**Assessment date:** 2026-10-26  
**Target application:** `Jrnotjunior/Multi-Tenant-Restaurant-Ordering-Platform-SaaS` (`main`)  
**Supabase project:** `wvibrchebfwirbgkcnbr`  
**Scope:** Read-only baseline review. No live schema, auth configuration, or data was changed during this assessment.

## Summary

The live database and repository migration history are not currently reproducible from the committed migration directory alone.

- Live Supabase reports **56 applied migration entries**.
- The repository currently contains **48 migration SQL files**.
- Comparing normalized migration names identifies **10 applied migration names without a same-name committed file**, and **2 repository migration names not present in live migration history**. Some timestamp/version changes may explain part of this difference; these entries must be reconciled against the actual SQL and live schema before making any history changes.

### Applied names without a same-name committed migration

- `add_service_only_bootstrap_candidate_check`
- `system_admin_invitation_lifecycle`
- `allow_unverified_pending_admin_invite_finalize`
- `system_admin_administrator_list`
- `system_admin_delete_empty_tenant`
- `w2t_037_system_admin_totp_reset_audit`
- `system_admin_audit_logs_rpc`
- `reload_postgrest_schema_for_system_admin_audit_logs`
- `system_admin_mapbox_usage_rpc`
- `restore_system_admin_access_control_rpcs`

### Repository migration names not present in live history

- `fix_resumable_owner_onboarding`
- `w2t_036_mfa_admin_reset_audit`

These lists are based on migration names, not a claim that the live schema is missing those changes. Version-only differences also exist and require content-level reconciliation.

## Security advisor baseline

The Supabase Security Advisor currently reports:

- **9** RLS-enabled tables without RLS policies.
- **3** exposed `SECURITY DEFINER` functions callable by `anon`.
- **31** exposed `SECURITY DEFINER` functions callable by `authenticated`.

Advisor findings are risk indicators, not proof that every function is exploitable. Review function bodies, grants, search paths, tenant/branch authorization checks, and intended public behavior before changing permissions.

Tables reported as RLS-enabled with no policies:

- `private.platform_admin_invitations`
- `public.customer_order_audit_events`
- `public.customer_order_items`
- `public.customer_order_payment_sessions`
- `public.customer_orders`
- `public.delivery_assignments`
- `public.mapbox_usage_events`
- `public.mfa_admin_reset_audit`
- `public.system_admin_audit_logs`

The anonymous-callable definer functions include `create_customer_order`, `get_public_storefront_directory`, and `get_public_storefront_favicon`. Guest ordering and public storefront reads may be intentional. Keep required guest flows working while verifying input validation, order-scoped access, rate/abuse protections, grants, and data minimization.

The live function inventory also shows some privileged System Admin RPCs with explicit function-level `search_path` values. Review those definitions for schema qualification and search-path safety; do not change them mechanically without inspecting function bodies and dependencies.

## Safe remediation order

1. **Reconcile migrations:** compare every same-name and version-mismatched migration's SQL with live schema/function definitions. Identify whether each unmatched entry is a rename, an applied-but-uncommitted change, or a repository-only change.
2. **Restore reproducibility:** commit missing migration source only after recovering and reviewing the exact SQL that was applied. Do not fabricate migration SQL from names. For repository-only migrations, determine whether they were superseded, intentionally not deployed, or missing from the live history.
3. **Review database access:** audit each exposed `SECURITY DEFINER` function, including grants, caller identity, tenant/branch scoping, input validation, search path, and side effects. Preserve intentional guest checkout and public storefront RPCs.
4. **Test RLS and grants:** write positive and negative tests for cross-tenant and cross-branch access. Confirm whether policy-less tables are meant to be service-only or accessed only through narrowly scoped RPCs. Narrow table grants where justified by the tested access model.
5. **Auth hardening:** assess enabling compromised/leaked-password protection against existing invitation, sign-in, and recovery flows before applying the setting.
6. **CI and evidence:** ensure deterministic dependency installs with committed lockfiles, typecheck/unit/build tests, database policy/function tests, dependency and secret scanning, and deployment evidence.
7. **Verify each change:** run targeted tests and Supabase security/performance advisors after each database change. Record any remaining exceptions and their owners.

## Guardrails

- Do **not** reset the project or blindly replay migrations.
- Do **not** delete or rewrite migration history to make counts match.
- Do **not** revoke all `SECURITY DEFINER` function access wholesale; several may be required for server-validated workflows.
- Do **not** claim SOC 2 compliance based on advisor results or this document. This is readiness work; formal attestation requires scoped controls, evidence, and an independent examination.
- Preserve multi-tenancy, tenant-specific PayMongo routing, refunds, dine-in/pickup/delivery fulfillment, and guest checkout where deliberately supported. No POS is in scope.

## Current status

**Baseline recorded; remediation not yet applied.** The next safe step is content-level migration reconciliation, followed by review of the highest-risk exposed functions and policy-less tables before any live permission changes.
