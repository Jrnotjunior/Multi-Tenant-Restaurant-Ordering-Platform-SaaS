-- W2T-012: bring owner store settings in line with the reference restaurant platform.
-- POS and tax/receipt settings are intentionally excluded.
BEGIN;

ALTER TABLE public.tenant_storefronts
  ADD COLUMN IF NOT EXISTS restaurant_address text,
  ADD COLUMN IF NOT EXISTS store_address text,
  ADD COLUMN IF NOT EXISTS delivery_location_latitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_location_longitude double precision;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tenant_storefronts_delivery_latitude_range') THEN
    ALTER TABLE public.tenant_storefronts
      ADD CONSTRAINT tenant_storefronts_delivery_latitude_range
      CHECK (delivery_location_latitude IS NULL OR delivery_location_latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tenant_storefronts_delivery_longitude_range') THEN
    ALTER TABLE public.tenant_storefronts
      ADD CONSTRAINT tenant_storefronts_delivery_longitude_range
      CHECK (delivery_location_longitude IS NULL OR delivery_location_longitude BETWEEN -180 AND 180);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tenant_storefronts_delivery_location_pair') THEN
    ALTER TABLE public.tenant_storefronts
      ADD CONSTRAINT tenant_storefronts_delivery_location_pair
      CHECK ((delivery_location_latitude IS NULL) = (delivery_location_longitude IS NULL));
  END IF;
END
$constraints$;

ALTER TABLE public.tenant_storefronts
  ALTER COLUMN primary_color SET DEFAULT '#101B2F',
  ALTER COLUMN website_colors SET DEFAULT '{
    "pageBackground":"#F7F9FC","headerColor":"#FFFFFF","footerBackground":"#101B2F",
    "footerFont":"#FFFFFF","heroColor":"#263754","productCard":"#FFFFFF",
    "fontColor":"#101B2F","headerIcon":"#101B2F","primaryButton":"#101B2F",
    "primaryButtonFont":"#FFFFFF","secondaryButton":"#263754","secondaryButtonFont":"#FFFFFF"
  }'::jsonb,
  ALTER COLUMN opening_hours SET DEFAULT '{
    "timezone":"Asia/Manila",
    "schedule":{
      "monday":{"isOpen":true,"open":"09:00","close":"21:00"},
      "tuesday":{"isOpen":true,"open":"09:00","close":"21:00"},
      "wednesday":{"isOpen":true,"open":"09:00","close":"21:00"},
      "thursday":{"isOpen":true,"open":"09:00","close":"21:00"},
      "friday":{"isOpen":true,"open":"09:00","close":"21:00"},
      "saturday":{"isOpen":true,"open":"09:00","close":"21:00"},
      "sunday":{"isOpen":true,"open":"09:00","close":"21:00"}
    },
    "exceptions":[]
  }'::jsonb,
  ALTER COLUMN delivery_pricing SET DEFAULT '{
    "enabled":false,"base_fee":0,"currency":"PHP","distance_increment_meters":500,
    "fee_per_increment":10,"max_distance_meters":10000,"zones":[]
  }'::jsonb,
  ALTER COLUMN cash_payment_options SET DEFAULT '{
    "cash_on_delivery_enabled":true,"cash_on_pickup_enabled":true,
    "cash_on_take_out_enabled":true,"notes":""
  }'::jsonb,
  ALTER COLUMN online_payments SET DEFAULT '{
    "enabled":false,
    "methods":{"card":false,"gcash":true,"qrph":true,"grab_pay":true,"paymaya":true,"dob":true,"billease":false},
    "provider_configured":false
  }'::jsonb;

-- Fill missing operational fields without overwriting restaurant-specific values.
UPDATE public.tenant_storefronts
SET opening_hours = jsonb_set(
  opening_hours,
  '{schedule}',
  '{
    "monday":{"isOpen":true,"open":"09:00","close":"21:00"},
    "tuesday":{"isOpen":true,"open":"09:00","close":"21:00"},
    "wednesday":{"isOpen":true,"open":"09:00","close":"21:00"},
    "thursday":{"isOpen":true,"open":"09:00","close":"21:00"},
    "friday":{"isOpen":true,"open":"09:00","close":"21:00"},
    "saturday":{"isOpen":true,"open":"09:00","close":"21:00"},
    "sunday":{"isOpen":true,"open":"09:00","close":"21:00"}
  }'::jsonb,
  true
)
WHERE jsonb_typeof(opening_hours->'schedule')='object'
  AND opening_hours->'schedule'='{}'::jsonb;

UPDATE public.tenant_storefronts
SET delivery_pricing = '{
  "base_fee":0,"currency":"PHP","distance_increment_meters":500,
  "fee_per_increment":10,"max_distance_meters":10000,"zones":[],"enabled":false
}'::jsonb || COALESCE(delivery_pricing,'{}'::jsonb);

UPDATE public.tenant_storefronts
SET cash_payment_options = '{
  "cash_on_delivery_enabled":true,"cash_on_pickup_enabled":true,
  "cash_on_take_out_enabled":true,"notes":""
}'::jsonb || COALESCE(cash_payment_options,'{}'::jsonb);

UPDATE public.tenant_storefronts
SET online_payments = '{
  "enabled":false,
  "methods":{"card":false,"gcash":true,"qrph":true,"grab_pay":true,"paymaya":true,"dob":true,"billease":false},
  "provider_configured":false
}'::jsonb || CASE
  WHEN jsonb_typeof(online_payments->'methods')='object' THEN COALESCE(online_payments,'{}'::jsonb)
  ELSE COALESCE(online_payments,'{}'::jsonb) || jsonb_build_object('methods',
    '{"card":false,"gcash":true,"qrph":true,"grab_pay":true,"paymaya":true,"dob":true,"billease":false}'::jsonb)
END;

-- Upgrade only the known old default theme; preserve any tenant-customized theme.
UPDATE public.tenant_storefronts
SET website_colors = '{
  "pageBackground":"#F7F9FC","headerColor":"#FFFFFF","footerBackground":"#101B2F",
  "footerFont":"#FFFFFF","heroColor":"#263754","productCard":"#FFFFFF",
  "fontColor":"#101B2F","headerIcon":"#101B2F","primaryButton":"#101B2F",
  "primaryButtonFont":"#FFFFFF","secondaryButton":"#263754","secondaryButtonFont":"#FFFFFF"
}'::jsonb
WHERE website_colors = '{
  "pageBackground":"#F7F3F0","headerColor":"#000000","footerBackground":"#000000",
  "footerFont":"#E5D3C0","heroColor":"#E5D3C0","productCard":"#E5D3C0",
  "fontColor":"#000000","headerIcon":"#E5D3C0","primaryButton":"#000000",
  "primaryButtonFont":"#DD4040","secondaryButton":"#000000","secondaryButtonFont":"#DD4040"
}'::jsonb;

COMMIT;
