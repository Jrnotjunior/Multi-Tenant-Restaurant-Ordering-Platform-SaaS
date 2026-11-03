-- Preserve customer notes on each order line alongside the server-priced option snapshot.
BEGIN;

ALTER TABLE public.customer_order_items
  ADD COLUMN IF NOT EXISTS special_instructions text NOT NULL DEFAULT '';
ALTER TABLE public.customer_order_items
  DROP CONSTRAINT IF EXISTS customer_order_items_special_instructions_length;
ALTER TABLE public.customer_order_items
  ADD CONSTRAINT customer_order_items_special_instructions_length
  CHECK (char_length(special_instructions) <= 300);

-- Adapt the currently installed order RPC without copying its full security and
-- pricing implementation into another migration. Fail the migration if its
-- expected source has drifted so it can be updated intentionally.
DO $migration$
DECLARE
  v_oid oid;
  v_definition text;
  v_updated text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='private' AND p.proname='create_customer_order'
    AND p.prokind='f' AND p.pronargs=11
  ORDER BY p.oid DESC
  LIMIT 1;
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'private.create_customer_order was not found';
  END IF;
  v_definition := pg_catalog.pg_get_functiondef(v_oid);
  v_updated := v_definition;
  v_updated := replace(v_updated,
    'v_options_snapshot jsonb;',
    'v_options_snapshot jsonb;' || E'\n' || '  v_item_instructions text;');
  v_updated := replace(v_updated,
    'v_line - ARRAY[''item_id'',''quantity'',''option_ids'']',
    'v_line - ARRAY[''item_id'',''quantity'',''option_ids'',''special_instructions'']');
  v_updated := replace(v_updated,
    'OR jsonb_typeof(v_line->''option_ids'') IS DISTINCT FROM ''array'' THEN',
    'OR jsonb_typeof(v_line->''option_ids'') IS DISTINCT FROM ''array''' || E'\n' ||
    '       OR (v_line ? ''special_instructions'' AND jsonb_typeof(v_line->''special_instructions'') IS DISTINCT FROM ''string'') THEN');
  v_updated := replace(v_updated,
    'v_quantity := (v_line->>''quantity'')::integer;',
    'v_item_instructions := btrim(coalesce(v_line->>''special_instructions'',''''));' || E'\n' ||
    '    IF char_length(v_item_instructions) > 300 THEN' || E'\n' ||
    '      RAISE EXCEPTION ''Special instructions must be 300 characters or fewer per item.'' USING ERRCODE=''22023'';' || E'\n' ||
    '    END IF;' || E'\n' ||
    '    v_quantity := (v_line->>''quantity'')::integer;');
  v_updated := replace(v_updated,
    'v_line_key := v_item_id::text || '':'' || array_to_string(v_option_ids,'','');',
    'v_line_key := v_item_id::text || '':'' || array_to_string(v_option_ids,'','') || '':'' || v_item_instructions;');
  v_updated := replace(v_updated,
    'unit_price_centavos,quantity,line_total_centavos,options_snapshot',
    'unit_price_centavos,quantity,line_total_centavos,options_snapshot,special_instructions');
  v_updated := replace(v_updated,
    'v_unit_price,v_quantity,v_line_total,v_options_snapshot',
    'v_unit_price,v_quantity,v_line_total,v_options_snapshot,v_item_instructions');

  IF v_updated = v_definition
     OR position('v_item_instructions text;' in v_updated)=0
     OR position('v_line - ARRAY[''item_id'',''quantity'',''option_ids'',''special_instructions'']' in v_updated)=0
     OR position('v_line_key := v_item_id::text || '':'' || array_to_string(v_option_ids,'','') || '':'' || v_item_instructions;' in v_updated)=0
     OR position('v_options_snapshot,v_item_instructions' in v_updated)=0 THEN
    RAISE EXCEPTION 'Order RPC source did not match the expected definition; update this migration before applying it.';
  END IF;
  v_updated := replace(v_updated,'CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');
  EXECUTE v_updated;
END;
$migration$;

-- Include the per-line note in existing staff and customer order payloads.
DO $migration$
DECLARE
  v_proc record;
  v_definition text;
  v_updated text;
BEGIN
  FOR v_proc IN
    SELECT p.oid, pg_catalog.pg_get_functiondef(p.oid) AS definition
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private') AND p.prokind='f'
      AND p.prosrc LIKE '%options_snapshot%'
  LOOP
    v_definition := v_proc.definition;
    v_updated := regexp_replace(v_definition,
      $pattern$'options'\s*,\s*([a-z_]+)\.options_snapshot$pattern$,
      $replacement$'options',\1.options_snapshot,'special_instructions',\1.special_instructions$replacement$,
      'g');
    IF v_updated <> v_definition THEN
      v_updated := replace(v_updated,'CREATE FUNCTION ','CREATE OR REPLACE FUNCTION ');
      EXECUTE v_updated;
    END IF;
  END LOOP;
END;
$migration$;

COMMIT;
