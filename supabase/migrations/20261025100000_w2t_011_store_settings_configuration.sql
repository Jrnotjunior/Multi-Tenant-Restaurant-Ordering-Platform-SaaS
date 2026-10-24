alter table public.tenant_storefronts
  add column if not exists opening_hours jsonb not null default
    '{"timezone":"Asia/Manila","schedule":{},"exceptions":[]}'::jsonb,
  add column if not exists delivery_pricing jsonb not null default
    '{"enabled":false,"base_fee":0,"currency":"PHP","zones":[]}'::jsonb,
  add column if not exists cash_payment_options jsonb not null default
    '{"cash_on_delivery_enabled":true,"notes":""}'::jsonb,
  add column if not exists rider_assignment jsonb not null default
    '{"mode":"manual","auto_assign":false,"instructions":""}'::jsonb,
  add column if not exists online_payments jsonb not null default
    '{"enabled":false,"methods":[],"provider_configured":false}'::jsonb;

alter table public.tenant_storefronts
  add constraint tenant_storefronts_opening_hours_object
    check (jsonb_typeof(opening_hours) = 'object'),
  add constraint tenant_storefronts_delivery_pricing_object
    check (jsonb_typeof(delivery_pricing) = 'object'),
  add constraint tenant_storefronts_cash_payment_options_object
    check (jsonb_typeof(cash_payment_options) = 'object'),
  add constraint tenant_storefronts_rider_assignment_object
    check (jsonb_typeof(rider_assignment) = 'object'),
  add constraint tenant_storefronts_online_payments_object
    check (jsonb_typeof(online_payments) = 'object');
