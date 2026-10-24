-- W2T-003 (part 1): invite-only privileged identity and MFA enforced in SQL.
-- Provision platform admins only using trusted, controlled service operations.
BEGIN;

CREATE TABLE public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION private.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT private.privileged_session_verified() AND EXISTS (
    SELECT 1 FROM public.platform_admins AS a
    WHERE a.user_id = (SELECT auth.uid()) AND a.is_active = true
  );
$fn$;
REVOKE ALL ON FUNCTION private.is_platform_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_admin() TO authenticated;

CREATE POLICY platform_admin_self ON public.platform_admins FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND private.is_platform_admin());

CREATE TABLE public.privileged_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('restaurant_owner','kitchen','dispatcher','rider')),
  branch_id uuid,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','accepted','failed','revoked','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  CONSTRAINT privileged_invitations_email_format CHECK (
    email = lower(btrim(email))
    AND char_length(email) BETWEEN 5 AND 254
    AND email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  ),
  CONSTRAINT privileged_invitations_role_branch CHECK (
    (role = 'restaurant_owner' AND branch_id IS NULL)
    OR (role <> 'restaurant_owner' AND branch_id IS NOT NULL)
  ),
  CONSTRAINT privileged_invitations_branch_fk FOREIGN KEY (tenant_id, branch_id)
    REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT privileged_invitations_sent_user CHECK (
    status NOT IN ('sent','accepted') OR invited_user_id IS NOT NULL
  ),
  CONSTRAINT privileged_invitations_accepted_at CHECK (
    status <> 'accepted' OR accepted_at IS NOT NULL
  ),
  CONSTRAINT privileged_invitations_expires CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX privileged_invites_one_open_per_email
  ON public.privileged_invitations(tenant_id,email) WHERE status IN ('pending','sent');
CREATE INDEX privileged_invites_invited_by_created
  ON public.privileged_invitations(invited_by,created_at DESC);
CREATE INDEX privileged_invites_user_lookup
  ON public.privileged_invitations(invited_user_id) WHERE invited_user_id IS NOT NULL;
CREATE INDEX privileged_invites_tenant_branch
  ON public.privileged_invitations(tenant_id,branch_id) WHERE branch_id IS NOT NULL;

ALTER TABLE public.privileged_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY privileged_invites_read_authorized ON public.privileged_invitations
FOR SELECT TO authenticated USING (
  private.is_platform_admin() OR private.is_active_owner(tenant_id)
);

CREATE FUNCTION public.request_privileged_invitation(
  p_tenant_id uuid, p_email text, p_role text, p_branch_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_invite uuid;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified privileged session required' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('restaurant_owner','kitchen','dispatcher','rider') OR p_role IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation role' USING ERRCODE = '22023';
  END IF;
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
     OR char_length(v_email) NOT BETWEEN 5 AND 254 THEN
    RAISE EXCEPTION 'Invalid invitation email' USING ERRCODE = '22023';
  END IF;
  IF p_role = 'restaurant_owner' THEN
    IF NOT private.is_platform_admin() OR p_branch_id IS NOT NULL THEN
      RAISE EXCEPTION 'Platform admin required to invite restaurant owners' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p_tenant_id AND t.status IN ('provisioning','active')) THEN
      RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT private.is_active_owner(p_tenant_id) THEN
      RAISE EXCEPTION 'Restaurant owner required to invite staff' USING ERRCODE = '42501';
    END IF;
    IF p_branch_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.branches b JOIN public.tenants t ON t.id = b.tenant_id
      WHERE b.id = p_branch_id AND b.tenant_id = p_tenant_id
        AND b.is_active = true AND t.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Active branch in own tenant required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Prevent accidental mass invites even when an authorized user's session is abused.
  IF (SELECT count(*) FROM public.privileged_invitations
      WHERE invited_by = v_user AND created_at > now() - interval '1 hour') >= 20 THEN
    RAISE EXCEPTION 'Invitation limit reached' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.privileged_invitations(tenant_id,email,role,branch_id,invited_by)
  VALUES (p_tenant_id,v_email,p_role,p_branch_id,v_user)
  RETURNING id INTO v_invite;
  RETURN v_invite;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'A pending invitation already exists for this recipient and tenant' USING ERRCODE = '23505';
END;
$fn$;

CREATE FUNCTION public.accept_privileged_invitation(p_invitation_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_inv public.privileged_invitations%rowtype;
  v_user uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_existing_role text;
  v_existing_status text;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Authenticator verification is required' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(u.email)), u.email_confirmed_at
    INTO v_email, v_confirmed
  FROM auth.users u WHERE u.id = v_user;
  IF v_email IS NULL OR v_confirmed IS NULL THEN
    RAISE EXCEPTION 'Verified email required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM public.privileged_invitations i
  WHERE i.id = p_invitation_id FOR UPDATE;
  IF NOT FOUND OR v_inv.status <> 'sent' OR v_inv.expires_at <= now()
      OR v_inv.invited_user_id IS DISTINCT FROM v_user
      OR v_inv.email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'Invitation is unavailable or expired' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=v_inv.tenant_id AND t.status IN ('provisioning','active')) THEN
    RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT m.role,m.status INTO v_existing_role,v_existing_status
    FROM public.tenant_memberships m WHERE m.tenant_id=v_inv.tenant_id
      AND m.user_id=v_user FOR UPDATE;
  IF FOUND THEN
    IF v_existing_role <> v_inv.role OR v_existing_status <> 'active' THEN
      RAISE EXCEPTION 'Conflicting membership requires administrator review' USING ERRCODE = '42501';
    END IF;
  ELSE
    INSERT INTO public.tenant_memberships(tenant_id,user_id,role)
      VALUES(v_inv.tenant_id,v_user,v_inv.role);
  END IF;
  IF v_inv.branch_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.id=v_inv.branch_id
      AND b.tenant_id=v_inv.tenant_id AND b.is_active=true) THEN
      RAISE EXCEPTION 'Branch unavailable' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.branch_memberships(tenant_id,branch_id,user_id)
    VALUES(v_inv.tenant_id,v_inv.branch_id,v_user) ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.privileged_invitations
  SET status='accepted',accepted_at=now() WHERE id=v_inv.id AND status='sent';
  RETURN v_inv.role;
END;
$fn$;

REVOKE ALL ON FUNCTION public.request_privileged_invitation(uuid,text,text,uuid)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.accept_privileged_invitation(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_privileged_invitation(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_privileged_invitation(uuid) TO authenticated;

REVOKE ALL ON TABLE public.platform_admins,public.privileged_invitations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.platform_admins,public.privileged_invitations TO authenticated;

COMMIT;

