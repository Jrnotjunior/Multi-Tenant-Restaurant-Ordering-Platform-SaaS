-- W2T-007A: server-validated guest/registered delivery order requests.
-- Orders are private snapshots. Guest checkout never trusts client prices or labels.
BEGIN;

CREATE TABLE public.customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  branch_id uuid NOT NULL,
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{32}$'),
  customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 2 AND 120),
  customer_phone text NOT NULL CHECK (char_length(btrim(customer_phone)) BETWEEN 7 AND 24),
  customer_phone_normalized text NOT NULL CHECK (customer_phone_normalized ~ '^[0-9]{7,15}$'),
  delivery_address text NOT NULL CHECK (char_length(btrim(delivery_address)) BETWEEN 8 AND 500),
  delivery_notes text NOT NULL DEFAULT '' CHECK (char_length(delivery_notes) <= 300),
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  subtotal_centavos bigint NOT NULL DEFAULT 0 CHECK (subtotal_centavos BETWEEN 0 AND 1000000000),
  delivery_fee_centavos bigint CHECK (delivery_fee_centavos IS NULL OR delivery_fee_centavos BETWEEN 0 AND 1000000000),
  total_centavos bigint CHECK (total_centavos IS NULL OR total_centavos BETWEEN 0 AND 2000000000),
  order_status text NOT NULL DEFAULT 'pending_confirmation'
    CHECK (order_status IN ('pending_confirmation','confirmed','rejected','cancelled','preparing','ready_for_dispatch','out_for_delivery','delivered')),
  payment_status text NOT NULL DEFAULT 'not_started'
    CHECK (payment_status IN ('not_started','pending','paid','failed','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_orders_tenant_id_id_key UNIQUE (tenant_id,id),
  CONSTRAINT customer_orders_tenant_branch_fk FOREIGN KEY (tenant_id,branch_id)
    REFERENCES public.branches(tenant_id,id) ON DELETE RESTRICT,
  CONSTRAINT customer_orders_idempotency_unique UNIQUE (tenant_id,idempotency_key),
  CONSTRAINT customer_orders_total_consistency CHECK (
    (delivery_fee_centavos IS NULL AND total_centavos IS NULL)
    OR (delivery_fee_centavos IS NOT NULL AND total_centavos = subtotal_centavos + delivery_fee_centavos)
  )
);

CREATE TABLE public.customer_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 50),
  menu_item_id uuid NOT NULL,
  item_name_snapshot text NOT NULL CHECK (char_length(btrim(item_name_snapshot)) BETWEEN 2 AND 160),
  unit_price_centavos bigint NOT NULL CHECK (unit_price_centavos BETWEEN 0 AND 200000000),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  line_total_centavos bigint NOT NULL CHECK (line_total_centavos = unit_price_centavos * quantity),
  options_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options_snapshot) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_order_items_tenant_order_fk
    FOREIGN KEY (tenant_id,order_id) REFERENCES public.customer_orders(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT customer_order_items_line_unique UNIQUE (order_id,line_number)
);

CREATE INDEX customer_orders_branch_created_idx
  ON public.customer_orders(tenant_id,branch_id,created_at DESC);
CREATE INDEX customer_orders_phone_created_idx
  ON public.customer_orders(tenant_id,customer_phone_normalized,created_at DESC);
CREATE INDEX customer_orders_user_created_idx
  ON public.customer_orders(customer_user_id,created_at DESC) WHERE customer_user_id IS NOT NULL;
CREATE INDEX customer_order_items_order_idx
  ON public.customer_order_items(tenant_id,order_id,line_number);

ALTER TABLE public.customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_order_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_orders,public.customer_order_items FROM PUBLIC,anon,authenticated;
-- No direct table policy is created. All access must use reviewed server functions.

