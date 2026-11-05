-- Standardize branch contact numbers to the preferred Philippine local format.
BEGIN;

UPDATE public.branches
SET contact_phone = '0' || substring(regexp_replace(contact_phone, '[[:space:]()-]', '', 'g') FROM 4)
WHERE contact_phone ~ '^\\+639[0-9]{9}$';

ALTER TABLE public.branches DROP CONSTRAINT IF EXISTS branches_contact_phone_format;
ALTER TABLE public.branches ADD CONSTRAINT branches_contact_phone_format
  CHECK (contact_phone IS NULL OR contact_phone ~ '^09[0-9]{9}$');

CREATE OR REPLACE FUNCTION private.update_owner_branch_contact_phone(
  p_tenant_id uuid, p_branch_id uuid, p_contact_phone text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_phone text := nullif(regexp_replace(btrim(coalesce(p_contact_phone,'')), '[[:space:]()-]', '', 'g'), '');
BEGIN
  IF NOT private.is_active_owner(p_tenant_id) THEN
    RAISE EXCEPTION 'MFA-verified restaurant owner required' USING ERRCODE='42501';
  END IF;
  IF p_branch_id IS NULL OR (v_phone IS NOT NULL AND v_phone !~ '^09[0-9]{9}$') THEN
    RAISE EXCEPTION 'Enter an 11-digit Philippine mobile number starting with 09 (09XXXXXXXXX).' USING ERRCODE='22023';
  END IF;
  UPDATE public.branches SET contact_phone=v_phone
  WHERE tenant_id=p_tenant_id AND id=p_branch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Branch not found in your restaurant' USING ERRCODE='42501'; END IF;
  RETURN true;
END;
$function$;

COMMIT;
