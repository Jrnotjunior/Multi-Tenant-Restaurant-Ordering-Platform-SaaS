-- Check password completion for the authenticated pending staff invitation.
-- Never expose password hashes; return only a boolean to the signed-in invitee.
CREATE OR REPLACE FUNCTION public.privileged_invitation_password_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.privileged_invitations i
    JOIN auth.users u ON u.id = i.invited_user_id
    WHERE i.invited_user_id = auth.uid()
      AND i.status = 'sent'
      AND i.accepted_at IS NULL
      AND u.encrypted_password IS NOT NULL
      AND length(u.encrypted_password) > 0
  );
$function$;

REVOKE ALL ON FUNCTION public.privileged_invitation_password_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privileged_invitation_password_ready() TO authenticated;
