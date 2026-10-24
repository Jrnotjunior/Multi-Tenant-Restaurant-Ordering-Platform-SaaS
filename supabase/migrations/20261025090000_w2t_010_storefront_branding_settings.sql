-- W2T-010: Tenant-scoped storefront identity, social links and theme colors.
BEGIN;
ALTER TABLE public.tenant_storefronts
  ADD COLUMN IF NOT EXISTS favicon_path text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{"facebook":"","instagram":"","tiktok":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS website_colors jsonb NOT NULL DEFAULT '{
    "pageBackground":"#F7F3F0","headerColor":"#000000","footerBackground":"#000000",
    "footerFont":"#E5D3C0","heroColor":"#E5D3C0","productCard":"#E5D3C0",
    "fontColor":"#000000","headerIcon":"#E5D3C0","primaryButton":"#000000",
    "primaryButtonFont":"#DD4040","secondaryButton":"#000000","secondaryButtonFont":"#DD4040"
  }'::jsonb;
ALTER TABLE public.tenant_storefronts
  ADD CONSTRAINT tenant_storefronts_social_links_object CHECK (jsonb_typeof(social_links) = 'object'),
  ADD CONSTRAINT tenant_storefronts_website_colors_object CHECK (jsonb_typeof(website_colors) = 'object');
COMMIT;
