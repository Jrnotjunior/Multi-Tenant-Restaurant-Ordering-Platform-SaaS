begin;
create table if not exists public.mfa_admin_reset_audit (
 id uuid primary key default gen_random_uuid(),
 actor_user_id uuid not null,
 target_user_id uuid not null,
 target_email text not null,
 target_role text not null,
 deleted_factor_count integer not null default 0 check (deleted_factor_count >= 0),
 created_at timestamptz not null default now()
);
alter table public.mfa_admin_reset_audit enable row level security;
revoke all on public.mfa_admin_reset_audit from public, anon, authenticated;
comment on table public.mfa_admin_reset_audit is 'Audit trail for system-admin initiated TOTP resets; writes are performed by the service-role Edge Function.';
commit;