CREATE FUNCTION private.create_customer_order(
  p_restaurant_slug text,
  p_branch_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_notes text,
  p_idempotency_key uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_slug text := lower(btrim(coalesce(p_restaurant_slug,'')));
  v_branch_slug text := lower(btrim(coalesce(p_branch_slug,'')));
  v_name text := btrim(coalesce(p_customer_name,''));
  v_phone text := btrim(coalesce(p_customer_phone,''));
  v_phone_digits text;
  v_address text := btrim(coalesce(p_delivery_address,''));
  v_notes text := btrim(coalesce(p_delivery_notes,''));
  v_tenant_id uuid;
  v_branch_id uuid;
  v_customer_id uuid := (SELECT auth.uid());
  v_fingerprint text;
  v_existing_fingerprint text;
  v_order_id uuid;
  v_order_number bigint;
  v_existing_status text;
  v_existing_subtotal bigint;
  v_line jsonb;
  v_option jsonb;
  v_item_id uuid;
  v_option_id uuid;
  v_option_ids uuid[];
  v_sorted_option_ids uuid[];
  v_seen_line_keys text[] := ARRAY[]::text[];
  v_line_key text;
  v_quantity integer;
  v_item_name text;
  v_base_price integer;
  v_option_total bigint;
  v_unit_price bigint;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_total_units integer := 0;
  v_line_number integer := 0;
  v_valid_option_count integer;
  v_selected_count integer;
  v_group record;
  v_options_snapshot jsonb;
BEGIN
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_slug) NOT BETWEEN 3 AND 64
     OR v_branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(v_branch_slug) NOT BETWEEN 2 AND 64 THEN
    RAISE EXCEPTION 'Choose a valid restaurant and branch.' USING ERRCODE='22023';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'A checkout request key is required. Retry checkout.' USING ERRCODE='22023';
  END IF;
  IF char_length(v_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'Enter your name (2–120 characters).' USING ERRCODE='22023';
  END IF;
  IF char_length(v_phone) NOT BETWEEN 7 AND 24 OR v_phone !~ '^[+0-9() .-]+$' THEN
    RAISE EXCEPTION 'Enter a valid contact number.' USING ERRCODE='22023';
  END IF;
  v_phone_digits := regexp_replace(v_phone,'[^0-9]','','g');
  IF char_length(v_phone_digits) NOT BETWEEN 7 AND 15 THEN
    RAISE EXCEPTION 'Enter a valid contact number.' USING ERRCODE='22023';
  END IF;
  IF char_length(v_address) NOT BETWEEN 8 AND 500 THEN
    RAISE EXCEPTION 'Enter a complete delivery address (8–500 characters).' USING ERRCODE='22023';
  END IF;
  IF char_length(v_notes) > 300 THEN
    RAISE EXCEPTION 'Delivery instructions must be 300 characters or fewer.' USING ERRCODE='22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50
     OR octet_length(p_items::text) > 100000 THEN
    RAISE EXCEPTION 'Your basket is empty or too large. Refresh the menu and try again.' USING ERRCODE='22023';
  END IF;

  SELECT t.id INTO v_tenant_id
  FROM public.tenants t WHERE t.slug=v_slug;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'This restaurant is unavailable.' USING ERRCODE='P0002';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'restaurant_slug',v_slug,
    'branch_slug',v_branch_slug,
    'customer_name',v_name,
    'customer_phone',v_phone,
    'delivery_address',v_address,
    'delivery_notes',v_notes,
    'items',p_items
  )::text);

  -- Resolve an earlier response first, so a retry still works if availability
  -- changes after the original request committed.
  SELECT o.id,o.order_number,o.order_status,o.subtotal_centavos,o.request_fingerprint
    INTO v_order_id,v_order_number,v_existing_status,v_existing_subtotal,v_existing_fingerprint
  FROM public.customer_orders o
  WHERE o.tenant_id=v_tenant_id AND o.idempotency_key=p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'This checkout request key was already used for different details. Start checkout again.' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'success',true,'repeated',true,'order_id',v_order_id,
      'order_number',v_order_number,'status',v_existing_status,
      'subtotal_centavos',v_existing_subtotal,'payment_status','not_started',
      'delivery_fee_confirmed',false
    );
  END IF;

  SELECT b.id INTO v_branch_id
  FROM public.tenants t
  JOIN public.tenant_storefronts s ON s.tenant_id=t.id
  JOIN public.branches b ON b.tenant_id=t.id
  WHERE t.id=v_tenant_id AND t.status='active' AND s.status='published'
    AND b.slug=v_branch_slug AND b.is_active
  FOR SHARE OF t,s,b;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'This restaurant or branch is not accepting order requests right now.' USING ERRCODE='P0002';
  END IF;

  -- Basic per-phone throttle for accidental/repeated guest submissions. This
  -- complements idempotency; an edge/WAF rate limiter is still required for abuse resistance.
  IF (SELECT count(*) FROM public.customer_orders o
      WHERE o.tenant_id=v_tenant_id
        AND o.customer_phone_normalized=v_phone_digits
        AND o.created_at > now() - interval '10 minutes'
        AND o.order_status IN ('pending_confirmation','confirmed')) >= 5 THEN
    RAISE EXCEPTION 'Too many recent order requests for this contact number. Please wait before trying again.' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.customer_orders(
    tenant_id,branch_id,customer_user_id,idempotency_key,request_fingerprint,
    customer_name,customer_phone,customer_phone_normalized,delivery_address,delivery_notes
  ) VALUES (
    v_tenant_id,v_branch_id,v_customer_id,p_idempotency_key,v_fingerprint,
    v_name,v_phone,v_phone_digits,v_address,v_notes
  )
  ON CONFLICT (tenant_id,idempotency_key) DO NOTHING
  RETURNING id,order_number INTO v_order_id,v_order_number;

  IF v_order_id IS NULL THEN
    SELECT o.id,o.order_number,o.order_status,o.subtotal_centavos,o.request_fingerprint
      INTO v_order_id,v_order_number,v_existing_status,v_existing_subtotal,v_existing_fingerprint
    FROM public.customer_orders o
    WHERE o.tenant_id=v_tenant_id AND o.idempotency_key=p_idempotency_key
    FOR UPDATE;
    IF v_order_id IS NULL OR v_existing_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'This checkout request key was already used for different details. Start checkout again.' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object(
      'success',true,'repeated',true,'order_id',v_order_id,
      'order_number',v_order_number,'status',v_existing_status,
      'subtotal_centavos',v_existing_subtotal,'payment_status','not_started',
      'delivery_fee_confirmed',false
    );
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) AS entries(value) LOOP
    v_line_number := v_line_number + 1;
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' OR jsonb_object_length(v_line) <> 3
       OR NOT (v_line ?& ARRAY['item_id','quantity','option_ids'])
       OR jsonb_typeof(v_line->'item_id') IS DISTINCT FROM 'string'
       OR jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number'
       OR coalesce(v_line->>'quantity','') !~ '^[0-9]+$'
       OR jsonb_typeof(v_line->'option_ids') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'One of the basket lines is invalid. Refresh the menu and try again.' USING ERRCODE='22023';
    END IF;
    BEGIN
      v_item_id := (v_line->>'item_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'One of the basket items is invalid. Refresh the menu and try again.' USING ERRCODE='22023';
    END;
    v_quantity := (v_line->>'quantity')::integer;
    IF v_quantity NOT BETWEEN 1 AND 20 THEN
      RAISE EXCEPTION 'Each item quantity must be between 1 and 20.' USING ERRCODE='22023';
    END IF;
    v_total_units := v_total_units + v_quantity;
    IF v_total_units > 100 THEN
      RAISE EXCEPTION 'Your basket has too many items. Please reduce the quantity.' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(v_line->'option_ids') > 40 THEN
      RAISE EXCEPTION 'Too many customizations on one item.' USING ERRCODE='22023';
    END IF;

    v_option_ids := ARRAY[]::uuid[];
    FOR v_option IN SELECT value FROM jsonb_array_elements(v_line->'option_ids') AS opts(value) LOOP
      IF jsonb_typeof(v_option) IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'One of the selected customizations is invalid.' USING ERRCODE='22023';
      END IF;
      BEGIN
        v_option_id := (v_option #>> '{}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'One of the selected customizations is invalid.' USING ERRCODE='22023';
      END;
      IF v_option_id = ANY(v_option_ids) THEN
        RAISE EXCEPTION 'A customization was selected more than once.' USING ERRCODE='22023';
      END IF;
      v_option_ids := array_append(v_option_ids,v_option_id);
    END LOOP;
    SELECT coalesce(array_agg(id ORDER BY id),ARRAY[]::uuid[])
      INTO v_sorted_option_ids FROM unnest(v_option_ids) AS ids(id);
    v_option_ids := v_sorted_option_ids;
    v_line_key := v_item_id::text || ':' || array_to_string(v_option_ids,',');
    IF v_line_key = ANY(v_seen_line_keys) THEN
      RAISE EXCEPTION 'Duplicate basket lines were found. Refresh your basket and try again.' USING ERRCODE='22023';
    END IF;
    v_seen_line_keys := array_append(v_seen_line_keys,v_line_key);

    SELECT i.name,COALESCE(bm.price_override_centavos,i.price_centavos)
      INTO v_item_name,v_base_price
    FROM public.menu_items i
    JOIN public.menu_categories c ON c.tenant_id=i.tenant_id AND c.id=i.category_id
    JOIN public.branch_menu_items bm ON bm.tenant_id=i.tenant_id AND bm.item_id=i.id
      AND bm.branch_id=v_branch_id AND bm.is_available
    WHERE i.tenant_id=v_tenant_id AND i.id=v_item_id
      AND i.status='published' AND c.is_published
    FOR SHARE OF i,c,bm;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'One or more items are no longer available at this branch. Refresh the menu.' USING ERRCODE='P0002';
    END IF;

    -- Lock every modifier group/option for this item until the order snapshot is
    -- written, so a concurrent price or publication update cannot race the order.
    PERFORM 1 FROM public.menu_modifier_groups g
      WHERE g.tenant_id=v_tenant_id AND g.item_id=v_item_id FOR SHARE;
    PERFORM 1 FROM public.menu_modifier_options o
      WHERE o.tenant_id=v_tenant_id AND o.item_id=v_item_id FOR SHARE;

    SELECT count(*) INTO v_valid_option_count
    FROM unnest(v_option_ids) AS selected(option_id)
    JOIN public.menu_modifier_options o ON o.id=selected.option_id
      AND o.tenant_id=v_tenant_id AND o.item_id=v_item_id AND o.is_active
    JOIN public.menu_modifier_groups g ON g.id=o.group_id
      AND g.tenant_id=o.tenant_id AND g.item_id=o.item_id AND g.is_active;
    IF v_valid_option_count <> cardinality(v_option_ids) THEN
      RAISE EXCEPTION 'One or more customizations are unavailable. Refresh the menu.' USING ERRCODE='22023';
    END IF;

    FOR v_group IN
      SELECT g.id,g.min_select,g.max_select
      FROM public.menu_modifier_groups g
      WHERE g.tenant_id=v_tenant_id AND g.item_id=v_item_id AND g.is_active
      ORDER BY g.id
    LOOP
      SELECT count(*) INTO v_selected_count
      FROM unnest(v_option_ids) AS selected(option_id)
      JOIN public.menu_modifier_options o ON o.id=selected.option_id
        AND o.tenant_id=v_tenant_id AND o.item_id=v_item_id
        AND o.group_id=v_group.id AND o.is_active;
      IF v_selected_count < v_group.min_select OR v_selected_count > v_group.max_select THEN
        RAISE EXCEPTION 'Choose valid options for every required menu customization.' USING ERRCODE='22023';
      END IF;
    END LOOP;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',o.id,'name',o.name,'group_id',g.id,'group_name',g.name,
        'price_centavos',o.price_centavos
      ) ORDER BY g.sort_order,g.name,o.sort_order,o.name,o.id),'[]'::jsonb),
      COALESCE(sum(o.price_centavos),0)
      INTO v_options_snapshot,v_option_total
    FROM unnest(v_option_ids) AS selected(option_id)
    JOIN public.menu_modifier_options o ON o.id=selected.option_id
      AND o.tenant_id=v_tenant_id AND o.item_id=v_item_id AND o.is_active
    JOIN public.menu_modifier_groups g ON g.id=o.group_id
      AND g.tenant_id=o.tenant_id AND g.item_id=o.item_id AND g.is_active;

    v_unit_price := v_base_price::bigint + v_option_total;
    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    IF v_subtotal > 1000000000 THEN
      RAISE EXCEPTION 'The basket total exceeds the supported limit.' USING ERRCODE='22023';
    END IF;

    INSERT INTO public.customer_order_items(
      tenant_id,order_id,line_number,menu_item_id,item_name_snapshot,
      unit_price_centavos,quantity,line_total_centavos,options_snapshot
    ) VALUES (
      v_tenant_id,v_order_id,v_line_number,v_item_id,v_item_name,
      v_unit_price,v_quantity,v_line_total,v_options_snapshot
    );
  END LOOP;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'The basket total is invalid.' USING ERRCODE='22023';
  END IF;
  UPDATE public.customer_orders SET subtotal_centavos=v_subtotal,updated_at=now()
  WHERE id=v_order_id AND tenant_id=v_tenant_id;

  RETURN jsonb_build_object(
    'success',true,'repeated',false,'order_id',v_order_id,
    'order_number',v_order_number,'status','pending_confirmation',
    'subtotal_centavos',v_subtotal,'payment_status','not_started',
    'delivery_fee_confirmed',false
  );
END;
$fn$;

CREATE FUNCTION public.create_customer_order(
  p_restaurant_slug text,
  p_branch_slug text,
  p_customer_name text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_notes text,
  p_idempotency_key uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $fn$
  SELECT private.create_customer_order(
    p_restaurant_slug,p_branch_slug,p_customer_name,p_customer_phone,
    p_delivery_address,p_delivery_notes,p_idempotency_key,p_items
  );
$fn$;

REVOKE ALL ON FUNCTION private.create_customer_order(text,text,text,text,text,text,uuid,jsonb),
  public.create_customer_order(text,text,text,text,text,text,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.create_customer_order(text,text,text,text,text,text,uuid,jsonb)
  TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_order(text,text,text,text,text,text,uuid,jsonb)
  TO anon,authenticated;
COMMIT;
