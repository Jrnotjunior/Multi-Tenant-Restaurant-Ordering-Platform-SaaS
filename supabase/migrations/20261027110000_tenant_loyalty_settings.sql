create table if not exists public.tenant_loyalty_settings (
 tenant_id uuid primary key references public.tenants(id) on delete cascade,
 enabled boolean not null default false,
 amount_threshold numeric(12,2) not null default 500 check(amount_threshold > 0),
 points_awarded integer not null default 5 check(points_awarded > 0),
 redemption_enabled boolean not null default true,
 redemption_points integer not null default 50 check(redemption_points > 0),
 redemption_amount numeric(12,2) not null default 50 check(redemption_amount > 0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
alter table public.tenant_loyalty_settings enable row level security;
create policy "Active tenant members can read loyalty settings"
 on public.tenant_loyalty_settings for select to authenticated
 using (exists(select 1 from public.tenant_memberships m where m.tenant_id=tenant_loyalty_settings.tenant_id and m.user_id=(select auth.uid()) and m.status='active'));
create policy "Tenant owners can insert loyalty settings"
 on public.tenant_loyalty_settings for insert to authenticated
 with check (exists(select 1 from public.tenant_memberships m where m.tenant_id=tenant_loyalty_settings.tenant_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='restaurant_owner'));
create policy "Tenant owners can update loyalty settings"
 on public.tenant_loyalty_settings for update to authenticated
 using (exists(select 1 from public.tenant_memberships m where m.tenant_id=tenant_loyalty_settings.tenant_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='restaurant_owner'))
 with check (exists(select 1 from public.tenant_memberships m where m.tenant_id=tenant_loyalty_settings.tenant_id and m.user_id=(select auth.uid()) and m.status='active' and m.role='restaurant_owner'));
grant select,insert,update on public.tenant_loyalty_settings to authenticated;