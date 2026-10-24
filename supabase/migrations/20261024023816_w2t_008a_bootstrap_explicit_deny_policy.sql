BEGIN;
-- Explicitly document the deny-by-default posture for every browser role;
-- trusted SECURITY DEFINER functions continue to use their owner privileges.
CREATE POLICY first_admin_invite_no_browser_read
ON private.platform_admin_bootstrap_invites
FOR SELECT TO anon,authenticated USING (false);
COMMIT;
