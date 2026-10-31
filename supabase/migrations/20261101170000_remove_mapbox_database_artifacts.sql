-- Remove vendor-specific Mapbox telemetry and make saved-address IDs provider-neutral.
-- Saved-address identifiers are preserved when renaming the legacy column.
drop function if exists public.system_admin_get_mapbox_usage(timestamptz, timestamptz);
drop function if exists public.system_admin_get_mapbox_usage_by_restaurant(timestamptz, timestamptz);
drop function if exists public.system_admin_get_mapbox_usage_daily(timestamptz, timestamptz);

drop table if exists public.mapbox_usage_events;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_saved_addresses'
      and column_name = 'mapbox_place_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_saved_addresses'
      and column_name = 'geocoding_place_id'
  ) then
    alter table public.customer_saved_addresses
      rename column mapbox_place_id to geocoding_place_id;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'customer_saved_addresses'
      and column_name = 'geocoding_place_id'
  ) then
    alter table public.customer_saved_addresses
      add column geocoding_place_id text not null default '';
  end if;
end $$;

alter table public.customer_saved_addresses
  drop constraint if exists customer_saved_addresses_mapbox_place_id_length,
  drop constraint if exists customer_saved_addresses_geocoding_place_id_length,
  add constraint customer_saved_addresses_geocoding_place_id_length
    check (char_length(geocoding_place_id) <= 300);
