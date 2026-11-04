-- Branch delivery origins and prices belong to the selected branch.
BEGIN;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS store_address text,
  ADD COLUMN IF NOT EXISTS delivery_location_latitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_location_longitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_pricing jsonb NOT NULL DEFAULT '{"base_fee":0,"currency":"PHP","distance_increment_meters":500,"fee_per_increment":10,"max_distance_meters":10000}'::jsonb;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='branches_delivery_latitude_range') THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_delivery_latitude_range
      CHECK (delivery_location_latitude IS NULL OR delivery_location_latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='branches_delivery_longitude_range') THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_delivery_longitude_range
      CHECK (delivery_location_longitude IS NULL OR delivery_location_longitude BETWEEN -180 AND 180);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='branches_delivery_location_pair') THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_delivery_location_pair
      CHECK ((delivery_location_latitude IS NULL) = (delivery_location_longitude IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='branches_delivery_pricing_object') THEN
    ALTER TABLE public.branches ADD CONSTRAINT branches_delivery_pricing_object
      CHECK (jsonb_typeof(delivery_pricing)='object');
  END IF;
END
$constraints$;

-- Preserve existing behavior for every branch by copying the old restaurant-wide
-- route origin and fee schedule into each existing branch.
UPDATE public.branches b
SET store_address=s.store_address,
    delivery_location_latitude=s.delivery_location_latitude,
    delivery_location_longitude=s.delivery_location_longitude,
    delivery_pricing=coalesce(s.delivery_pricing,b.delivery_pricing)
FROM public.tenant_storefronts s
WHERE s.tenant_id=b.tenant_id;

CREATE FUNCTION private.can_manage_platform_branches()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT private.privileged_session_verified() AND EXISTS (
    SELECT 1 FROM public.platform_admins a
    WHERE a.user_id=(SELECT auth.uid()) AND a.is_active
      AND a.access_level IN ('owner','administrator')
  );
$fn$;

CREATE OR REPLACE FUNCTION private.system_admin_create_branch(
  p_tenant_id uuid, p_slug text, p_name text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_slug text:=lower(btrim(coalesce(p_slug,'')));
  v_name text:=btrim(coalesce(p_name,''));
  v_branch uuid;
BEGIN
  IF NOT private.can_manage_platform_branches() THEN
    RAISE EXCEPTION 'MFA-verified System Administrator with branch-management access required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id AND t.status='active') THEN
    RAISE EXCEPTION 'Active restaurant required' USING ERRCODE='42501';
  END IF;
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR length(v_slug) NOT BETWEEN 2 AND 64
     OR length(v_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Invalid branch slug or name' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.tenants t WHERE t.id=p_tenant_id FOR UPDATE;
  IF (SELECT count(*) FROM public.branches b WHERE b.tenant_id=p_tenant_id)>=20 THEN
    RAISE EXCEPTION 'Maximum of 20 branches reached' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.branches(tenant_id,slug,name,is_active)
  VALUES(p_tenant_id,v_slug,v_name,false) RETURNING id INTO v_branch;
  RETURN v_branch;
END;
$fn$;

CREATE OR REPLACE FUNCTION private.system_admin_update_branch(
  p_tenant_id uuid, p_branch_id uuid, p_name text, p_active boolean
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_name text := btrim(coalesce(p_name, ''));
  v_is_default boolean;
  v_ready boolean;
BEGIN
  IF NOT private.can_manage_platform_branches() THEN
    RAISE EXCEPTION 'MFA-verified System Administrator with branch-management access required' USING ERRCODE = '42501';
  END IF;
  IF length(v_name) NOT BETWEEN 2 AND 160 OR p_active IS NULL THEN
    RAISE EXCEPTION 'Invalid branch details' USING ERRCODE = '22023';
  END IF;
  SELECT s.default_branch_id = p_branch_id INTO v_is_default
  FROM public.tenant_storefronts s WHERE s.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Restaurant storefront unavailable' USING ERRCODE = '42501'; END IF;
  IF v_is_default AND NOT p_active THEN
    RAISE EXCEPTION 'Default branch cannot be disabled' USING ERRCODE = '23514';
  END IF;
  SELECT b.store_address IS NOT NULL AND length(btrim(b.store_address)) BETWEEN 3 AND 500
    AND b.delivery_location_latitude IS NOT NULL AND b.delivery_location_longitude IS NOT NULL
    AND coalesce((b.delivery_pricing->>'distance_increment_meters')::numeric,0)>0
    AND coalesce((b.delivery_pricing->>'max_distance_meters')::numeric,0)>0
    AND coalesce((b.delivery_pricing->>'fee_per_increment')::numeric,-1)>=0
    AND coalesce((b.delivery_pricing->>'base_fee')::numeric,-1)>=0
    INTO v_ready
  FROM public.branches b WHERE b.tenant_id=p_tenant_id AND b.id=p_branch_id;
  IF p_active AND NOT coalesce(v_ready,false) THEN
    RAISE EXCEPTION 'Configure this branch delivery address, map location, and pricing before activating it.' USING ERRCODE = '23514';
  END IF;
  UPDATE public.branches SET name=v_name,is_active=p_active
  WHERE tenant_id=p_tenant_id AND id=p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found' USING ERRCODE = '42501'; END IF;
  RETURN true;
END;
$fn$;

CREATE FUNCTION private.system_admin_list_branches(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE v_branches jsonb;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'MFA-verified platform administrator required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id) THEN
    RAISE EXCEPTION 'Restaurant not found' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'slug',b.slug,'name',b.name,'isActive',b.is_active,
    'isDefault',b.id=s.default_branch_id,
    'hasDeliveryLocation',length(btrim(coalesce(b.store_address,''))) BETWEEN 3 AND 500
      AND b.delivery_location_latitude IS NOT NULL AND b.delivery_location_longitude IS NOT NULL
      AND coalesce((b.delivery_pricing->>'distance_increment_meters')::numeric,0)>0
      AND coalesce((b.delivery_pricing->>'max_distance_meters')::numeric,0)>0
      AND coalesce((b.delivery_pricing->>'fee_per_increment')::numeric,-1)>=0
      AND coalesce((b.delivery_pricing->>'base_fee')::numeric,-1)>=0
  ) ORDER BY (b.id=s.default_branch_id) DESC,b.name,b.slug),'[]'::jsonb)
    INTO v_branches
  FROM public.branches b
  LEFT JOIN public.tenant_storefronts s ON s.tenant_id=b.tenant_id
  WHERE b.tenant_id=p_tenant_id;
  RETURN v_branches;
END;
$fn$;

CREATE FUNCTION public.system_admin_list_branches(p_tenant_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.system_admin_list_branches(p_tenant_id); $fn$;

CREATE OR REPLACE FUNCTION private.update_owner_branch_delivery_settings(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_store_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_delivery_pricing jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_address text := btrim(coalesce(p_store_address,''));
  v_base numeric;
  v_increment numeric;
  v_per_increment numeric;
  v_max numeric;
BEGIN
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NULL OR length(v_address) NOT BETWEEN 3 AND 500
     OR p_latitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90
     OR p_longitude IS NULL OR p_longitude NOT BETWEEN -180 AND 180
     OR jsonb_typeof(p_delivery_pricing)<>'object' THEN
    RAISE EXCEPTION 'Enter a branch address and choose its exact map location.' USING ERRCODE='22023';
  END IF;
  v_base := (p_delivery_pricing->>'base_fee')::numeric;
  v_increment := (p_delivery_pricing->>'distance_increment_meters')::numeric;
  v_per_increment := (p_delivery_pricing->>'fee_per_increment')::numeric;
  v_max := (p_delivery_pricing->>'max_distance_meters')::numeric;
  IF v_base IS NULL OR v_base<0 OR v_increment IS NULL OR v_increment<=0
     OR v_per_increment IS NULL OR v_per_increment<0 OR v_max IS NULL OR v_max<=0
     OR v_base>1000000 OR v_per_increment>1000000 OR v_increment>1000000 OR v_max>1000000 THEN
    RAISE EXCEPTION 'Enter valid delivery pricing. Fees cannot be negative and distances must be greater than zero.' USING ERRCODE='22023';
  END IF;
  UPDATE public.branches SET
    store_address=v_address,
    delivery_location_latitude=p_latitude,
    delivery_location_longitude=p_longitude,
    delivery_pricing=p_delivery_pricing
  WHERE tenant_id=p_tenant_id AND id=p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found in your restaurant' USING ERRCODE='42501'; END IF;
  RETURN true;
END;
$fn$;

CREATE FUNCTION public.update_owner_branch_delivery_settings(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_store_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_delivery_pricing jsonb
) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$ SELECT private.update_owner_branch_delivery_settings(
  p_tenant_id,p_branch_id,p_store_address,p_latitude,p_longitude,p_delivery_pricing
); $fn$;

REVOKE ALL ON FUNCTION private.update_owner_branch_delivery_settings(uuid,uuid,text,double precision,double precision,jsonb),
  public.update_owner_branch_delivery_settings(uuid,uuid,text,double precision,double precision,jsonb)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.can_manage_platform_branches() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_platform_branches() TO authenticated;
REVOKE ALL ON FUNCTION private.system_admin_list_branches(uuid),public.system_admin_list_branches(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.update_owner_branch_delivery_settings(uuid,uuid,text,double precision,double precision,jsonb),
  public.update_owner_branch_delivery_settings(uuid,uuid,text,double precision,double precision,jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.system_admin_list_branches(uuid),public.system_admin_list_branches(uuid)
  TO authenticated;

COMMIT;
