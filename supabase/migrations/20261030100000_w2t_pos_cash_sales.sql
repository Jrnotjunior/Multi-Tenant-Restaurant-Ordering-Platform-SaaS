-- POS cash transactions: server-priced, idempotent, branch-scoped sales with audit trail.
BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  cashier_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{32}$'),
  currency text NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  subtotal_centavos bigint NOT NULL CHECK (subtotal_centavos BETWEEN 1 AND 1000000000),
  total_centavos bigint NOT NULL CHECK (total_centavos = subtotal_centavos),
  payment_method text NOT NULL CHECK (payment_method = 'cash'),
  payment_status text NOT NULL DEFAULT 'paid' CHECK (payment_status = 'paid'),
  cash_tendered_centavos bigint NOT NULL CHECK (cash_tendered_centavos >= total_centavos),
  change_centavos bigint NOT NULL CHECK (change_centavos = cash_tendered_centavos - total_centavos),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sales_tenant_id_unique UNIQUE (tenant_id, id),
  CONSTRAINT pos_sales_tenant_branch_fk FOREIGN KEY (tenant_id, branch_id)
    REFERENCES public.branches(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pos_sales_idempotency_unique UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  line_number integer NOT NULL CHECK (line_number BETWEEN 1 AND 50),
  menu_item_id uuid NOT NULL,
  item_name_snapshot text NOT NULL CHECK (char_length(btrim(item_name_snapshot)) BETWEEN 1 AND 160),
  unit_price_centavos bigint NOT NULL CHECK (unit_price_centavos BETWEEN 0 AND 200000000),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  line_total_centavos bigint NOT NULL CHECK (line_total_centavos = unit_price_centavos * quantity),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sale_items_sale_fk FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.pos_sales(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT pos_sale_items_line_unique UNIQUE (sale_id, line_number)
);

CREATE TABLE IF NOT EXISTS public.pos_sale_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('sale_created')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sale_audit_sale_fk FOREIGN KEY (tenant_id, sale_id)
    REFERENCES public.pos_sales(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS pos_sales_branch_created_idx
  ON public.pos_sales(tenant_id, branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pos_sale_items_sale_idx
  ON public.pos_sale_items(tenant_id, sale_id, line_number);
CREATE INDEX IF NOT EXISTS pos_sale_audit_sale_idx
  ON public.pos_sale_audit_events(tenant_id, sale_id, occurred_at DESC);

ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_sales, public.pos_sale_items, public.pos_sale_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_sales, public.pos_sale_items, public.pos_sale_audit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pos_sales_sale_number_seq, public.pos_sale_audit_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.create_pos_cash_sale(
  p_actor_user_id uuid,
  p_branch_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_cash_tendered_centavos bigint
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_role text;
  v_sale_id uuid;
  v_sale_number bigint;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_line jsonb;
  v_item_id uuid;
  v_quantity integer;
  v_line_number integer := 0;
  v_total_units integer := 0;
  v_item_name text;
  v_unit_price bigint;
  v_line_total bigint;
  v_subtotal bigint := 0;
  v_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_actor_user_id IS NULL OR p_branch_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Missing sale identity or request key.' USING ERRCODE='22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50
    OR octet_length(p_items::text) > 50000 THEN
    RAISE EXCEPTION 'Add items before checkout.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text || ':' || p_idempotency_key::text, 0));

  SELECT b.tenant_id INTO v_tenant_id
  FROM public.branches b
  WHERE b.id = p_branch_id AND b.is_active;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'This branch is unavailable.' USING ERRCODE='42501';
  END IF;

  SELECT m.role INTO v_role
  FROM public.tenant_memberships m
  WHERE m.tenant_id = v_tenant_id AND m.user_id = p_actor_user_id
    AND m.status = 'active' AND m.role IN ('restaurant_owner','cashier');
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Active cashier or restaurant-owner access is required for this tenant.' USING ERRCODE='42501';
  END IF;
  IF v_role = 'cashier' AND NOT EXISTS (
    SELECT 1 FROM public.branch_memberships bm
    WHERE bm.tenant_id = v_tenant_id AND bm.branch_id = p_branch_id AND bm.user_id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'You are not assigned to this branch.' USING ERRCODE='42501';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'actor', p_actor_user_id, 'branch', p_branch_id,
    'items', p_items, 'cash_tendered_centavos', p_cash_tendered_centavos
  )::text);

  SELECT s.id, s.sale_number, s.request_fingerprint
    INTO v_sale_id, v_sale_number, v_existing_fingerprint
  FROM public.pos_sales s
  WHERE s.tenant_id = v_tenant_id AND s.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'This checkout key was already used for a different sale.' USING ERRCODE='22023';
    END IF;
    RETURN jsonb_build_object('success', true, 'repeated', true, 'sale_id', v_sale_id,
      'sale_number', v_sale_number);
  END IF;

  INSERT INTO public.pos_sales(
    tenant_id, branch_id, cashier_user_id, idempotency_key, request_fingerprint,
    subtotal_centavos, total_centavos, payment_method, payment_status,
    cash_tendered_centavos, change_centavos
  ) VALUES (
    v_tenant_id, p_branch_id, p_actor_user_id, p_idempotency_key, v_fingerprint,
    1, 1, 'cash', 'paid', GREATEST(COALESCE(p_cash_tendered_centavos, 0), 1),
    GREATEST(COALESCE(p_cash_tendered_centavos, 0), 1) - 1
  ) RETURNING id, sale_number INTO v_sale_id, v_sale_number;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_items) AS e(value) LOOP
    v_line_number := v_line_number + 1;
    IF jsonb_typeof(v_line) IS DISTINCT FROM 'object'
      OR (v_line - ARRAY['item_id','quantity']) <> '{}'::jsonb
      OR NOT (v_line ?& ARRAY['item_id','quantity'])
      OR jsonb_typeof(v_line->'item_id') IS DISTINCT FROM 'string'
      OR jsonb_typeof(v_line->'quantity') IS DISTINCT FROM 'number'
      OR COALESCE(v_line->>'quantity','') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'A sale item is invalid. Refresh the menu and try again.' USING ERRCODE='22023';
    END IF;
    BEGIN
      v_item_id := (v_line->>'item_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'A sale item is invalid.' USING ERRCODE='22023';
    END;
    v_quantity := (v_line->>'quantity')::integer;
    IF v_quantity NOT BETWEEN 1 AND 100 OR v_item_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'Item quantity is invalid or a duplicate line was submitted.' USING ERRCODE='22023';
    END IF;
    v_seen := array_append(v_seen, v_item_id);
    v_total_units := v_total_units + v_quantity;
    IF v_total_units > 200 THEN
      RAISE EXCEPTION 'The sale exceeds the item limit.' USING ERRCODE='22023';
    END IF;

    SELECT i.name, COALESCE(bm.price_override_centavos, i.price_centavos)::bigint
      INTO v_item_name, v_unit_price
    FROM public.menu_items i
    JOIN public.menu_categories c ON c.tenant_id = i.tenant_id AND c.id = i.category_id
    JOIN public.branch_menu_items bm ON bm.tenant_id = i.tenant_id AND bm.item_id = i.id
      AND bm.branch_id = p_branch_id AND bm.is_available
    WHERE i.tenant_id = v_tenant_id AND i.id = v_item_id
      AND i.status = 'published' AND c.is_published
    FOR SHARE OF i, c, bm;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An item is no longer available at this branch. Refresh the menu.' USING ERRCODE='P0002';
    END IF;
    IF v_unit_price < 0 OR v_unit_price > 200000000 THEN
      RAISE EXCEPTION 'An item price is outside the supported range.' USING ERRCODE='22023';
    END IF;

    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
    IF v_subtotal > 1000000000 THEN
      RAISE EXCEPTION 'The sale total exceeds the supported limit.' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.pos_sale_items(
      tenant_id, sale_id, line_number, menu_item_id, item_name_snapshot,
      unit_price_centavos, quantity, line_total_centavos
    ) VALUES (
      v_tenant_id, v_sale_id, v_line_number, v_item_id, v_item_name,
      v_unit_price, v_quantity, v_line_total
    );
  END LOOP;

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'The sale total must be greater than zero.' USING ERRCODE='22023';
  END IF;
  IF p_cash_tendered_centavos IS NULL OR p_cash_tendered_centavos < v_subtotal
    OR p_cash_tendered_centavos > 2000000000 THEN
    RAISE EXCEPTION 'Cash received must be at least the sale total.' USING ERRCODE='22023';
  END IF;

  UPDATE public.pos_sales SET subtotal_centavos = v_subtotal, total_centavos = v_subtotal,
    cash_tendered_centavos = p_cash_tendered_centavos,
    change_centavos = p_cash_tendered_centavos - v_subtotal
  WHERE id = v_sale_id AND tenant_id = v_tenant_id;

  INSERT INTO public.pos_sale_audit_events(tenant_id, sale_id, actor_user_id, event_type, details)
  VALUES (v_tenant_id, v_sale_id, p_actor_user_id, 'sale_created',
    jsonb_build_object('branch_id', p_branch_id, 'total_centavos', v_subtotal,
      'payment_method', 'cash', 'item_count', v_line_number));

  RETURN jsonb_build_object('success', true, 'repeated', false, 'sale_id', v_sale_id,
    'sale_number', v_sale_number, 'subtotal_centavos', v_subtotal,
    'cash_tendered_centavos', p_cash_tendered_centavos,
    'change_centavos', p_cash_tendered_centavos - v_subtotal);
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_pos_cash_sale(uuid,uuid,uuid,jsonb,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pos_cash_sale(uuid,uuid,uuid,jsonb,bigint) TO service_role;

COMMIT;
