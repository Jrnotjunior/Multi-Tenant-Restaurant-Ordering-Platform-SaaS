# SOC 2 Readiness Assessment — 2026-11-03

## Conclusion

Web2Table is **not verified SOC 2 compliant and must not be represented as SOC 2 compliant or certified**. This is a repository-level assessment, not an independent examination. SOC 2 evaluates the service organization's described controls and whether those controls are suitably designed and operate effectively over an auditor-agreed period; source code alone cannot establish that.

The existing readiness register in [`SOC2_READINESS.md`](SOC2_READINESS.md) remains the control plan. This assessment records only checks that could be made from this checkout. No live Supabase, GitHub settings, or Hostinger control-plane audit was available in this session.

## Repository checks

| Area | Finding | Evidence / limit |
| --- | --- | --- |
| Database row isolation | Positive static indicator | All 29 tables created in the checked migrations have a corresponding `ENABLE ROW LEVEL SECURITY` statement. This does not validate deployed schema, policies, grants, views, Storage policies, or cross-tenant behavior in the live project. |
| Privileged database functions | Positive static indicator | 116 migration-defined `SECURITY DEFINER` declarations were checked; all set a fixed `search_path`. Function-specific authorization and effective grants still require review against the deployed database. |
| Application checks | Partially present | Existing CI runs dependency audit, typecheck, unit tests, and build. CI has not been independently inspected for required status checks or protected-branch settings. |
| Secret detection | Added, not yet evidenced | Gitleaks workflow now scans full Git history on pushes, pull requests, and weekly schedule. First successful scan and any findings must be reviewed; a clean scan does not prove secrets were never exposed. |
| Static application security | Added, not yet evidenced | CodeQL `security-extended` workflow now scans JavaScript/TypeScript on changes and weekly. Results and alert remediation remain to be reviewed. |
| Edge Function validation | Added, not yet evidenced | A Deno workflow now type-checks every Supabase Edge Function and audits resolved dependencies. A committed Deno lockfile is still needed for repeatable resolution. |
| Dependency maintenance | Partially addressed | Web dependencies are exact-pinned and all Supabase Edge Function imports now use the same exact `@supabase/supabase-js` version. Dependabot is configured for weekly npm and GitHub Actions update pull requests. The repository still has no npm or Deno lockfile, so transitive dependency resolution is not yet reproducible. Generating and verifying a lockfile was blocked because this environment could not reach package registries. |
| Production configuration | Not assessed | No authenticated access to Supabase project settings/advisors, GitHub security/branch settings, or Hostinger deployment and runtime configuration was available. |
| Organizational controls and audit evidence | Not established | Named control owners, approved policies, access reviews, staff training, risk reviews, incident/tabletop records, vendor reviews, backup restore evidence, and retention/deletion evidence require business operation and records outside this repository. |

## Required next steps before an auditor-ready claim

1. Generate and validate `package-lock.json` and Deno's dependency lock; make CI use reproducible locked installs for both runtimes.
2. Run the new secret scan and CodeQL workflow, investigate every finding, rotate any exposed credential, and retain dated results.
3. Inspect the deployed Supabase schema with Security Advisor and verify RLS, grants, Storage policies, Auth/MFA/rate limits, database network restrictions, backups/PITR, log access, and restore evidence.
4. Enable and document GitHub branch protection, required checks, review approval, least-privilege workflow permissions, Dependabot alerts, and secret-scanning settings. Preserve an approved emergency-change path.
5. Verify production hosting security headers/TLS, deployment approvals, separation from development, rollback, and access reviews.
6. Assign accountable people and complete the policies, vendor due diligence, privacy/data-retention processes, incident response exercises, risk register, and recurring control evidence listed in `SOC2_READINESS.md`.
7. Agree system scope and selected Trust Services Criteria with an independent SOC 2 auditor, collect evidence throughout the observation period, remediate findings, and complete the engagement before making a SOC 2 report claim.

Until those items are implemented and evidenced, approved public wording is: “security controls are being developed with SOC 2 readiness in mind.”

## Follow-up verification — 2026-11-03

The GitHub Actions page was inspected for the latest main commit `bbc68b5` (Open rider delivery address directly in Google Maps). Its Foundation checks passed, and its CodeQL and Secret scan workflows passed. This indicates those workflows completed successfully; findings still need review in their respective security dashboards.

The Edge Function checks failed because Deno attempted to resolve `@supabase/supabase-js` from a local `node_modules` directory, which had not been installed. The repository mixes Deno Edge Functions with a root npm `package.json`. The workflow now runs `deno check --node-modules-dir=none` so Deno resolves npm packages from its managed cache. This change is pending a new GitHub Actions run. A committed Deno lockfile and npm lockfile are still outstanding; package-registry access from this workstation timed out, so reproducible dependency installs are not yet complete.
