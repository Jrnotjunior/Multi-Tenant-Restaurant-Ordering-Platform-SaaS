-- W2T-016: the platform theme palette lives in the database, not in storefront code.
BEGIN;

CREATE OR REPLACE FUNCTION public.default_storefront_website_colors()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $fn$
  SELECT '{
    "pageBackground":"#F7F9FC","headerColor":"#FFFFFF","footerBackground":"#101B2F",
    "footerFont":"#FFFFFF","heroColor":"#F7F9FC","productCard":"#FFFFFF",
    "fontColor":"#101B2F","headerIcon":"#101B2F","primaryButton":"#101B2F",
    "primaryButtonFont":"#FFFFFF","secondaryButton":"#263754","secondaryButtonFont":"#FFFFFF"
  }'::jsonb;
$fn$;

CREATE TABLE IF NOT EXISTS public.platform_theme_defaults (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  website_colors jsonb NOT NULL DEFAULT public.default_storefront_website_colors()
    CHECK (jsonb_typeof(website_colors) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_theme_defaults(id,website_colors)
VALUES (1,public.default_storefront_website_colors())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_theme_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_theme_defaults_public_read ON public.platform_theme_defaults;
CREATE POLICY platform_theme_defaults_public_read
  ON public.platform_theme_defaults FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.platform_theme_defaults FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.platform_theme_defaults FROM anon, authenticated;
GRANT SELECT ON public.platform_theme_defaults TO anon, authenticated;
GRANT ALL ON public.platform_theme_defaults TO service_role;

ALTER TABLE public.tenant_storefronts
  ALTER COLUMN website_colors SET DEFAULT public.default_storefront_website_colors();

COMMIT;
