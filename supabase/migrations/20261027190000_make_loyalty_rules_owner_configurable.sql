-- Loyalty earning and redemption rates are restaurant-owned business rules.
-- Keep the program inactive until an owner explicitly configures and enables each rule.
alter table public.tenant_loyalty_settings
  alter column amount_threshold set default 0,
  alter column points_awarded set default 0,
  alter column redemption_enabled set default false,
  alter column redemption_points set default 0,
  alter column redemption_amount set default 0;

alter table public.tenant_loyalty_settings
  drop constraint if exists tenant_loyalty_settings_amount_threshold_check,
  drop constraint if exists tenant_loyalty_settings_points_awarded_check,
  drop constraint if exists tenant_loyalty_settings_redemption_points_check,
  drop constraint if exists tenant_loyalty_settings_redemption_amount_check;

alter table public.tenant_loyalty_settings
  add constraint tenant_loyalty_settings_amount_threshold_check
    check (amount_threshold >= 0 and (not enabled or amount_threshold > 0)),
  add constraint tenant_loyalty_settings_points_awarded_check
    check (points_awarded >= 0 and (not enabled or points_awarded > 0)),
  add constraint tenant_loyalty_settings_redemption_points_check
    check (redemption_points >= 0 and (not redemption_enabled or redemption_points > 0)),
  add constraint tenant_loyalty_settings_redemption_amount_check
    check (redemption_amount >= 0 and (not redemption_enabled or redemption_amount > 0));
