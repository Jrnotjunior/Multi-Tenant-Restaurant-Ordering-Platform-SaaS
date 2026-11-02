-- Return only the authenticated user's own staff display name for the requested tenant.
-- Names are read from the tenant membership profile and never expose another staff member.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_staff_display_name(p_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT NULLIF(
    BTRIM(CONCAT_WS(
      ' ',
      NULLIF(BTRIM(m.staff_first_name), ''),
      NULLIF(BTRIM(m.staff_last_name), '')
    )),
    ''
  )
  FROM public.tenant_memberships AS m
  WHERE m.tenant_id = p_tenant_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
    AND m.role IN ('cashier', 'kitchen', 'dispatcher', 'rider')
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.get_my_staff_display_name(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_staff_display_name(uuid) TO authenticated;

COMMIT;
