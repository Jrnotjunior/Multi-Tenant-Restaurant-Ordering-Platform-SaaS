-- Expose only the public address for the active branch currently being ordered from.
CREATE OR REPLACE FUNCTION public.get_public_branch_address(p_slug text,p_branch_slug text DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT b.store_address FROM public.tenants t
 JOIN public.tenant_storefronts s ON s.tenant_id=t.id
 JOIN public.branches b ON b.tenant_id=t.id AND b.is_active
 WHERE t.slug=p_slug AND t.status='active' AND s.status='published'
 AND ((p_branch_slug IS NULL AND b.id=s.default_branch_id)
   OR (p_branch_slug IS NOT NULL AND b.slug=p_branch_slug))
 AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
 AND (p_branch_slug IS NULL OR p_branch_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
$fn$;
REVOKE ALL ON FUNCTION public.get_public_branch_address(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_branch_address(text,text) TO anon,authenticated;