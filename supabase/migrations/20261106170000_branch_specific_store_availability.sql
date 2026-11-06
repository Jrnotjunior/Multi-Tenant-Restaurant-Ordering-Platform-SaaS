-- Add independent ordering availability to every branch while retaining the
-- restaurant-wide emergency switch and shared weekly operating-hours schedule.
BEGIN;
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS accepting_orders boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION private.storefront_order_availability(
  p_tenant_id uuid,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_store record;
  v_timezone text;
  v_local timestamp without time zone;
  v_today_key text;
  v_previous_key text;
  v_schedule jsonb;
  v_today jsonb;
  v_previous jsonb;
  v_open time;
  v_close time;
  v_previous_open time;
  v_previous_close time;
  v_is_open boolean := false;
BEGIN
  SELECT s.status,s.accepting_orders,s.opening_hours,
         b.id AS branch_id,b.accepting_orders AS branch_accepting_orders
  INTO v_store
  FROM public.tenant_storefronts s
  JOIN public.branches b ON b.tenant_id=s.tenant_id
  WHERE s.tenant_id=p_tenant_id
    AND ((p_branch_id IS NOT NULL AND b.id=p_branch_id)
      OR (p_branch_id IS NULL AND b.id=s.default_branch_id))
    AND b.is_active;
  IF NOT FOUND OR v_store.status<>'published' OR v_store.accepting_orders IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('available',false,'message','This restaurant is currently not accepting orders.');
  END IF;
  IF v_store.branch_accepting_orders IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('available',false,'message','This branch is currently closed and is not accepting orders.');
  END IF;
  v_timezone:=COALESCE(v_store.opening_hours->>'timezone','Asia/Manila');
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_timezone) THEN v_timezone:='Asia/Manila'; END IF;
  v_local:=now() AT TIME ZONE v_timezone;
  v_today_key:=CASE EXTRACT(ISODOW FROM v_local)::integer
    WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday' WHEN 3 THEN 'wednesday'
    WHEN 4 THEN 'thursday' WHEN 5 THEN 'friday' WHEN 6 THEN 'saturday' ELSE 'sunday' END;
  v_previous_key:=CASE EXTRACT(ISODOW FROM (v_local-interval '1 day'))::integer
    WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday' WHEN 3 THEN 'wednesday'
    WHEN 4 THEN 'thursday' WHEN 5 THEN 'friday' WHEN 6 THEN 'saturday' ELSE 'sunday' END;
  v_schedule:=v_store.opening_hours->'schedule';
  IF jsonb_typeof(v_schedule) IS DISTINCT FROM 'object' THEN
    RETURN jsonb_build_object('available',false,'message','This restaurant is currently closed. Please order during its operating hours.');
  END IF;
  v_today:=v_schedule->v_today_key; v_previous:=v_schedule->v_previous_key;
  IF COALESCE((v_today->>'isOpen')::boolean,false)
    AND COALESCE(v_today->>'open','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND COALESCE(v_today->>'close','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    v_open:=(v_today->>'open')::time; v_close:=(v_today->>'close')::time;
    IF v_open<v_close AND v_local::time>=v_open AND v_local::time<v_close THEN v_is_open:=true;
    ELSIF v_open>v_close AND v_local::time>=v_open THEN v_is_open:=true; END IF;
  END IF;
  IF NOT v_is_open AND COALESCE((v_previous->>'isOpen')::boolean,false)
    AND COALESCE(v_previous->>'open','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND COALESCE(v_previous->>'close','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN
    v_previous_open:=(v_previous->>'open')::time; v_previous_close:=(v_previous->>'close')::time;
    IF v_previous_open>v_previous_close AND v_local::time<v_previous_close THEN v_is_open:=true; END IF;
  END IF;
  IF NOT v_is_open THEN
    RETURN jsonb_build_object('available',false,'message','This restaurant is currently closed. Please order during its operating hours.');
  END IF;
  RETURN jsonb_build_object('available',true,'message','');
END;
$function$;

CREATE OR REPLACE FUNCTION private.enforce_storefront_order_availability()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_availability jsonb;
BEGIN
  IF EXISTS(SELECT 1 FROM public.customer_orders existing
    WHERE existing.tenant_id=NEW.tenant_id AND existing.idempotency_key=NEW.idempotency_key) THEN
    RETURN NEW;
  END IF;
  v_availability:=private.storefront_order_availability(NEW.tenant_id,NEW.branch_id);
  IF COALESCE((v_availability->>'available')::boolean,false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION '%',COALESCE(v_availability->>'message','This branch is currently closed. Please choose another branch.')
      USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_storefront_order_availability(p_slug text,p_branch_slug text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE v_tenant uuid; v_branch uuid;
BEGIN
  IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 64 OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR (p_branch_slug IS NOT NULL AND (length(p_branch_slug) NOT BETWEEN 2 AND 64
      OR p_branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$')) THEN
    RETURN jsonb_build_object('available',false,'message','This restaurant is currently unavailable.');
  END IF;
  SELECT t.id,b.id INTO v_tenant,v_branch
  FROM public.tenants t JOIN public.tenant_storefronts s ON s.tenant_id=t.id
  JOIN public.branches b ON b.tenant_id=t.id AND b.is_active
  WHERE t.slug=p_slug AND t.status='active' AND s.status='published'
    AND ((p_branch_slug IS NULL AND b.id=s.default_branch_id)
      OR (p_branch_slug IS NOT NULL AND b.slug=p_branch_slug));
  IF v_tenant IS NULL OR v_branch IS NULL THEN
    RETURN jsonb_build_object('available',false,'message','This restaurant branch is currently unavailable.');
  END IF;
  RETURN private.storefront_order_availability(v_tenant,v_branch);
END;
$function$;
REVOKE ALL ON FUNCTION private.storefront_order_availability(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.enforce_storefront_order_availability() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.check_storefront_order_availability(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_storefront_order_availability(text,text) TO anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
