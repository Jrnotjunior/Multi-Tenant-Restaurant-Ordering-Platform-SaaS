# W2T-003 — Auth and invitation verification (2026-10-24)

## Supabase target
Web2Table project only: \`wvibrchebfwirbgkcnbr\`.

## Applied migrations
- \`20261024011819_w2t_003_privileged_identity_invitation_foundation.sql\`
- \`20261024011841_w2t_003_unexposed_privileged_identity_functions.sql\`

## Verified in rollback-only database transactions
- Active platform admin with AAL2 can request a restaurant-owner invitation
- Another signed-in non-admin cannot request an owner invitation
- Platform administrator rows are invisible to non-admin users
- AAL1 cannot accept an invitation; AAL2 is required
- Verified invited identity accepts a matching owner invitation
- Restaurant owner requests staff invitation for their active branch, but not a branch in another tenant
- A different authenticated user cannot redeem the intended recipient's invitation
- Redeeming an accepted invitation again fails without duplicating membership
- Staff membership and matching branch assignment are created together
- All synthetic users, tenants and invitation test records rolled back
- Supabase security advisor reported 0 findings after moving privileged implementation into private schema

## GitHub verification
CI typecheck, unit tests, and build passed for commit \`e8b1ced9dfaf08692232f87fc8ffed3a0638c592\`.

## Not activated
No platform admin user seeded, no real invitations emailed, and no Edge Function deployed. The invitation sender has only been committed as source because the final approved HTTPS redirect origin, SMTP and auth redirect allowlist are not configured.

Account management requires an explicit trusted initial administrator setup. Browser account self-registration is not an authorization mechanism. Operational content and orders remain disabled.

## Follow-up integration tests before release
- Test actual email delivery + redirect from the deployed Edge Function
- Verify MFA enrollment and challenge on real browser sessions
- Test invitation expiration, failure, duplicate email, and revoked/disabled membership
- Test trusted admin bootstrap with the designated actual user, explicitly authorized
- Verify Auth rate limits, recovery and redirect allowlist
