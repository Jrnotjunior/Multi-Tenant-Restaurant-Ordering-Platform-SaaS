-- Web2Table-owned subdomains are managed domains and do not require customer DNS verification.
UPDATE public.tenant_domains
SET kind='managed', status='active', verified_at=coalesce(verified_at, now()), activated_at=coalesce(activated_at, now())
WHERE hostname='aikijjo-chicken.web2table.io'
  AND tenant_id=(SELECT id FROM public.tenants WHERE slug='ikijjo-hicken')
  AND hostname LIKE '%.web2table.io';

CREATE OR REPLACE FUNCTION public.get_workspace_tenant_domain(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object('hostname', d.hostname)
  FROM public.tenant_domains d
  JOIN public.tenants t ON t.id=d.tenant_id
  WHERE d.tenant_id=p_tenant_id
    AND d.status='active'
    AND d.verified_at IS NOT NULL
    AND d.activated_at IS NOT NULL
    AND t.status='active'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tenant_memberships m
      WHERE m.tenant_id=d.tenant_id AND m.user_id=auth.uid() AND m.status='active'
    )
  ORDER BY CASE WHEN d.kind='managed' THEN 0 ELSE 1 END, d.created_at DESC
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_workspace_tenant_domain(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_workspace_tenant_domain(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.system_admin_set_restaurant_domain(p_restaurant_id uuid, p_custom_domain text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_hostname text := lower(btrim(coalesce(p_custom_domain,'')));
  v_domain_id uuid;
  v_managed boolean;
BEGIN
  IF v_actor IS NULL OR NOT private.privileged_session_verified()
    OR NOT private.is_platform_admin()
    OR NOT EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id=v_actor AND pa.is_active
        AND pa.access_level IN ('owner','administrator')
    ) THEN
    RAISE EXCEPTION 'MFA-verified Owner or Administrator session required' USING ERRCODE='42501';
  END IF;
  IF p_restaurant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=p_restaurant_id) THEN
    RAISE EXCEPTION 'Restaurant not found' USING ERRCODE='P0002';
  END IF;
  IF v_hostname='' THEN
    UPDATE public.tenant_domains SET status='disabled'
    WHERE tenant_id=p_restaurant_id AND kind IN ('custom','managed') AND status<>'disabled';
    PERFORM public.system_admin_write_audit_log(
      'restaurant_domain','Removed restaurant domain',p_restaurant_id,
      'tenant_domain',p_restaurant_id::text,jsonb_build_object('action','disabled')
    );
    RETURN '';
  END IF;
  v_managed := v_hostname LIKE '%.web2table.io';
  IF char_length(v_hostname)>253
    OR v_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    OR v_hostname='web2table.io'
    OR (v_managed AND (
      v_hostname !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?[.]web2table[.]io$'
      OR split_part(v_hostname,'.',1) IN ('app','admin','tickets','www','api','auth','mail','email','smtp','ftp','cdn','assets','static','maps','status','support','billing','dashboard','system','internal','dev','staging','test')
    )) THEN
    RAISE EXCEPTION 'Enter a valid restaurant hostname. Reserved Web2Table hostnames are not allowed.' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_domains d WHERE d.hostname=v_hostname AND d.tenant_id<>p_restaurant_id) THEN
    RAISE EXCEPTION 'This domain is already assigned to another restaurant.' USING ERRCODE='23505';
  END IF;
  SELECT d.id INTO v_domain_id FROM public.tenant_domains d
  WHERE d.tenant_id=p_restaurant_id AND d.hostname=v_hostname FOR UPDATE;
  IF v_domain_id IS NULL THEN
    INSERT INTO public.tenant_domains(tenant_id,hostname,kind,status,verified_at,activated_at)
    VALUES(p_restaurant_id,v_hostname,CASE WHEN v_managed THEN 'managed' ELSE 'custom' END,
      CASE WHEN v_managed THEN 'active' ELSE 'pending' END,
      CASE WHEN v_managed THEN now() ELSE NULL END,
      CASE WHEN v_managed THEN now() ELSE NULL END)
    RETURNING id INTO v_domain_id;
  ELSE
    UPDATE public.tenant_domains SET
      kind=CASE WHEN v_managed THEN 'managed' ELSE 'custom' END,
      status=CASE WHEN v_managed THEN 'active' WHEN verified_at IS NOT NULL THEN 'verified' ELSE 'pending' END,
      verified_at=CASE WHEN v_managed THEN coalesce(verified_at,now()) ELSE verified_at END,
      activated_at=CASE WHEN v_managed THEN coalesce(activated_at,now()) ELSE NULL END
    WHERE id=v_domain_id;
  END IF;
  PERFORM public.system_admin_write_audit_log(
    'restaurant_domain','Assigned restaurant domain',p_restaurant_id,
    'tenant_domain',v_domain_id::text,
    jsonb_build_object('hostname',v_hostname,'kind',CASE WHEN v_managed THEN 'managed' ELSE 'custom' END,
      'status',CASE WHEN v_managed THEN 'active' ELSE 'pending_verification' END)
  );
  RETURN v_hostname;
END;
$function$;