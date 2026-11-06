DO $migration$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO STRICT v_tenant_id FROM public.tenants WHERE slug='ebable' AND name='Web2Table' AND status='active';
  IF EXISTS (SELECT 1 FROM public.tenant_domains WHERE hostname='app.web2table.io' AND tenant_id<>v_tenant_id) THEN
    RAISE EXCEPTION 'app.web2table.io is already assigned to a different tenant; refusing to reassign it';
  END IF;
  INSERT INTO public.tenant_domains(tenant_id,hostname,kind,status,verified_at,activated_at)
  VALUES(v_tenant_id,'app.web2table.io','managed','active',now(),now())
  ON CONFLICT (hostname) DO UPDATE SET
    tenant_id=EXCLUDED.tenant_id,
    kind='managed',status='active',
    verified_at=coalesce(public.tenant_domains.verified_at,now()),
    activated_at=coalesce(public.tenant_domains.activated_at,now());
END;
$migration$;