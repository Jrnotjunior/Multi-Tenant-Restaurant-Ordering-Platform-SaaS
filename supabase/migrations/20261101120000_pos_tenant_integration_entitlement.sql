BEGIN;

CREATE TABLE public.tenant_pos_integrations (
 tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'not_enabled'
  CHECK(status IN ('not_enabled','pending','active','suspended','revoked')),
 requested_at timestamptz,
 activated_at timestamptz,
 activated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 suspended_at timestamptz,
 suspended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 revoked_at timestamptz,
 revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'active' OR (activated_at IS NOT NULL AND activated_by IS NOT NULL))
);

CREATE TABLE public.tenant_pos_integration_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
 actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 event_type text NOT NULL CHECK(event_type IN ('requested','activated','suspended','revoked','re_enabled')),
 previous_status text NOT NULL,
 new_status text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_pos_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_pos_integrations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_pos_integration_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_pos_integration_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_pos_integrations,public.tenant_pos_integration_audit_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.tenant_pos_integrations,public.tenant_pos_integration_audit_events TO authenticated;
CREATE POLICY tenant_pos_integrations_admin_read ON public.tenant_pos_integrations
 FOR SELECT TO authenticated USING(private.is_platform_admin());
CREATE POLICY tenant_pos_integrations_owner_read ON public.tenant_pos_integrations
 FOR SELECT TO authenticated USING(private.is_active_owner(tenant_id));
CREATE POLICY tenant_pos_integration_audit_admin_read ON public.tenant_pos_integration_audit_events
 FOR SELECT TO authenticated USING(private.is_platform_admin());

