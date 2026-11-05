BEGIN;

CREATE OR REPLACE FUNCTION private.get_branch_payment_options(
  p_slug text,
  p_branch_slug text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_options jsonb;
BEGIN
  IF p_slug IS NULL OR length(p_slug) NOT BETWEEN 3 AND 64
     OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR p_branch_slug IS NULL OR length(p_branch_slug) NOT BETWEEN 2 AND 64
     OR p_branch_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'branchSlug', b.slug,
    'onlinePaymentsAvailable', private.tenant_online_payments_available(t.id),
    'cashPaymentOptions', COALESCE(s.cash_payment_options, '{}'::jsonb)
  )
  INTO v_options
  FROM public.tenants t
  JOIN public.tenant_storefronts s ON s.tenant_id = t.id
  JOIN public.branches b ON b.tenant_id = t.id AND b.is_active = true
  WHERE t.slug = p_slug
    AND t.status = 'active'
    AND s.status = 'published'
    AND b.slug = p_branch_slug;

  RETURN v_options;
END;
$function$;

REVOKE ALL ON FUNCTION private.get_branch_payment_options(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_branch_payment_options(text, text)
  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_branch_payment_options(
  p_slug text,
  p_branch_slug text
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
  SELECT private.get_branch_payment_options(p_slug, p_branch_slug);
$function$;

REVOKE ALL ON FUNCTION public.get_branch_payment_options(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_payment_options(text, text)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
