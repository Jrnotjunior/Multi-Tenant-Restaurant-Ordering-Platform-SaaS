-- Publish only the cash payment flags needed by the public checkout.
-- Branch resolution mirrors the public storefront's active branch boundary.
CREATE OR REPLACE FUNCTION public.get_public_cash_payment_options(
  p_slug text,
  p_branch_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'cashOnDeliveryEnabled', coalesce((s.cash_payment_options->>'cash_on_delivery_enabled')::boolean, true),
    'cashOnPickupEnabled', coalesce((s.cash_payment_options->>'cash_on_pickup_enabled')::boolean, true),
    'cashOnTakeOutEnabled', coalesce((s.cash_payment_options->>'cash_on_take_out_enabled')::boolean, true)
  )
  FROM public.tenants t
  JOIN public.tenant_storefronts s ON s.tenant_id = t.id
  JOIN public.branches b ON b.tenant_id = t.id
    AND b.is_active = true
    AND (
      (p_branch_slug IS NOT NULL AND b.slug = p_branch_slug)
      OR (p_branch_slug IS NULL AND b.id = s.default_branch_id)
    )
  WHERE t.slug = p_slug
    AND t.status = 'active'
    AND s.status = 'published'
    AND p_slug IS NOT NULL
    AND p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND (p_branch_slug IS NULL OR p_branch_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.get_public_cash_payment_options(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_cash_payment_options(text,text) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
