-- Branch-specific contact number for customer-arranged pickup coordination.
-- Public tracking exposes it only for orders whose actual type is Pickup.
BEGIN;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS contact_phone text;

ALTER TABLE public.branches
  ADD CONSTRAINT branches_contact_phone_format
  CHECK (
    contact_phone IS NULL
    OR contact_phone ~ '^((09[0-9]{9})|(\\+639[0-9]{9}))$'
  );

CREATE OR REPLACE FUNCTION private.update_owner_branch_contact_phone(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_contact_phone text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_phone text := nullif(regexp_replace(btrim(coalesce(p_contact_phone,'')), '[[:space:]()-]', '', 'g'), '');
BEGIN
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NULL OR (
    v_phone IS NOT NULL AND v_phone !~ '^(09[0-9]{9}|\\+639[0-9]{9})$'
  ) THEN
    RAISE EXCEPTION 'Enter a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX).' USING ERRCODE='22023';
  END IF;
  UPDATE public.branches
  SET contact_phone = v_phone
  WHERE tenant_id=p_tenant_id AND id=p_branch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch not found in your restaurant' USING ERRCODE='42501';
  END IF;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_owner_branch_contact_phone(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_contact_phone text
) RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.update_owner_branch_contact_phone(p_tenant_id,p_branch_id,p_contact_phone);
$function$;

REVOKE ALL ON FUNCTION private.update_owner_branch_contact_phone(uuid,uuid,text),
  public.update_owner_branch_contact_phone(uuid,uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.update_owner_branch_contact_phone(uuid,uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_owner_branch_contact_phone(uuid,uuid,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_order_branch_location(p_tracking_token uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'branchName', b.name,
    'branchAddress', b.pickup_address,
    'branchPhone', CASE WHEN lower(replace(o.order_type, '-', '_')) = 'pickup'
      THEN b.contact_phone ELSE NULL END
  )
  FROM public.customer_orders o
  JOIN public.branches b ON b.tenant_id=o.tenant_id AND b.id=o.branch_id
  WHERE o.idempotency_key=p_tracking_token
    AND p_tracking_token IS NOT NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_order_branch_location(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_order_branch_location(uuid)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
