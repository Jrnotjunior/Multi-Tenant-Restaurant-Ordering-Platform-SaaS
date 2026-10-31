alter table public.customer_saved_addresses
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists mapbox_place_id text not null default '';

alter table public.customer_saved_addresses
  drop constraint if exists customer_saved_addresses_latitude_range,
  drop constraint if exists customer_saved_addresses_longitude_range;

alter table public.customer_saved_addresses
  add constraint customer_saved_addresses_latitude_range
    check (latitude is null or latitude between -90 and 90),
  add constraint customer_saved_addresses_longitude_range
    check (longitude is null or longitude between -180 and 180),
  add constraint customer_saved_addresses_coordinates_pair
    check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null)),
  add constraint customer_saved_addresses_mapbox_place_id_length
    check (char_length(mapbox_place_id) <= 300);
