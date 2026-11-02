# SOC 2 Readiness Assessment — 2026-11-03

## Conclusion

Web2Table is **not verified SOC 2 compliant and must not be represented as SOC 2 compliant or certified**. This is a repository-level assessment, not an independent examination. SOC 2 evaluates the service organization's described controls and whether those controls are suitably designed and operate effectively over an auditor-agreed period; source code alone cannot establish that.

The existing readiness register in [`SOC2_READINESS.md`](SOC2_READINESS.md) remains the control plan. This assessment combines repository review with a limited live review of the connected Supabase and GitHub dashboards. Hostinger controls, the complete business control environment, and independent auditor evidence were not available.

## Repository checks

| Area | Finding | Evidence / limit |
| --- | --- | --- |
| Database row isolation | Positive static indicator | All 29 tables created in the checked migrations have a corresponding `ENABLE ROW LEVEL SECURITY` statement. This does not validate deployed schema, policies, grants, views, Storage policies, or cross-tenant behavior in the live project. |
| Privileged database functions | Positive static indicator | 116 migration-defined `SECURITY DEFINER` declarations were checked; all set a fixed `search_path`. Function-specific authorization and effective grants still require review against the deployed database. |
| Application checks | Partially present | Existing CI runs dependency audit, typecheck, unit tests, and build. CI has not been independently inspected for required status checks or protected-branch settings. |
| Secret detection | Operational in CI | The full-history Gitleaks workflow passed on `f3d2831`. A clean scan does not prove secrets were never exposed; any previously exposed credentials still require rotation and evidence. |
| Static application security | Operational in CI; one finding remediated | CodeQL `security-extended` passed on commit `f3d2831`; GitHub Code Scanning now shows 0 open and 1 closed alert on `main`. This establishes a successful scan and alert closure, not the absence of every vulnerability. |
| Edge Function validation | Operational in CI; lockfile gap remains | Edge Function type-checking and Deno dependency audit passed on commit `f3d2831`. A committed Deno lockfile is still needed for repeatable resolution. |
| Dependency maintenance | Partially addressed | Web dependencies are exact-pinned and all Supabase Edge Function imports now use the same exact `@supabase/supabase-js` version. Dependabot is configured for weekly npm and GitHub Actions update pull requests. The repository still has no npm or Deno lockfile, so transitive dependency resolution is not yet reproducible. Generating and verifying a lockfile was blocked because this environment could not reach package registries. |
| Production database advisors | Findings observed; remediation in progress | Live Supabase Security Advisor reports 0 errors, 48 warnings, and 7 informational suggestions. Health Advisor reports 0 errors, 0 warnings, and 0 suggestions. A live catalog query found 61 public-schema `SECURITY DEFINER` procedures: 7 callable by `anon`, 40 by `authenticated`, and 60 by `service_role` (roles overlap). The public storefront lookup, favicon, tenant resolution, and token-based order tracking are active anonymous flows. A trigger-only fiscal audit writer and an older nine-argument order-creation function are also exposed to both client roles; a migration has been prepared to revoke those direct client grants while preserving the active service-role order path. Do not mark this remediated until deployment and advisor recheck. |
| Production configuration | Partially assessed | Live Supabase Health and Security Advisors and GitHub security overview were inspected. Supabase production settings for MFA enforcement, network restrictions, backups/PITR, retention, log access, and restore tests remain unverified. GitHub shows code scanning and secret scanning enabled, while Dependabot alerts and private vulnerability reporting are disabled; enabling them awaits confirmation. Hosting-provider configuration remains unverified. |
| Organizational controls and audit evidence | Not established | Named control owners, approved policies, access reviews, staff training, risk reviews, incident/tabletop records, vendor reviews, backup restore evidence, and retention/deletion evidence require business operation and records outside this repository. |

## Required next steps before an auditor-ready claim