CREATE FUNCTION private.is_tenant_pos_integration_active(p_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT EXISTS(SELECT 1 FROM public.tenant_pos_integrations i
 JOIN public.tenants t ON t.id=i.tenant_id
 WHERE i.tenant_id=p_tenant_id AND i.status='active' AND t.status='active');
$fn$;
REVOKE ALL ON FUNCTION private.is_tenant_pos_integration_active(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.is_tenant_pos_integration_active(uuid) TO authenticated,service_role;

CREATE FUNCTION public.request_pos_integration(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_status text;
BEGIN
 IF auth.uid() IS NULL OR NOT private.privileged_session_verified()
    OR NOT private.is_active_owner(p_tenant_id) THEN
  RAISE EXCEPTION 'Verified restaurant-owner session required' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.tenant_pos_integrations(tenant_id,status,requested_at)
 VALUES(p_tenant_id,'pending',now())
 ON CONFLICT(tenant_id) DO UPDATE SET
  status=CASE WHEN tenant_pos_integrations.status='not_enabled' THEN 'pending' ELSE tenant_pos_integrations.status END,
  requested_at=CASE WHEN tenant_pos_integrations.status IN ('not_enabled','revoked') THEN now() ELSE tenant_pos_integrations.requested_at END,
  updated_at=now()
 RETURNING status INTO v_status;
 RETURN jsonb_build_object('tenant_id',p_tenant_id,'status',v_status);
END;
$fn$;

CREATE FUNCTION public.set_tenant_pos_integration(p_tenant_id uuid,p_action text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_previous text; v_next text; v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT private.is_platform_admin() THEN
  RAISE EXCEPTION 'Verified platform administrator MFA session required' USING ERRCODE='42501';
 END IF;
 IF p_action NOT IN ('enable','suspend','revoke') THEN RAISE EXCEPTION 'Invalid POS integration action' USING ERRCODE='22023'; END IF;
 IF p_reason IS NOT NULL AND length(btrim(p_reason))>500 THEN RAISE EXCEPTION 'Reason must be at most 500 characters' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active tenant not found' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.tenant_pos_integrations(tenant_id,status) VALUES(p_tenant_id,'not_enabled') ON CONFLICT DO NOTHING;
 SELECT status INTO v_previous FROM public.tenant_pos_integrations WHERE tenant_id=p_tenant_id FOR UPDATE;
 v_next:=CASE p_action WHEN 'enable' THEN 'active' WHEN 'suspend' THEN 'suspended' ELSE 'revoked' END;
 IF v_previous=v_next THEN RAISE EXCEPTION 'POS integration is already %',v_next USING ERRCODE='22023'; END IF;
 UPDATE public.tenant_pos_integrations SET status=v_next,
  activated_at=CASE WHEN p_action='enable' THEN now() ELSE activated_at END,
  activated_by=CASE WHEN p_action='enable' THEN v_actor ELSE activated_by END,
  suspended_at=CASE WHEN p_action='suspend' THEN now() ELSE suspended_at END,
  suspended_by=CASE WHEN p_action='suspend' THEN v_actor ELSE suspended_by END,
  revoked_at=CASE WHEN p_action='revoke' THEN now() ELSE revoked_at END,
  revoked_by=CASE WHEN p_action='revoke' THEN v_actor ELSE revoked_by END,
  updated_at=now() WHERE tenant_id=p_tenant_id;
 INSERT INTO public.tenant_pos_integration_audit_events(tenant_id,actor_user_id,event_type,previous_status,new_status,details)
 VALUES(p_tenant_id,v_actor,
  CASE WHEN p_action='enable' AND v_previous IN ('suspended','revoked') THEN 're_enabled'
       WHEN p_action='enable' THEN 'activated' WHEN p_action='suspend' THEN 'suspended' ELSE 'revoked' END,
  v_previous,v_next,jsonb_build_object('reason',nullif(btrim(coalesce(p_reason,'')),'')));
 RETURN jsonb_build_object('tenant_id',p_tenant_id,'previous_status',v_previous,'status',v_next);
END;
$fn$;

CREATE FUNCTION public.get_tenant_pos_integration(p_tenant_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_status text;
BEGIN
 IF private.is_platform_admin() OR private.is_active_owner(p_tenant_id) THEN
  SELECT status INTO v_status FROM public.tenant_pos_integrations WHERE tenant_id=p_tenant_id;
 ELSE RAISE EXCEPTION 'Authorized tenant owner or platform administrator required' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('tenant_id',p_tenant_id,'status',coalesce(v_status,'not_enabled'));
END;
$fn$;

REVOKE ALL ON FUNCTION public.request_pos_integration(uuid),
 public.set_tenant_pos_integration(uuid,text,text),
 public.get_tenant_pos_integration(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_pos_integration(uuid),
 public.set_tenant_pos_integration(uuid,text,text),
 public.get_tenant_pos_integration(uuid) TO authenticated;

DO $block$
DECLARE r record;
BEGIN
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN
   ('pos_sales','pos_sale_items','pos_sale_audit_events','pos_cashier_shifts',
    'pos_cashier_shift_audit_events','pos_fiscal_profiles','pos_fiscal_profile_audit_events',
    'pos_fiscal_tax_policies','pos_fiscal_tax_policy_audit_events')
 LOOP
  EXECUTE format('DROP POLICY IF EXISTS pos_entitlement_guard ON public.%I',r.relname);
  EXECUTE format('CREATE POLICY pos_entitlement_guard ON public.%I FOR ALL TO authenticated USING(private.is_tenant_pos_integration_active(tenant_id)) WITH CHECK(private.is_tenant_pos_integration_active(tenant_id))',r.relname);
 END LOOP;
END;
$block$;

CREATE OR REPLACE FUNCTION public.get_pos_cashier_shift(p_actor_user_id uuid,p_branch_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_tenant_id uuid; v_role text; v_shift public.pos_cashier_shifts%rowtype; v_cash_sales bigint;
BEGIN
 SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id=p_branch_id AND is_active;
 IF v_tenant_id IS NULL OR NOT private.is_tenant_pos_integration_active(v_tenant_id) THEN RAISE EXCEPTION 'POS integration is not active for this tenant.' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.tenant_memberships WHERE tenant_id=v_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('restaurant_owner','cashier');
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active cashier or restaurant-owner access is required.' USING ERRCODE='42501'; END IF;
 IF v_role='cashier' AND NOT EXISTS(SELECT 1 FROM public.branch_memberships WHERE tenant_id=v_tenant_id AND branch_id=p_branch_id AND user_id=p_actor_user_id) THEN RAISE EXCEPTION 'You are not assigned to this branch.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_shift FROM public.pos_cashier_shifts WHERE tenant_id=v_tenant_id AND branch_id=p_branch_id AND cashier_user_id=p_actor_user_id AND status='open';
 IF NOT FOUND THEN RETURN jsonb_build_object('active',false); END IF;
 SELECT coalesce(sum(total_centavos),0)::bigint INTO v_cash_sales FROM public.pos_sales WHERE cashier_shift_id=v_shift.id AND payment_method='cash' AND payment_status='paid';
 RETURN jsonb_build_object('active',true,'id',v_shift.id,'tenant_id',v_shift.tenant_id,'branch_id',v_shift.branch_id,'cashier_user_id',v_shift.cashier_user_id,'status',v_shift.status,'opening_cash_centavos',v_shift.opening_cash_centavos,'cash_sales_centavos',v_cash_sales,'expected_cash_centavos',v_shift.opening_cash_centavos+v_cash_sales,'opened_at',v_shift.opened_at);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.open_pos_cashier_shift(p_actor_user_id uuid,p_branch_id uuid,p_opening_cash_centavos bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_tenant_id uuid; v_role text; v_shift public.pos_cashier_shifts%rowtype;
BEGIN
 IF p_actor_user_id IS NULL OR p_branch_id IS NULL OR p_opening_cash_centavos IS NULL OR p_opening_cash_centavos<0 OR p_opening_cash_centavos>2000000000 THEN RAISE EXCEPTION 'Opening cash must be a valid amount.' USING ERRCODE='22023'; END IF;
 SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id=p_branch_id AND is_active;
 IF v_tenant_id IS NULL OR NOT private.is_tenant_pos_integration_active(v_tenant_id) THEN RAISE EXCEPTION 'POS integration is not active for this tenant.' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.tenant_memberships WHERE tenant_id=v_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('restaurant_owner','cashier');
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active cashier or restaurant-owner access is required.' USING ERRCODE='42501'; END IF;
 IF v_role='cashier' AND NOT EXISTS(SELECT 1 FROM public.branch_memberships WHERE tenant_id=v_tenant_id AND branch_id=p_branch_id AND user_id=p_actor_user_id) THEN RAISE EXCEPTION 'You are not assigned to this branch.' USING ERRCODE='42501'; END IF;
 INSERT INTO public.pos_cashier_shifts(tenant_id,branch_id,cashier_user_id,opening_cash_centavos) VALUES(v_tenant_id,p_branch_id,p_actor_user_id,p_opening_cash_centavos) RETURNING * INTO v_shift;
 RETURN jsonb_build_object('id',v_shift.id,'tenant_id',v_shift.tenant_id,'branch_id',v_shift.branch_id,'cashier_user_id',v_shift.cashier_user_id,'status',v_shift.status,'opening_cash_centavos',v_shift.opening_cash_centavos,'opened_at',v_shift.opened_at);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'You already have an open shift at this branch.' USING ERRCODE='23505';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.close_pos_cashier_shift(p_actor_user_id uuid,p_branch_id uuid,p_counted_cash_centavos bigint,p_close_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_tenant_id uuid; v_role text; v_shift public.pos_cashier_shifts%rowtype; v_cash_sales bigint; v_expected bigint;
BEGIN
 IF p_counted_cash_centavos IS NULL OR p_counted_cash_centavos<0 OR p_counted_cash_centavos>2000000000 THEN RAISE EXCEPTION 'Counted cash must be a valid amount.' USING ERRCODE='22023'; END IF;
 SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id=p_branch_id AND is_active;
 IF v_tenant_id IS NULL OR NOT private.is_tenant_pos_integration_active(v_tenant_id) THEN RAISE EXCEPTION 'POS integration is not active for this tenant.' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.tenant_memberships WHERE tenant_id=v_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('restaurant_owner','cashier');
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active cashier or restaurant-owner access is required.' USING ERRCODE='42501'; END IF;
 IF v_role='cashier' AND NOT EXISTS(SELECT 1 FROM public.branch_memberships WHERE tenant_id=v_tenant_id AND branch_id=p_branch_id AND user_id=p_actor_user_id) THEN RAISE EXCEPTION 'You are not assigned to this branch.' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_shift FROM public.pos_cashier_shifts WHERE tenant_id=v_tenant_id AND branch_id=p_branch_id AND cashier_user_id=p_actor_user_id AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'There is no open shift to close.' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(sum(total_centavos),0)::bigint INTO v_cash_sales FROM public.pos_sales WHERE cashier_shift_id=v_shift.id AND payment_method='cash' AND payment_status='paid';
 v_expected:=v_shift.opening_cash_centavos+v_cash_sales;
 UPDATE public.pos_cashier_shifts SET status='closed',expected_cash_centavos=v_expected,counted_cash_centavos=p_counted_cash_centavos,cash_variance_centavos=p_counted_cash_centavos-v_expected,closed_at=now(),close_note=nullif(left(coalesce(p_close_note,''),500),''),updated_at=now() WHERE id=v_shift.id RETURNING * INTO v_shift;
 RETURN jsonb_build_object('id',v_shift.id,'status',v_shift.status,'opening_cash_centavos',v_shift.opening_cash_centavos,'expected_cash_centavos',v_shift.expected_cash_centavos,'counted_cash_centavos',v_shift.counted_cash_centavos,'cash_variance_centavos',v_shift.cash_variance_centavos,'opened_at',v_shift.opened_at,'closed_at',v_shift.closed_at,'close_note',v_shift.close_note);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_pos_cash_sale(p_actor_user_id uuid,p_branch_id uuid,p_idempotency_key uuid,p_items jsonb,p_cash_tendered_centavos bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_tenant_id uuid; v_role text; v_sale_id uuid; v_shift_id uuid; v_sale_number bigint; v_existing_fingerprint text; v_fingerprint text; v_line jsonb; v_item_id uuid; v_quantity integer; v_line_number integer:=0; v_total_units integer:=0; v_item_name text; v_unit_price bigint; v_line_total bigint; v_subtotal bigint:=0; v_seen uuid[]:=ARRAY[]::uuid[];
BEGIN
 IF p_actor_user_id IS NULL OR p_branch_id IS NULL OR p_idempotency_key IS NULL THEN RAISE EXCEPTION 'Missing sale identity or request key.' USING ERRCODE='22023'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 OR octet_length(p_items::text)>50000 THEN RAISE EXCEPTION 'Add items before checkout.' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text||':'||p_idempotency_key::text,0));
 SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id=p_branch_id AND is_active;
 IF v_tenant_id IS NULL OR NOT private.is_tenant_pos_integration_active(v_tenant_id) THEN RAISE EXCEPTION 'POS integration is not active for this tenant.' USING ERRCODE='42501'; END IF;
 SELECT role INTO v_role FROM public.tenant_memberships WHERE tenant_id=v_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('restaurant_owner','cashier');
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active cashier or restaurant-owner access is required for this tenant.' USING ERRCODE='42501'; END IF;
 IF v_role='cashier' AND NOT EXISTS(SELECT 1 FROM public.branch_memberships WHERE tenant_id=v_tenant_id AND branch_id=p_branch_id AND user_id=p_actor_user_id) THEN RAISE EXCEPTION 'You are not assigned to this branch.' USING ERRCODE='42501'; END IF;
 v_fingerprint:=md5(jsonb_build_object('actor',p_actor_user_id,'branch',p_branch_id,'items',p_items,'cash_tendered_centavos',p_cash_tendered_centavos)::text);
 SELECT id,sale_number,request_fingerprint INTO v_sale_id,v_sale_number,v_existing_fingerprint FROM public.pos_sales WHERE tenant_id=v_tenant_id AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing_fingerprint<>v_fingerprint THEN RAISE EXCEPTION 'This checkout key was already used for a different sale.' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('success',true,'repeated',true,'sale_id',v_sale_id,'sale_number',v_sale_number);
 END IF;
 SELECT id INTO v_shift_id FROM public.pos_cashier_shifts WHERE tenant_id=v_tenant_id AND branch_id=p_branch_id AND cashier_user_id=p_actor_user_id AND status='open' FOR UPDATE;
 IF v_shift_id IS NULL THEN RAISE EXCEPTION 'Open a cashier shift before recording a sale.' USING ERRCODE='P0002'; END IF;
 INSERT INTO public.pos_sales(tenant_id,branch_id,cashier_user_id,cashier_shift_id,idempotency_key,request_fingerprint,subtotal_centavos,total_centavos,payment_method,payment_status,cash_tendered_centavos,change_centavos)
 VALUES(v_tenant_id,p_branch_id,p_actor_user_id,v_shift_id,p_idempotency_key,v_fingerprint,1,1,'cash','paid',GREATEST(COALESCE(p_cash_tendered_centavos,0),1),GREATEST(COALESCE(p_cash_tendered_centavos,0),1)-1)
 RETURNING id,sale_number INTO v_sale_id,v_sale_number;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) AS e(value) LOOP
  v_line_number:=v_line_number+1;
  IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' OR (v_line-ARRAY['item_id','quantity'])<>'{}'::jsonb OR NOT(v_line ?& ARRAY['item_id','quantity']) OR jsonb_typeof(v_line->'item_id') IS DISTINCT FROM 'string' OR jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number' OR COALESCE(v_line->>'quantity','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'A sale item is invalid. Refresh the menu and try again.' USING ERRCODE='22023'; END IF;
  BEGIN v_item_id:=(v_line->>'item_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'A sale item is invalid.' USING ERRCODE='22023'; END;
  v_quantity:=(v_line->>'quantity')::integer;
  IF v_quantity NOT BETWEEN 1 AND 100 OR v_item_id=ANY(v_seen) THEN RAISE EXCEPTION 'Item quantity is invalid or a duplicate line was submitted.' USING ERRCODE='22023'; END IF;
  v_seen:=array_append(v_seen,v_item_id); v_total_units:=v_total_units+v_quantity;
  IF v_total_units>200 THEN RAISE EXCEPTION 'The sale exceeds the item limit.' USING ERRCODE='22023'; END IF;
  SELECT i.name,COALESCE(bm.price_override_centavos,i.price_centavos)::bigint INTO v_item_name,v_unit_price
  FROM public.menu_items i JOIN public.menu_categories c ON c.tenant_id=i.tenant_id AND c.id=i.category_id
  JOIN public.branch_menu_items bm ON bm.tenant_id=i.tenant_id AND bm.item_id=i.id AND bm.branch_id=p_branch_id AND bm.is_available
  WHERE i.tenant_id=v_tenant_id AND i.id=v_item_id AND i.status='published' AND c.is_published FOR SHARE OF i,c,bm;
  IF NOT FOUND THEN RAISE EXCEPTION 'An item is no longer available at this branch. Refresh the menu.' USING ERRCODE='P0002'; END IF;
  IF v_unit_price<0 OR v_unit_price>200000000 THEN RAISE EXCEPTION 'An item price is outside the supported range.' USING ERRCODE='22023'; END IF;
  v_line_total:=v_unit_price*v_quantity; v_subtotal:=v_subtotal+v_line_total;
  IF v_subtotal>1000000000 THEN RAISE EXCEPTION 'The sale total exceeds the supported limit.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.pos_sale_items(tenant_id,sale_id,line_number,menu_item_id,item_name_snapshot,unit_price_centavos,quantity,line_total_centavos)
  VALUES(v_tenant_id,v_sale_id,v_line_number,v_item_id,v_item_name,v_unit_price,v_quantity,v_line_total);
 END LOOP;
 IF v_subtotal<=0 THEN RAISE EXCEPTION 'The sale total must be greater than zero.' USING ERRCODE='22023'; END IF;
 IF p_cash_tendered_centavos IS NULL OR p_cash_tendered_centavos<v_subtotal OR p_cash_tendered_centavos>2000000000 THEN RAISE EXCEPTION 'Cash received must be at least the sale total.' USING ERRCODE='22023'; END IF;
 UPDATE public.pos_sales SET subtotal_centavos=v_subtotal,total_centavos=v_subtotal,cash_tendered_centavos=p_cash_tendered_centavos,change_centavos=p_cash_tendered_centavos-v_subtotal WHERE id=v_sale_id AND tenant_id=v_tenant_id;
 INSERT INTO public.pos_sale_audit_events(tenant_id,sale_id,actor_user_id,event_type,details)
 VALUES(v_tenant_id,v_sale_id,p_actor_user_id,'sale_created',jsonb_build_object('branch_id',p_branch_id,'total_centavos',v_subtotal,'payment_method','cash','item_count',v_line_number));
 RETURN jsonb_build_object('success',true,'repeated',false,'sale_id',v_sale_id,'sale_number',v_sale_number,'subtotal_centavos',v_subtotal,'cash_tendered_centavos',p_cash_tendered_centavos,'change_centavos',p_cash_tendered_centavos-v_subtotal);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.create_pos_cash_sale_with_customer(
 p_actor_user_id uuid,p_branch_id uuid,p_idempotency_key uuid,p_items jsonb,
 p_cash_tendered_centavos bigint,p_customer_user_id uuid,p_customer_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_tenant_id uuid; v_sale jsonb; v_sale_id uuid; v_resolved_customer_name text;
 v_existing_customer_user_id uuid; v_existing_customer_name text; v_requested_name text;
BEGIN
 v_requested_name:=nullif(trim(coalesce(p_customer_name,'')),'');
 IF v_requested_name IS NOT NULL AND length(v_requested_name)>120 THEN RAISE EXCEPTION 'Customer name is too long.' USING ERRCODE='22023'; END IF;
 SELECT tenant_id INTO v_tenant_id FROM public.branches WHERE id=p_branch_id AND is_active;
 IF v_tenant_id IS NULL OR NOT private.is_tenant_pos_integration_active(v_tenant_id) THEN RAISE EXCEPTION 'POS integration is not active for this tenant.' USING ERRCODE='42501'; END IF;
 IF p_customer_user_id IS NOT NULL THEN
  SELECT nullif(trim(customer_name),'') INTO v_resolved_customer_name FROM public.customer_orders
  WHERE tenant_id=v_tenant_id AND branch_id=p_branch_id AND customer_user_id=p_customer_user_id
  ORDER BY created_at DESC LIMIT 1;
  IF v_resolved_customer_name IS NULL THEN RAISE EXCEPTION 'The selected customer is not registered with this restaurant.' USING ERRCODE='42501'; END IF;
 ELSE v_resolved_customer_name:=v_requested_name; END IF;
 v_sale:=public.create_pos_cash_sale(p_actor_user_id,p_branch_id,p_idempotency_key,p_items,p_cash_tendered_centavos);
 v_sale_id:=nullif(v_sale->>'sale_id','')::uuid;
 IF v_sale_id IS NULL THEN RAISE EXCEPTION 'The cash sale response did not include a sale identifier.'; END IF;
 SELECT customer_user_id,customer_name_snapshot INTO v_existing_customer_user_id,v_existing_customer_name
 FROM public.pos_sales WHERE id=v_sale_id AND tenant_id=v_tenant_id AND branch_id=p_branch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'The saved sale is unavailable.' USING ERRCODE='P0002'; END IF;
 IF v_existing_customer_user_id IS NOT NULL AND p_customer_user_id IS NOT NULL AND v_existing_customer_user_id<>p_customer_user_id THEN RAISE EXCEPTION 'The sale already has a different registered customer.' USING ERRCODE='23505'; END IF;
 IF v_existing_customer_name IS NOT NULL AND v_resolved_customer_name IS NOT NULL AND v_existing_customer_name<>v_resolved_customer_name THEN RAISE EXCEPTION 'The sale already has a different customer name snapshot.' USING ERRCODE='23505'; END IF;
 UPDATE public.pos_sales SET customer_user_id=coalesce(v_existing_customer_user_id,p_customer_user_id),
  customer_name_snapshot=coalesce(v_existing_customer_name,v_resolved_customer_name)
 WHERE id=v_sale_id AND tenant_id=v_tenant_id AND branch_id=p_branch_id;
 RETURN v_sale;
END;
$fn$;

REVOKE ALL ON FUNCTION public.get_pos_cashier_shift(uuid,uuid),
 public.open_pos_cashier_shift(uuid,uuid,bigint),
 public.close_pos_cashier_shift(uuid,uuid,bigint,text),
 public.create_pos_cash_sale(uuid,uuid,uuid,jsonb,bigint),
 public.create_pos_cash_sale_with_customer(uuid,uuid,uuid,jsonb,bigint,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_pos_cashier_shift(uuid,uuid),
 public.open_pos_cashier_shift(uuid,uuid,bigint),
 public.close_pos_cashier_shift(uuid,uuid,bigint,text),
 public.create_pos_cash_sale(uuid,uuid,uuid,jsonb,bigint),
 public.create_pos_cash_sale_with_customer(uuid,uuid,uuid,jsonb,bigint,uuid,text)
 TO service_role;

COMMIT;