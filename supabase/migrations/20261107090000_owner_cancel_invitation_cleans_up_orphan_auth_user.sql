-- Cancelled staff invitations should not leave invitation-only Auth accounts behind.
-- Preserve revoked invitation rows for audit and clear the FK before Auth deletion.
CREATE OR REPLACE FUNCTION public.owner_cancel_privileged_invitation(p_tenant_id uuid, p_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_invitation public.privileged_invitations%rowtype;
  v_user_id uuid;
BEGIN
  IF v_actor IS NULL OR NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'Verified restaurant owner access required' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_invitation
  FROM public.privileged_invitations i
  WHERE i.id = p_invitation_id
    AND i.tenant_id = p_tenant_id
    AND i.role IN ('cashier', 'kitchen', 'dispatcher', 'rider')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found for this restaurant' USING ERRCODE = 'P0002';
  END IF;

  IF v_invitation.status NOT IN ('pending', 'sent') THEN
    RAISE EXCEPTION 'Only pending or sent invitations can be cancelled' USING ERRCODE = '22023';
  END IF;

  v_user_id := v_invitation.invited_user_id;

  UPDATE public.privileged_invitations
  SET status = 'revoked', invited_user_id = NULL
  WHERE id = v_invitation.id
    AND tenant_id = p_tenant_id
    AND status IN ('pending', 'sent');

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_user_id IS NOT NULL
     AND v_invitation.accepted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.user_id = v_user_id)
     AND NOT EXISTS (SELECT 1 FROM public.branch_memberships bm WHERE bm.user_id = v_user_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.privileged_invitations other
       WHERE other.invited_user_id = v_user_id AND other.id <> v_invitation.id
     )
     AND EXISTS (
       SELECT 1 FROM auth.users u
       WHERE u.id = v_user_id
         AND lower(u.email) = lower(v_invitation.email)
         AND u.raw_user_meta_data ->> 'tenant_invitation_id' = v_invitation.id::text
         AND u.raw_user_meta_data ->> 'invitation_type' = 'restaurant_staff'
     )
  THEN
    DELETE FROM auth.users WHERE id = v_user_id;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_cancel_privileged_invitation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_cancel_privileged_invitation(uuid, uuid) TO authenticated;
