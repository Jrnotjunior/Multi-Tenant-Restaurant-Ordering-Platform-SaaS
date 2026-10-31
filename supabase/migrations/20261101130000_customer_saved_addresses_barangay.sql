alter table public.customer_saved_addresses
  add column if not exists barangay text not null default '';

alter table public.customer_saved_addresses
  add constraint customer_saved_addresses_barangay_length
  check (char_length(barangay) <= 120);
