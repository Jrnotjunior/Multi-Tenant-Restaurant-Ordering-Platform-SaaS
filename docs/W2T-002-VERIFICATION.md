# W2T-002 verified execution — 2026-10-24

Target: Supabase **Web2Table** project `wvibrchebfwirbgkcnbr` (not the older project).

## Applied migrations
- `w2t_002_multitenant_foundation` — Supabase migration version `20261024011006`; source file `supabase/migrations/20261024000000_w2t_002_multitenant_foundation.sql`
- `w2t_002_branch_membership_fk_index` — follow-up to cover composite FK; source file `supabase/migrations/20261024011007_w2t_002_branch_membership_fk_index.sql`

**Version reconciliation note:** Supabase assigns migration versions at apply time. The foundation file name is a source artifact, and its numeric prefix is *not* the Supabase recorded migration version. Do not blindly replay this file against the same project without reconciling history. Future migration files should use the recorded version when available.

## Verified
- All five tables created; each RLS enabled; initially 0 persisted rows
- Table grants: anon has no SELECT; authenticated has SELECT and no INSERT/UPDATE/DELETE
- Composite tenant/branch and tenant/membership foreign keys present
- Rollback-only SQL transaction inserted synthetic tenants, branches and auth users
- Owner AAL2: own tenant, branches and domain visible; unrelated tenant not visible
- Staff AAL2: assigned branch visible; unassigned branches and owner-only domain hidden
- Owner AAL1: no tenant read access
- Cross-tenant branch membership insert rejected by FK
- Test fixtures rolled back (no test tenants retained)
- Supabase security advisor reported 0 lints immediately after foundation migration
- Performance advisor initially flagged missing composite index; follow-up index migration addresses it
- W2T-001 CI was green prior to this migration

## Remaining
- Verify post-index security/performance advisor state
- Keep browser operational UI inactive
- Build invitation and trusted provisioning workflows in W2T-003
- Add durable automated database integration tests beyond this initial manually executed rollback-only check
- These checks do not constitute penetration testing or security certification

No older Web2Table repositories were changed.
