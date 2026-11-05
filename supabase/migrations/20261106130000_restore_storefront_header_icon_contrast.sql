-- Ensure storefront header controls remain visible on the shared dark header/footer color.
BEGIN;

UPDATE public.platform_theme_defaults
SET website_colors = jsonb_set(website_colors, '{headerIcon}', '"#FFFFFF"'::jsonb, true),
    updated_at = now()
WHERE id = 1;

UPDATE public.tenant_storefronts
SET website_colors = jsonb_set(website_colors, '{headerIcon}', '"#FFFFFF"'::jsonb, true),
    updated_at = now()
WHERE website_colors->>'headerColor' = website_colors->>'footerBackground'
  AND website_colors->>'headerIcon' = website_colors->>'headerColor';

COMMIT;
