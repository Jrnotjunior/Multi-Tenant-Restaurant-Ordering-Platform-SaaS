-- Track invitation password completion from an Auth password-hash change.
-- This is server-side state: clients cannot mark their own invitation complete.
CREATE TABLE IF NOT EXISTS private.privileged_invitation_password_setups (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_id uuid NOT NULL REFERENCES public.privileged_invitations(id) ON DELETE CASCADE,
  password_set_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.privileged_invitation_password_setups FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.record_privileged_invitation_password_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
     AND NEW.encrypted_password IS NOT NULL
     AND NEW.encrypted_password <> '' THEN
    INSERT INTO private.privileged_invitation_password_setups(user_id, invitation_id, password_set_at)
    SELECT i.invited_user_id, i.id, now()
    FROM public.privileged_invitations i
    WHERE i.invited_user_id = NEW.id
      AND i.status = 'sent'
      AND i.accepted_at IS NULL
    ORDER BY i.created_at DESC
    LIMIT 1
    ON CONFLICT (user_id) DO UPDATE
      SET invitation_id = EXCLUDED.invitation_id,
          password_set_at = EXCLUDED.password_set_at;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_record_privileged_invitation_password_setup ON auth.users;
CREATE TRIGGER trg_record_privileged_invitation_password_setup
AFTER UPDATE OF encrypted_password ON auth.users
FOR EACH ROW
WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password)
EXECUTE FUNCTION private.record_privileged_invitation_password_setup();

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
    JOIN private.privileged_invitation_password_setups p
      ON p.invitation_id = i.id AND p.user_id = i.invited_user_id
    WHERE i.invited_user_id = auth.uid()
      AND i.status = 'sent'
      AND i.accepted_at IS NULL
  );
$function$;
REVOKE ALL ON FUNCTION public.privileged_invitation_password_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.privileged_invitation_password_ready() TO authenticated;
