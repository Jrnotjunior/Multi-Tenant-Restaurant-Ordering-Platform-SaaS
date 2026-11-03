-- Supabase default function ACLs include anon explicitly; keep these admin-only RPCs private to authenticated sessions.
REVOKE ALL ON FUNCTION public.system_admin_list_online_payment_entitlements() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.system_admin_set_online_payments(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_list_online_payment_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.system_admin_set_online_payments(uuid, boolean) TO authenticated;
