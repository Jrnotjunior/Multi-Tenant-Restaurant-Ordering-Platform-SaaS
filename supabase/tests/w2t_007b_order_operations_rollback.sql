-- W2T-007B: order inbox, MFA gate, transition rules, and tenant isolation.
-- Uses synthetic records and rolls all changes back.
BEGIN;

DO $test$
DECLARE
  v_user uuid := '30000000-0000-4000-8000-000000000001';
  v_other_user uuid := '30000000-0000-4000-8000-000000000002';
  v_tenant uuid := '30000000-0000-4000-8000-000000000001';
  v_branch uuid := '30000000-0000-4000-8000-000000000002';
  v_order uuid := '30000000-0000-4000-8000-000000000003';
  v_item uuid := '30000000-0000-4000-8000-000000000004';
  v_result jsonb;
  v_denied boolean;
BEGIN
  INSERT INTO auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  VALUES
    (v_user,'authenticated','authenticated','w2t-007b-owner@example.invalid','',now(),'{}','{}',now(),now()),
    (v_other_user,'authenticated','authenticated','w2t-007b-other@example.invalid','',now(),'{}','{}',now(),now());

  INSERT INTO public.tenants(id,slug,name,status)
    VALUES(v_tenant,'w2t-007b-restaurant','W2T 007B Test Restaurant','active');
  INSERT INTO public.branches(id,tenant_id,slug,name,is_active)
    VALUES(v_branch,v_tenant,'main','Main Branch',true);
  INSERT INTO public.tenant_memberships(tenant_id,user_id,role,status)
    VALUES(v_tenant,v_user,'restaurant_owner','active');
  INSERT INTO public.tenant_storefronts(tenant_id,default_branch_id,display_name,status,accepting_orders)
    VALUES(v_tenant,v_branch,'W2T 007B Test Restaurant','published',true);
  INSERT INTO public.customer_orders(id,tenant_id,branch_id,idempotency_key,request_fingerprint,
    customer_name,customer_phone,customer_phone_normalized,delivery_address,subtotal_centavos,
    delivery_fee_centavos,total_centavos,order_status)
  VALUES(v_order,v_tenant,v_branch,'30000000-0000-4000-8000-000000000005',
    '0123456789abcdef0123456789abcdef','Test Customer','09171234567','09171234567',
    '12 Test Street, Quezon City',25000,5000,30000,'pending_confirmation');
  INSERT INTO public.customer_order_items(tenant_id,order_id,line_number,menu_item_id,item_name_snapshot,
    unit_price_centavos,quantity,line_total_centavos,options_snapshot)
  VALUES(v_tenant,v_order,1,v_item,'Test Meal',25000,1,25000,'[]'::jsonb);

  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_user::text,'role','authenticated','aal','aal1')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_denied:=false;
  BEGIN
    PERFORM public.list_customer_orders(v_tenant,'active',50);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'AAL1 owner was allowed to read the order inbox'; END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_user::text,'role','authenticated','aal','aal2')::text,true);
  v_result:=public.list_customer_orders(v_tenant,'active',50);
  IF jsonb_array_length(v_result->'orders')<>1
     OR v_result->'orders'->0->>'id'<>v_order::text
     OR v_result->'orders'->0->>'customer_name'<>'Test Customer'
     OR jsonb_array_length(v_result->'orders'->0->'items')<>1 THEN
    RAISE EXCEPTION 'Order inbox returned an unexpected result: %',v_result;
  END IF;

  v_result:=public.transition_customer_order(v_tenant,v_order,'confirm');
  IF v_result->>'order_status'<>'confirmed'
     OR v_result->>'payment_status'<>'not_started' THEN
    RAISE EXCEPTION 'Confirm action returned unexpected state: %',v_result;
  END IF;

  v_denied:=false;
  BEGIN
    PERFORM public.transition_customer_order(v_tenant,v_order,'reject');
  EXCEPTION WHEN invalid_parameter_value THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Invalid transition from confirmed to rejected was allowed'; END IF;

  v_result:=public.set_tenant_order_acceptance(v_tenant,false);
  IF v_result->>'accepting_orders'<>'false' THEN
    RAISE EXCEPTION 'Owner could not pause order intake';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_other_user::text,true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_other_user::text,'role','authenticated','aal','aal2')::text,true);
  v_denied:=false;
  BEGIN
    PERFORM public.list_customer_orders(v_tenant,'all',50);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'Non-member read another tenant order inbox'; END IF;

  EXECUTE 'RESET ROLE';
  IF has_function_privilege('anon','public.list_customer_orders(uuid,text,integer)','EXECUTE')
     OR has_function_privilege('anon','public.transition_customer_order(uuid,uuid,text)','EXECUTE')
     OR has_function_privilege('anon','public.set_tenant_order_acceptance(uuid,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'An anonymous user can execute an order operations RPC';
  END IF;
END;
$test$;

ROLLBACK;
SELECT 'W2T-007B order operations tests passed; synthetic data rolled back' AS result;
