BEGIN;

DO $test$
DECLARE
  v_tenant uuid := '10000000-0000-4000-8000-000000000001';
  v_branch uuid := '10000000-0000-4000-8000-000000000002';
  v_storefront uuid := v_tenant;
  v_category uuid := '10000000-0000-4000-8000-000000000003';
  v_item uuid := '10000000-0000-4000-8000-000000000004';
  v_group uuid := '10000000-0000-4000-8000-000000000005';
  v_option uuid := '10000000-0000-4000-8000-000000000006';
  v_other_option uuid := '10000000-0000-4000-8000-000000000007';
  v_key uuid := '20000000-0000-4000-8000-000000000001';
  v_result jsonb;
  v_retry jsonb;
  v_order_id uuid;
  v_count integer;
  v_subtotal bigint;
  v_snapshot jsonb;
BEGIN
  INSERT INTO public.tenants(id,slug,name,status)
    VALUES(v_tenant,'checkout-test-tenant','Checkout Test Restaurant','active');
  INSERT INTO public.branches(id,tenant_id,slug,name,is_active)
    VALUES(v_branch,v_tenant,'main','Main Branch',true);
  INSERT INTO public.tenant_storefronts(tenant_id,default_branch_id,display_name,status)
    VALUES(v_storefront,v_branch,'Checkout Test Restaurant','published');

  BEGIN
    PERFORM public.create_customer_order(
      'checkout-test-tenant','main','Test Guest','+63 917 123 4567',
      '12 Sample Street, Quezon City','Ring the bell',v_key,
      jsonb_build_array(jsonb_build_object(
        'item_id',v_item::text,'quantity',1,'option_ids','[]'::jsonb
      ))
    );
    RAISE EXCEPTION 'Order request was accepted while the restaurant gate was off';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;

  UPDATE public.tenant_storefronts SET accepting_orders=true WHERE tenant_id=v_storefront;
  INSERT INTO public.menu_categories(id,tenant_id,name,is_published)
    VALUES(v_category,v_tenant,'Mains',true);
  INSERT INTO public.menu_items(id,tenant_id,category_id,name,description,price_centavos,status)
    VALUES(v_item,v_tenant,v_category,'Test Chicken','Test-only catalog item',19900,'published');
  INSERT INTO public.branch_menu_items(tenant_id,branch_id,item_id,is_available)
    VALUES(v_tenant,v_branch,v_item,true);
  INSERT INTO public.menu_modifier_groups(id,tenant_id,item_id,name,min_select,max_select,is_active)
    VALUES(v_group,v_tenant,v_item,'Size',1,1,true);
  INSERT INTO public.menu_modifier_options(id,tenant_id,item_id,group_id,name,price_centavos,is_active)
    VALUES
      (v_option,v_tenant,v_item,v_group,'Large',5000,true),
      (v_other_option,v_tenant,v_item,v_group,'Regular',0,true);

  v_result := public.create_customer_order(
    'checkout-test-tenant','main','Test Guest','+63 917 123 4567',
    '12 Sample Street, Quezon City','Ring the bell',v_key,
    jsonb_build_array(jsonb_build_object(
      'item_id',v_item::text,'quantity',2,'option_ids',jsonb_build_array(v_option::text)
    ))
  );

  IF v_result->>'success' <> 'true'
     OR v_result->>'status' <> 'pending_confirmation'
     OR (v_result->>'subtotal_centavos')::bigint <> 49800
     OR v_result->>'payment_status' <> 'not_started'
     OR v_result->>'delivery_fee_confirmed' <> 'false'
     OR v_result->>'repeated' <> 'false' THEN
    RAISE EXCEPTION 'Valid checkout request returned unexpected response: %',v_result;
  END IF;

  v_order_id := (v_result->>'order_id')::uuid;
  SELECT count(*),max(subtotal_centavos) INTO v_count,v_subtotal
  FROM public.customer_orders WHERE id=v_order_id;
  IF v_count <> 1 OR v_subtotal <> 49800 THEN
    RAISE EXCEPTION 'Order header or server-calculated subtotal is incorrect';
  END IF;
  SELECT options_snapshot INTO v_snapshot FROM public.customer_order_items
  WHERE order_id=v_order_id AND line_number=1;
  IF jsonb_array_length(v_snapshot) <> 1
     OR v_snapshot->0->>'name' <> 'Large'
     OR (v_snapshot->0->>'price_centavos')::integer <> 5000 THEN
    RAISE EXCEPTION 'Modifier snapshot was not preserved: %',v_snapshot;
  END IF;

  v_retry := public.create_customer_order(
    'checkout-test-tenant','main','Test Guest','+63 917 123 4567',
    '12 Sample Street, Quezon City','Ring the bell',v_key,
    jsonb_build_array(jsonb_build_object(
      'item_id',v_item::text,'quantity',2,'option_ids',jsonb_build_array(v_option::text)
    ))
  );
  IF v_retry->>'repeated' <> 'true' OR v_retry->>'order_id' <> v_order_id::text THEN
    RAISE EXCEPTION 'Idempotent retry did not return the original order: %',v_retry;
  END IF;

  SELECT count(*) INTO v_count FROM public.customer_orders WHERE tenant_id=v_tenant;
  IF v_count <> 1 THEN RAISE EXCEPTION 'A retry created a duplicate order'; END IF;

  BEGIN
    PERFORM public.create_customer_order(
      'checkout-test-tenant','main','Test Guest','+63 917 123 4567',
      '12 Sample Street, Quezon City','Ring the bell',v_key,
      jsonb_build_array(jsonb_build_object(
        'item_id',v_item::text,'quantity',1,'option_ids',jsonb_build_array(v_option::text)
      ))
    );
    RAISE EXCEPTION 'Idempotency key reuse with changed payload was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_customer_order(
      'checkout-test-tenant','main','Test Guest','+63 917 123 4567',
      '12 Sample Street, Quezon City','Ring the bell','20000000-0000-4000-8000-000000000002',
      jsonb_build_array(jsonb_build_object(
        'item_id',v_item::text,'quantity',1,'option_ids',jsonb_build_array('30000000-0000-4000-8000-000000000099')
      ))
    );
    RAISE EXCEPTION 'Unknown modifier ID was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_customer_order(
      'checkout-test-tenant','main','Test Guest','+63 917 123 4567',
      '12 Sample Street, Quezon City','Ring the bell','20000000-0000-4000-8000-000000000004',
      jsonb_build_array(jsonb_build_object(
        'item_id',v_item::text,'quantity',1,'option_ids',jsonb_build_array(v_option::text),
        'price_centavos',1
      ))
    );
    RAISE EXCEPTION 'Client-supplied price was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  BEGIN
    PERFORM public.create_customer_order(
      'checkout-test-tenant','main','Test Guest','+63 917 123 4567',
      '12 Sample Street, Quezon City','Ring the bell','20000000-0000-4000-8000-000000000003',
      jsonb_build_array(jsonb_build_object(
        'item_id',v_item::text,'quantity',1,'option_ids','[]'::jsonb
      ))
    );
    RAISE EXCEPTION 'Missing required modifier was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  IF has_table_privilege('anon','public.customer_orders','SELECT')
     OR has_table_privilege('anon','public.customer_orders','INSERT')
     OR has_table_privilege('authenticated','public.customer_order_items','SELECT')
     OR has_table_privilege('authenticated','public.customer_order_items','INSERT') THEN
    RAISE EXCEPTION 'Direct browser table access was unexpectedly granted';
  END IF;
  IF NOT has_function_privilege('anon',
      'public.create_customer_order(text,text,text,text,text,text,uuid,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous checkout RPC execute grant is missing';
  END IF;
END;
$test$;

ROLLBACK;