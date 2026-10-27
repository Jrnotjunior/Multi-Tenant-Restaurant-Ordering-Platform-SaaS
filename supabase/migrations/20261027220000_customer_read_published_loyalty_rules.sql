-- Earning/redemption settings are storefront reward terms, not private owner data.
-- Let signed-in customers read only rules for restaurants with a published storefront.
BEGIN;
DROP POLICY IF EXISTS "Customers can read published storefront loyalty rules"
  ON public.tenant_loyalty_settings;
CREATE POLICY "Customers can read published storefront loyalty rules"
  ON public.tenant_loyalty_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tenants t
      JOIN public.tenant_storefronts s ON s.tenant_id = t.id
      WHERE t.id = tenant_loyalty_settings.tenant_id
        AND t.status = 'active'
        AND s.status = 'published'
    )
  );
COMMIT;
