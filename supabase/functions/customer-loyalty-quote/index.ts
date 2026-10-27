import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
function serviceKey() {
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return values.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  } catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""; }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = serviceKey();
    if (!url || !key) return json({ error: "Loyalty service is not configured." }, 500);
    const authorization = request.headers.get("Authorization") ?? "";
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
    if (!bearer) return json({ error: "Sign in to view your restaurant rewards." }, 401);

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !authData.user) return json({ error: "Your session is invalid. Please sign in again." }, 401);

    const body = await request.json().catch(() => ({}));
    const slug = String(body.restaurantSlug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 64) {
      return json({ error: "Choose a valid restaurant." }, 400);
    }
    const { data: tenant, error: tenantError } = await admin.from("tenants")
      .select("id,status").eq("slug", slug).maybeSingle();
    if (tenantError) throw tenantError;
    if (!tenant || tenant.status !== "active") return json({ success: true, enabled: false, pointsBalance: 0 });

    const { data: storefront, error: storefrontError } = await admin.from("tenant_storefronts")
      .select("status").eq("tenant_id", tenant.id).maybeSingle();
    if (storefrontError) throw storefrontError;
    if (!storefront || storefront.status !== "published") return json({ success: true, enabled: false, pointsBalance: 0 });

    const [{ data: settings, error: settingsError }, { data: account, error: accountError }] = await Promise.all([
      admin.from("tenant_loyalty_settings")
        .select("enabled,redemption_enabled,redemption_points,redemption_amount")
        .eq("tenant_id", tenant.id).maybeSingle(),
      admin.from("tenant_customer_loyalty_accounts")
        .select("points_balance")
        .eq("tenant_id", tenant.id).eq("customer_user_id", authData.user.id).maybeSingle(),
    ]);
    if (settingsError) throw settingsError;
    if (accountError) throw accountError;
    if (!settings || !settings.redemption_enabled ||
        !Number(settings.redemption_points) || !Number(settings.redemption_amount)) {
      return json({ success: true, enabled: false, pointsBalance: Number(account?.points_balance ?? 0) });
    }
    return json({
      success: true,
      enabled: true,
      pointsBalance: Math.max(0, Number(account?.points_balance ?? 0)),
      rewardPoints: Number(settings.redemption_points),
      rewardAmountCentavos: Math.round(Number(settings.redemption_amount) * 100),
    });
  } catch (error) {
    console.error("customer-loyalty-quote failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Unable to load restaurant rewards right now." }, 500);
  }
});
