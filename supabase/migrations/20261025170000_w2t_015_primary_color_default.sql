-- W2T-015: promote known legacy default primary brand color to the system default.
-- Custom restaurant colors are preserved.
-- W2T-015: promote known legacy default primary brand color to the system default.
-- Custom restaurant colors are preserved.
ALTER TABLE public.tenant_storefronts
  ALTER COLUMN primary_color SET DEFAULT '#101B2F';
UPDATE public.tenant_storefronts
SET primary_color='#101B2F', updated_at=now()
WHERE lower(primary_color)='#ad2935';
