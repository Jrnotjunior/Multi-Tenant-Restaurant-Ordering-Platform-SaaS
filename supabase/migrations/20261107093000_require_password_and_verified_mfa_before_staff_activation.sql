-- Require a password and a verified MFA factor before staff membership is created.
CREATE OR REPLACE FUNCTION private.accept_privileged_invitation(p_invitation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inv public.privileged_invitations%rowtype;
  v_user uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_has_password boolean;
  v_has_verified_mfa boolean;
  v_existing_role text;
  v_existing_status text;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Authenticator verification is required' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(u.email)), u.email_confirmed_at,
         coalesce(length(u.encrypted_password) > 0, false)
    INTO v_email, v_confirmed, v_has_password
  FROM auth.users u WHERE u.id = v_user;
  IF v_email IS NULL OR v_confirmed IS NULL THEN
    RAISE EXCEPTION 'Verified email required' USING ERRCODE = '42501';
  END IF;
  IF NOT v_has_password THEN
    RAISE EXCEPTION 'Create your account password before completing staff onboarding' USING ERRCODE = '42501';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors f
    WHERE f.user_id = v_user AND f.status = 'verified'
  ) INTO v_has_verified_mfa;
  IF NOT v_has_verified_mfa THEN
    RAISE EXCEPTION 'Complete and verify MFA before completing staff onboarding' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_inv FROM public.privileged_invitations i
  WHERE i.id = p_invitation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation is unavailable or expired' USING ERRCODE = '42501';
  END IF;
  IF v_inv.invited_user_id IS DISTINCT FROM v_user OR v_inv.email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION 'Invitation is unavailable or expired' USING ERRCODE = '42501';
  END IF;
  IF v_inv.status = 'accepted' THEN
    IF EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      JOIN public.tenants t ON t.id = m.tenant_id
      WHERE m.tenant_id = v_inv.tenant_id AND m.user_id = v_user
        AND m.role = v_inv.role AND m.status = 'active'
        AND t.status IN ('provisioning','active')
    ) THEN RETURN v_inv.role; END IF;
    RAISE EXCEPTION 'Invitation is unavailable or expired' USING ERRCODE = '42501';
  END IF;
  IF v_inv.status <> 'sent' OR v_inv.expires_at <= now() THEN
    RAISE EXCEPTION 'Invitation is unavailable or expired' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = v_inv.tenant_id AND t.status IN ('provisioning','active')
  ) THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE = '42501'; END IF;
  SELECT m.role, m.status INTO v_existing_role, v_existing_status
  FROM public.tenant_memberships m
  WHERE m.tenant_id = v_inv.tenant_id AND m.user_id = v_user FOR UPDATE;
  IF FOUND THEN
    IF v_existing_role <> v_inv.role OR v_existing_status <> 'active' THEN
      RAISE EXCEPTION 'Conflicting membership requires administrator review' USING ERRCODE = '42501';
    END IF;
  ELSE
    INSERT INTO public.tenant_memberships(tenant_id,user_id,role)
    VALUES(v_inv.tenant_id,v_user,v_inv.role);
  END IF;
  IF v_inv.branch_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = v_inv.branch_id AND b.tenant_id = v_inv.tenant_id AND b.is_active = true
    ) THEN RAISE EXCEPTION 'Branch unavailable' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.branch_memberships(tenant_id,branch_id,user_id)
    VALUES(v_inv.tenant_id,v_inv.branch_id,v_user) ON CONFLICT DO NOTHING;
  END IF;
  UPDATE public.privileged_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_inv.id AND status = 'sent';
  RETURN v_inv.role;
END;
$function$;
