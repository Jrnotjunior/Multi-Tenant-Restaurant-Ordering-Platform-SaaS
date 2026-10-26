create table if not exists public.customer_saved_addresses (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 label text not null default 'Home' check(char_length(btrim(label)) between 1 and 60),
 recipient_name text not null check(char_length(btrim(recipient_name)) between 1 and 160),
 phone text not null check(char_length(btrim(phone)) between 5 and 40),
 address_line text not null check(char_length(btrim(address_line)) between 5 and 500),
 unit_or_landmark text not null default '' check(char_length(unit_or_landmark)<=300),
 city text not null check(char_length(btrim(city)) between 2 and 120),
 province text not null default '' check(char_length(province)<=120),
 postal_code text not null default '' check(char_length(postal_code)<=20),
 is_default boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists customer_saved_addresses_user_updated_idx on public.customer_saved_addresses(user_id,updated_at desc);
create unique index if not exists customer_saved_addresses_one_default_idx on public.customer_saved_addresses(user_id) where is_default;
alter table public.customer_saved_addresses enable row level security;
create policy "Customers can view their saved addresses" on public.customer_saved_addresses for select to authenticated using((select auth.uid())=user_id);
create policy "Customers can add their saved addresses" on public.customer_saved_addresses for insert to authenticated with check((select auth.uid())=user_id);
create policy "Customers can update their saved addresses" on public.customer_saved_addresses for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create policy "Customers can delete their saved addresses" on public.customer_saved_addresses for delete to authenticated using((select auth.uid())=user_id);
create table if not exists public.customer_loyalty_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 points_balance integer not null default 0 check(points_balance>=0),
 lifetime_points_earned integer not null default 0 check(lifetime_points_earned>=0),
 lifetime_points_redeemed integer not null default 0 check(lifetime_points_redeemed>=0),
 updated_at timestamptz not null default now()
);
alter table public.customer_loyalty_accounts enable row level security;
create policy "Customers can view their loyalty account" on public.customer_loyalty_accounts for select to authenticated using((select auth.uid())=user_id);
create table if not exists public.customer_loyalty_transactions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 points_change integer not null check(points_change<>0),
 transaction_type text not null check(transaction_type in ('earned','redeemed','adjustment','expired')),
 description text not null default '' check(char_length(description)<=300),
 order_id uuid references public.customer_orders(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists customer_loyalty_transactions_user_created_idx on public.customer_loyalty_transactions(user_id,created_at desc);
alter table public.customer_loyalty_transactions enable row level security;
create policy "Customers can view their loyalty transactions" on public.customer_loyalty_transactions for select to authenticated using((select auth.uid())=user_id);
grant select,insert,update,delete on public.customer_saved_addresses to authenticated;
grant select on public.customer_loyalty_accounts to authenticated;
grant select on public.customer_loyalty_transactions to authenticated;