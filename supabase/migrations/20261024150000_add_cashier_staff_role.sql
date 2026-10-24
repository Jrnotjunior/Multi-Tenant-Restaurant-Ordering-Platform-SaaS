BEGIN;

-- Cashiers are restaurant staff, scoped to one active branch just like kitchen,
-- dispatch, and rider accounts. This does not create POS or payment functionality.
ALTER TABLE public.tenant_memberships
  DROP CONSTRAINT IF EXISTS tenant_memberships_role_check;
ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_role_check
  CHECK (role = ANY (ARRAY['restaurant_owner','cashier','kitchen','dispatcher','rider']::text[]));

ALTER TABLE public.privileged_invitations
  DROP CONSTRAINT IF EXISTS privileged_invitations_role_check;
ALTER TABLE public.privileged_invitations
  ADD CONSTRAINT privileged_invitations_role_check
  CHECK (role = ANY (ARRAY['restaurant_owner','cashier','kitchen','dispatcher','rider']::text[]));

CREATE OR REPLACE FUNCTION private.request_privileged_invitation(
  p_tenant_id uuid,
  p_email text,
  p_role text,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_invite uuid;
BEGIN
  IF v_user IS NULL OR NOT private.privileged_session_verified() THEN
    RAISE EXCEPTION 'Verified privileged session required' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('restaurant_owner','cashier','kitchen','dispatcher','rider') OR p_role IS NULL THEN
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
$function$;

COMMIT;
