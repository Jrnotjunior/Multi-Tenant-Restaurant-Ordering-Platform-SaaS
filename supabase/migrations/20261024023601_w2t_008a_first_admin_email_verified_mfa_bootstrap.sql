-- W2T-008A: strictly scoped first-administrator bootstrap invitation.
-- An email address alone never grants an administrator session.
BEGIN;
CREATE TABLE private.platform_admin_bootstrap_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  claimed_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  claimed_at timestamptz,
  CHECK (email=lower(btrim(email)) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  CHECK (expires_at>created_at),
  CHECK ((claimed_user_id IS NULL)=(claimed_at IS NULL))
);
ALTER TABLE private.platform_admin_bootstrap_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.platform_admin_bootstrap_invites FROM PUBLIC,anon,authenticated;

-- Is the signed-in identity a pending, email-verified invited candidate?
-- Designed to permit safe MFA enrollment before admin privileges are assigned.
CREATE FUNCTION private.is_initial_admin_bootstrap_candidate()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS(
   SELECT 1 FROM auth.users u
   JOIN private.platform_admin_bootstrap_invites i
     ON i.email=lower(btrim(u.email))
   WHERE u.id=(SELECT auth.uid()) AND u.email_confirmed_at IS NOT NULL
     AND i.claimed_user_id IS NULL AND i.expires_at>now()
     AND NOT EXISTS (SELECT 1 FROM public.platform_admins)
 );
$fn$;

CREATE FUNCTION public.is_initial_admin_bootstrap_candidate()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT private.is_initial_admin_bootstrap_candidate();
$fn$;

-- Require BOTH verified control of the invited email and a fresh AAL2
-- authenticator. This is the only path that writes the first admin record.
CREATE FUNCTION private.claim_initial_admin_bootstrap()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
  v_invite uuid;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'MFA-verified sign-in required' USING ERRCODE='42501';
  END IF;
  -- Serialize all first-admin claims, even across distinct invite addresses.
  PERFORM pg_catalog.pg_advisory_xact_lock(82642,1001);
  IF EXISTS (SELECT 1 FROM public.platform_admins) THEN
    RAISE EXCEPTION 'Initial admin already activated' USING ERRCODE='42501';
  END IF;
  SELECT lower(btrim(u.email)),u.email_confirmed_at
    INTO v_email,v_verified FROM auth.users u WHERE u.id=v_user;
  IF v_email IS NULL OR v_verified IS NULL THEN
    RAISE EXCEPTION 'Verified invited email required' USING ERRCODE='42501';
  END IF;
  SELECT i.id INTO v_invite
    FROM private.platform_admin_bootstrap_invites i
    WHERE i.email=v_email AND i.claimed_user_id IS NULL
      AND i.expires_at>now() FOR UPDATE;
  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'No valid bootstrap invitation for this account' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.platform_admins(user_id,is_active)
    VALUES(v_user,true);
  UPDATE private.platform_admin_bootstrap_invites
    SET claimed_user_id=v_user,claimed_at=now()
    WHERE id=v_invite;
  RETURN true;
END;
$fn$;

CREATE FUNCTION public.claim_initial_admin_bootstrap()
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $fn$
 SELECT private.claim_initial_admin_bootstrap();
$fn$;

REVOKE ALL ON FUNCTION private.is_initial_admin_bootstrap_candidate(),
 private.claim_initial_admin_bootstrap(),
 public.is_initial_admin_bootstrap_candidate(),
 public.claim_initial_admin_bootstrap()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.is_initial_admin_bootstrap_candidate(),
 private.claim_initial_admin_bootstrap(),
 public.is_initial_admin_bootstrap_candidate(),
 public.claim_initial_admin_bootstrap()
 TO authenticated;
COMMIT;
