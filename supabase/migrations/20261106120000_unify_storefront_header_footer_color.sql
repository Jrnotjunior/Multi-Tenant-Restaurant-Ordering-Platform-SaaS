-- Keep the public storefront header and footer on one shared tenant color.
BEGIN;

CREATE OR REPLACE FUNCTION public.default_storefront_website_colors()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT '{
    "pageBackground":"#F7F9FC","headerColor":"#101B2F","footerBackground":"#101B2F",
    "footerFont":"#FFFFFF","heroColor":"#F7F9FC","productCard":"#FFFFFF",
    "fontColor":"#101B2F","headerIcon":"#FFFFFF","primaryButton":"#101B2F",
    "primaryButtonFont":"#FFFFFF","secondaryButton":"#263754","secondaryButtonFont":"#FFFFFF"
  }'::jsonb;
$fn$;

-- Preserve each tenant's existing footer color as the shared header/footer color.
UPDATE public.tenant_storefronts
SET website_colors = jsonb_set(
  website_colors,
  '{headerColor}',
  website_colors->'footerBackground',
  true
)
WHERE jsonb_typeof(website_colors->'footerBackground') = 'string'
  AND (website_colors->>'footerBackground') ~ '^#[0-9A-Fa-f]{6}$';

UPDATE public.platform_theme_defaults
SET website_colors = public.default_storefront_website_colors(),
    updated_at = now()
WHERE id = 1;

ALTER TABLE public.tenant_storefronts
  ALTER COLUMN website_colors SET DEFAULT public.default_storefront_website_colors();

COMMIT;
