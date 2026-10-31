-- Saved addresses store delivery-location data only.
-- Customer name and phone belong to the customer account, not each address.
-- Explicitly remove the redundant address fields and their stored values.
alter table public.customer_saved_addresses
  drop column if exists recipient_name,
  drop column if exists phone,
  drop column if exists unit_or_landmark,
  drop column if exists province,
  drop column if exists postal_code;
