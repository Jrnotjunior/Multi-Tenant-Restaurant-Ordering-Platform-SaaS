-- Provider-neutral place identifier: the platform now uses Photon/OpenStreetMap data.
-- Preserve existing values if this migration is applied to a database with saved addresses.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_saved_addresses'
      and column_name = 'mapbox_place_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_saved_addresses'
      and column_name = 'geocoding_place_id'
  ) then
    alter table public.customer_saved_addresses
      rename column mapbox_place_id to geocoding_place_id;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_saved_addresses'
      and column_name = 'geocoding_place_id'
  ) then
    alter table public.customer_saved_addresses
      add column geocoding_place_id text not null default '';
  end if;
end $$;

alter table public.customer_saved_addresses
  drop constraint if exists customer_saved_addresses_mapbox_place_id_length,
  add constraint customer_saved_addresses_geocoding_place_id_length
    check (char_length(geocoding_place_id) <= 300);
