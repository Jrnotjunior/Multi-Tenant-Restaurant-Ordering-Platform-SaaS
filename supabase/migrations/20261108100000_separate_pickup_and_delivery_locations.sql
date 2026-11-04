-- Keep the customer pickup address separate from the Mapbox delivery origin.
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS pickup_address text;
UPDATE public.branches b SET pickup_address=s.restaurant_address
FROM public.tenant_storefronts s
WHERE s.default_branch_id=b.id AND b.pickup_address IS NULL
  AND length(btrim(coalesce(s.restaurant_address,''))) BETWEEN 3 AND 500;

CREATE OR REPLACE FUNCTION private.update_owner_branch_pickup_address(p_tenant_id uuid,p_branch_id uuid,p_pickup_address text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_address text:=btrim(coalesce(p_pickup_address,''));
BEGIN
 IF NOT private.is_active_owner(p_tenant_id) THEN RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501'; END IF;
 IF length(v_address) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Enter the exact pickup address (3–500 characters).' USING ERRCODE='22023'; END IF;
 UPDATE public.branches SET pickup_address=v_address WHERE tenant_id=p_tenant_id AND id=p_branch_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found in your restaurant' USING ERRCODE='42501'; END IF;
 RETURN true;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.update_owner_branch_pickup_address(p_tenant_id uuid,p_branch_id uuid,p_pickup_address text)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.update_owner_branch_pickup_address(p_tenant_id,p_branch_id,p_pickup_address); $fn$;
REVOKE ALL ON FUNCTION private.update_owner_branch_pickup_address(uuid,uuid,text),public.update_owner_branch_pickup_address(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.update_owner_branch_pickup_address(uuid,uuid,text),public.update_owner_branch_pickup_address(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION private.require_pickup_address_before_branch_activation()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $fn$
BEGIN
 IF NEW.is_active AND NOT OLD.is_active AND length(btrim(coalesce(NEW.pickup_address,''))) NOT BETWEEN 3 AND 500 THEN
  RAISE EXCEPTION 'Set the exact pickup address before activating this branch.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS branches_require_pickup_address_activation ON public.branches;
CREATE TRIGGER branches_require_pickup_address_activation BEFORE UPDATE OF is_active ON public.branches
FOR EACH ROW EXECUTE FUNCTION private.require_pickup_address_before_branch_activation();

CREATE OR REPLACE FUNCTION private.system_admin_list_branches(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_branches jsonb;
BEGIN
 IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'MFA-verified platform administrator required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=p_tenant_id) THEN RAISE EXCEPTION 'Restaurant not found' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',b.id,'slug',b.slug,'name',b.name,'isActive',b.is_active,'isDefault',b.id=s.default_branch_id,
  'hasPickupAddress',length(btrim(coalesce(b.pickup_address,''))) BETWEEN 3 AND 500,
  'hasDeliveryLocation',length(btrim(coalesce(b.store_address,''))) BETWEEN 3 AND 500
   AND b.delivery_location_latitude IS NOT NULL AND b.delivery_location_longitude IS NOT NULL
   AND coalesce((b.delivery_pricing->>'distance_increment_meters')::numeric,0)>0
   AND coalesce((b.delivery_pricing->>'max_distance_meters')::numeric,0)>0
   AND coalesce((b.delivery_pricing->>'fee_per_increment')::numeric,-1)>=0
   AND coalesce((b.delivery_pricing->>'base_fee')::numeric,-1)>=0
 ) ORDER BY (b.id=s.default_branch_id) DESC,b.name,b.slug),'[]'::jsonb)
 INTO v_branches FROM public.branches b LEFT JOIN public.tenant_storefronts s ON s.tenant_id=b.tenant_id
 WHERE b.tenant_id=p_tenant_id;
 RETURN v_branches;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_customer_order_branch_location(p_tracking_token uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT jsonb_build_object('branchName',b.name,'branchAddress',b.pickup_address)
 FROM public.customer_orders o JOIN public.branches b ON b.tenant_id=o.tenant_id AND b.id=o.branch_id
 WHERE o.idempotency_key=p_tracking_token AND p_tracking_token IS NOT NULL;
$fn$;

-- Keep the earlier public branch-address RPC aligned with manually entered pickup addresses.
CREATE OR REPLACE FUNCTION public.get_public_branch_address(p_slug text,p_branch_slug text DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT b.pickup_address FROM public.tenants t
 JOIN public.tenant_storefronts s ON s.tenant_id=t.id
 JOIN public.branches b ON b.tenant_id=t.id AND b.is_active
 WHERE t.slug=p_slug AND t.status='active' AND s.status='published'
 AND ((p_branch_slug IS NULL AND b.id=s.default_branch_id)
   OR (p_branch_slug IS NOT NULL AND b.slug=p_branch_slug));
$fn$;
