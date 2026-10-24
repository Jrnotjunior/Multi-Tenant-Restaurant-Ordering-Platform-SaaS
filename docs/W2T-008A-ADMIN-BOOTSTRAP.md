# W2T-008A — First administrator secure activation

## Scope
The separate existing System Admin repository is connected to **Web2Table** via the new Supabase project while its legacy application and database remain independent. System Admin GitHub Pages loads the Web2Table interface; its legacy Hostinger build is unchanged.

## Authorized invitation process

The first administrator email was explicitly designated by the project owner and is stored **only** in `private.platform_admin_bootstrap_invites`, **not in the public repository**. The database-backed, unclaimed invitation expires 7 days after authorization (for this request, October 31, 2026).

Do not insert into `platform_admins` on the strength of an email address alone. The new Supabase project must create and confirm a **new Auth identity** through an authorized Auth invitation email. That requires the project Dashboard or a trusted server and is not available through the current Supabase connector.

After the invited email is confirmed in the new Auth project, `is_initial_admin_bootstrap_candidate()` checks the Auth identity against a private pending invitation. The returned boolean authorizes **MFA enrollment only**. It is not an administrator role and cannot read tenants.

Once MFA AAL2 is achieved, `claim_initial_admin_bootstrap()` atomically verifies:
- `auth.uid()` is present and its account has a confirmed email in `auth.users`
- a corresponding unexpired, unclaimed private invitation exists
- no other `platform_admins` row exists
- current signed-in JWT has AAL2 from verified MFA
- a database advisory lock serializes first-admin claims

Only then does the trusted private function create an active `platform_admins` record and consume the invitation. The public wrapper runs as SECURITY INVOKER, and the private implementations use SECURITY DEFINER with an explicit empty search path and revoked PUBLIC grants. The invitation table is inaccessible to `anon`/`authenticated` and RLS denies direct browser reads.

## Human activation step

1. Open the **Web2Table** Supabase project `wvibrchebfwirbgkcnbr`.
2. Configure Authentication > URL Configuration with `https://admin.web2table.io/` as the canonical approved System Admin redirect. You may keep the existing GitHub Pages preview redirect separately for testing. Verify that the custom domain serves the Web2Table admin app, not a legacy build, and that the Auth invitation email sender works.
3. Go to Authentication > Users > Add user > Send invitation and enter the approved first-admin email.
4. Click the received invitation link and open the verified Web2Table System Admin interface at `https://admin.web2table.io/`. Set up TOTP MFA there. The authenticated System Admin app claims access once all security checks pass.
5. Optionally set a strong 12+ character password for future sign-ins.
6. Verify live account access with a real browser login before allowing any privileged restaurant provisioning.

**No invitation email is sent by SQL.** User confirmation and delivery require the Auth invitation step in Supabase Dashboard. Never upload Supabase secret keys or expose a service-role key in the browser.

## Verification

A rollback-only SQL test with synthetic Auth users passed: outsider rejection, unconfirmed-email rejection, AAL1 rejection, AAL2 activation for correctly invited verified email, claim consumption, duplicate denial, and no direct browser table privileges. No test accounts or administrators were retained.

No customer orders or real restaurants were created, no existing accounts were migrated, and no legacy database was modified.

## Custom-domain update
The approved System Admin domain is `https://admin.web2table.io/`. Its live deployment could not be independently inspected in this environment. The existing Hostinger pipeline has a different application-mode setting from the GitHub Pages System Admin preview; do not claim this domain can complete the bootstrap until its deployed build has been checked.
