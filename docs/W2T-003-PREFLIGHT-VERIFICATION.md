# W2T-003 — Privileged preflight hardening

## Change
A server-side invitation/membership eligibility check runs before displaying authenticator enrollment or challenge in privileged frontend routes.

The new SQL function validates the current authenticated user and requested workspace:
- admin: active platform_admins record
- restaurant: active tenant membership or an unexpired sent invitation tied to this exact verified Auth identity
- any other workspace or unknown user: false

It returns only a boolean. It runs inside a private SECURITY DEFINER function with fixed search path, exposed through a public SECURITY INVOKER wrapper. It does not grant access to any tenant data, bypass MFA, or accept an invitation.

## Verification
- Applied to Supabase Web2Table project only: wvibrchebfwirbgkcnbr
- Actual migration version: 20261024013150
- Transactional SQL tests: eligible admin, restaurant owner, invited staff, stranger, cross-route requests and revoked invitation all passed.
- Fixture users, tenants and invitations were rolled back.
- Supabase security advisor reported 0 security findings immediately after deployment.

## Remaining integration work
The trusted administrator bootstrap and actual email sender deployment are still pending approved identity, Auth redirect allowlist and SMTP setup. No real users have been elevated and no actual invitation email was sent.

Only the designated GitHub repository is changed.
