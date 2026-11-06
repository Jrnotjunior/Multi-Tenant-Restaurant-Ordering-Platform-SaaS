-- Preserve Web2Table test tenant's previously issued order references.
-- Shift current values temporarily to avoid collisions while restoring gaps.
UPDATE public.customer_orders o
SET order_number = o.order_number + 1000000
FROM public.tenants t
WHERE t.id = o.tenant_id AND t.slug = 'ebable';

WITH ranked AS (
  SELECT o.id,
         row_number() OVER (ORDER BY o.created_at ASC, o.id ASC)::bigint AS position
  FROM public.customer_orders o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE t.slug = 'ebable'
)
UPDATE public.customer_orders o
SET order_number = CASE WHEN ranked.position <= 6 THEN ranked.position ELSE ranked.position + 3 END
FROM ranked
WHERE o.id = ranked.id;

UPDATE private.tenant_order_number_counters c
SET last_order_number = 22, updated_at = now()
FROM public.tenants t
WHERE t.id = c.tenant_id AND t.slug = 'ebable';
