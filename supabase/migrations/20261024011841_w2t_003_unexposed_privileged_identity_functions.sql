-- Keep elevated functions outside the exposed public schema.
-- Thin invoker wrappers maintain RPC compatibility and require authenticated permission.
BEGIN;
ALTER FUNCTION public.request_privileged_invitation(uuid,text,text,uuid) SET SCHEMA private;
ALTER FUNCTION public.accept_privileged_invitation(uuid) SET SCHEMA private;

CREATE FUNCTION public.request_privileged_invitation(
  p_tenant_id uuid,p_email text,p_role text,p_branch_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.request_privileged_invitation(p_tenant_id,p_email,p_role,p_branch_id);
$$;

CREATE FUNCTION public.accept_privileged_invitation(p_invitation_id uuid)
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.accept_privileged_invitation(p_invitation_id);
$$;

REVOKE ALL ON FUNCTION public.request_privileged_invitation(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.accept_privileged_invitation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_privileged_invitation(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_privileged_invitation(uuid) TO authenticated;
COMMIT;
