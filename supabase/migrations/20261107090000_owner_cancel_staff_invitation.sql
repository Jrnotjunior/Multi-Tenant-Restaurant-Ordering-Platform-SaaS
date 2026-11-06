-- Allow restaurant owners to revoke invitations that have not been accepted.
-- Revocation invalidates the database invitation; it does not delete a shared Auth identity.
BEGIN;

CREATE OR REPLACE FUNCTION public.owner_cancel_privileged_invitation(
  p_tenant_id uuid,
  p_invitation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_invitation public.privileged_invitations%rowtype;
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

  UPDATE public.privileged_invitations
  SET status = 'revoked'
  WHERE id = v_invitation.id
    AND tenant_id = p_tenant_id
    AND status IN ('pending', 'sent');

  RETURN FOUND;
END;
$fn$;

REVOKE ALL ON FUNCTION public.owner_cancel_privileged_invitation(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_cancel_privileged_invitation(uuid, uuid)
  TO authenticated;

COMMIT;
