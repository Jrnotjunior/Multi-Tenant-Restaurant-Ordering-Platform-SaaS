-- Keep the default hero surface light so the default navy text remains readable.
BEGIN;
ALTER TABLE public.tenant_storefronts
  ALTER COLUMN website_colors SET DEFAULT '{
    "pageBackground":"#F7F9FC","headerColor":"#FFFFFF","footerBackground":"#101B2F",
    "footerFont":"#FFFFFF","heroColor":"#F7F9FC","productCard":"#FFFFFF",
    "fontColor":"#101B2F","headerIcon":"#101B2F","primaryButton":"#101B2F",
    "primaryButtonFont":"#FFFFFF","secondaryButton":"#263754","secondaryButtonFont":"#FFFFFF"
  }'::jsonb;
UPDATE public.tenant_storefronts
SET website_colors = jsonb_set(website_colors, '{heroColor}', '"#F7F9FC"'::jsonb, true)
WHERE website_colors = '{
  "pageBackground":"#F7F9FC","headerColor":"#FFFFFF","footerBackground":"#101B2F",
  "footerFont":"#FFFFFF","heroColor":"#263754","productCard":"#FFFFFF",
  "fontColor":"#101B2F","headerIcon":"#101B2F","primaryButton":"#101B2F",
  "primaryButtonFont":"#FFFFFF","secondaryButton":"#263754","secondaryButtonFont":"#FFFFFF"
}'::jsonb;
COMMIT;