1. Generate and validate `package-lock.json` and Deno's dependency lock; make CI use reproducible locked installs for both runtimes.
2. Retain the passing secret-scan and CodeQL workflow results, investigate any new finding, rotate any exposed credential, and keep dated evidence.
3. Deploy and verify the prepared grant-hardening migration, then review each remaining Supabase Security Advisor finding. Verify RLS, Storage policies, Auth/MFA/rate limits, database network restrictions, backups/PITR, log access, and restore evidence.
4. Enable and document GitHub branch protection, required checks, review approval, least-privilege workflow permissions, Dependabot alerts, and secret-scanning settings. Preserve an approved emergency-change path.
5. Verify production hosting security headers/TLS, deployment approvals, separation from development, rollback, and access reviews.
6. Assign accountable people and complete the policies, vendor due diligence, privacy/data-retention processes, incident response exercises, risk register, and recurring control evidence listed in `SOC2_READINESS.md`.
7. Agree system scope and selected Trust Services Criteria with an independent SOC 2 auditor, collect evidence throughout the observation period, remediate findings, and complete the engagement before making a SOC 2 report claim.

Until those items are implemented and evidenced, approved public wording is: “security controls are being developed with SOC 2 readiness in mind.”

## Follow-up verification — 2026-11-03

The GitHub Actions page was inspected for the latest main commit `bbc68b5` (Open rider delivery address directly in Google Maps). Its Foundation checks passed, and its CodeQL and Secret scan workflows passed. This indicates those workflows completed successfully; findings still need review in their respective security dashboards.

The Edge Function checks failed because Deno attempted to resolve `@supabase/supabase-js` from a local `node_modules` directory, which had not been installed. The repository mixes Deno Edge Functions with a root npm `package.json`. The workflow now runs `deno check --node-modules-dir=none` so Deno resolves npm packages from its managed cache. This change is pending a new GitHub Actions run. A committed Deno lockfile and npm lockfile are still outstanding; package-registry access from this workstation timed out, so reproducible dependency installs are not yet complete.

After the CI resolution fix, Deno reported type errors in the payment cancellation/refund helper signatures because `ReturnType<typeof createClient>` was resolving to the package's empty default schema type. The helper/client annotations now preserve the SDK's generic `any` schema so these existing dynamic-schema RPCs can be checked. This type correction is pending CI verification and does not change runtime behavior or replace database authorization.

The next Edge Function workflow run (`41501886786`) completed successfully: all Supabase Edge Function type checks and the Deno dependency audit passed. GitHub Security overview still showed Dependabot alerts and private vulnerability reporting disabled; enabling these repository settings is pending explicit action-time confirmation. The latest CodeQL alert was a high-severity DOM XSS path from a selected image file through a `blob:` URL into an image `src`. The owner menu now displays the selected filename as text until server-side upload and uses only the existing validated storage URL for previews. CodeQL subsequently passed on `f3d2831`, and GitHub Code Scanning now shows 0 open, 1 closed alert.

### Live database and repository follow-up — 2026-11-03

The connected Supabase project is labeled `main / PRODUCTION` in Studio. Security Advisor currently reports **0 errors, 48 warnings, 7 suggestions**; Health Advisor reports **0 errors, 0 warnings, 0 suggestions**. A read-only catalog query found 61 public-schema `SECURITY DEFINER` functions, of which 7 are executable by `anon`, 40 by `authenticated`, and 60 by `service_role`. The effective grants were checked rather than inferred from migration text. The public storefront lookup, favicon, tenant resolution, and tracking functions match current client call sites. The anonymous nine-argument order-creation overload is not used by current clients; the active order Edge Function calls the coordinate-aware overload using its server-side service-role client. A fiscal tax-policy audit procedure is a database trigger function and should not be exposed as a PostgREST RPC.

A new migration revokes direct API execution from the trigger-only fiscal audit writer and from the obsolete client-facing order-creation overload while preserving the active Edge Function's service-role order path. This migration is **prepared but not yet deployed**. The live project is labeled production, so do not report the change as complete until it has been applied with action-time authorization and the Security Advisor has been rerun. Remaining warnings include intentionally public, narrowly scoped RPCs and must be reviewed individually rather than suppressed wholesale.

On the current repository history, all five workflows for commit `f3d2831` completed successfully: Foundation checks, Secret scan, preview deployment, CodeQL security analysis, and Edge Function checks. GitHub Code Scanning shows 0 open and 1 closed alert for `main`. Earlier static notes about an unassessed live database have been superseded by this limited advisor/catalog inspection, but this is not a full Supabase configuration review.
