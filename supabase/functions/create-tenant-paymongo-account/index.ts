import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
function serviceKey() {
  const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
  return values.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}
function paymongoKey() {
  return Deno.env.get("PAYMONGO_LIVE_SECRET_KEY")
    ?? ((Deno.env.get("PAYMONGO_SECRET_KEY") ?? "").startsWith("sk_live_") ? Deno.env.get("PAYMONGO_SECRET_KEY") ?? "" : "");
}
function basic(key: string) { return "Basic " + btoa(key + ":"); }
async function ownerContext(request: Request) {
  const jwt = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL") ?? "", key = serviceKey();
  if (!jwt || !url || !key) throw new ResponseError("Authentication is required.", 401);
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const auth = createClient(url, key, { global: { headers: { Authorization: "Bearer " + jwt } }, auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new ResponseError("Authentication is required.", 401);
  return { admin, user: data.user, url };
}
class ResponseError extends Error { status: number; constructor(message: string, status=400) { super(message); this.status=status; } }
async function assertTenantOwner(admin: any, userId: string, tenantId: string) {
  const { data, error } = await admin.from("tenant_memberships").select("id")
    .eq("tenant_id", tenantId).eq("user_id", userId).eq("role", "restaurant_owner").eq("status", "active").maybeSingle();
  if (error) throw error;
  if (!data) throw new ResponseError("You do not have access to this restaurant.", 403);
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { admin, user, url } = await ownerContext(request);
    const key = paymongoKey();
    if (!key) return json({ error: "PayMongo live mode is not configured yet." }, 409);
    const body = await request.json().catch(() => ({}));
    const tenantId = String(body.tenantId ?? "").trim();
    if (!tenantId) return json({ error: "Restaurant is required." }, 400);
    await assertTenantOwner(admin, user.id, tenantId);
    const { data: existing, error: loadError } = await admin.from("tenant_paymongo_accounts")
      .select("paymongo_account_id,connection_status,activation_status,verification_url,identity_verification_status,onboarding_step,last_error")
      .eq("tenant_id", tenantId).eq("environment", "live").maybeSingle();
    if (loadError) throw loadError;
    if (existing?.connection_status === "active" && existing.paymongo_account_id) {
      return json({ status: "active", paymongoAccountId: existing.paymongo_account_id, activationStatus: existing.activation_status, onboardingStep: "active" });
    }

    let accountId = String(existing?.paymongo_account_id ?? "").trim();
    let verificationUrl = String(existing?.verification_url ?? "").trim();
    if (!accountId) {
      const response = await fetch("https://api.paymongo.com/v2/accounts", {
        method: "POST",
        headers: { Authorization: basic(key), "Content-Type": "application/json", "Idempotency-Key": "web2table-tenant-child-account-" + tenantId + "-live" },
        body: JSON.stringify({ type: "merchant" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return json({ error: typeof payload?.errors?.[0]?.detail === "string" ? payload.errors[0].detail : "PayMongo account creation failed." }, 502);
      accountId = String(payload?.data?.id ?? "").trim();
      if (!accountId) return json({ error: "PayMongo did not return a child account ID." }, 502);
      const { error } = await admin.from("tenant_paymongo_accounts").upsert({
        tenant_id: tenantId, environment: "live", paymongo_account_id: accountId, connection_status: "pending",
        onboarding_method: "create_account", onboarding_step: "identity_verification",
        activation_status: String(payload?.data?.attributes?.activation_status ?? "pending"),
        invitation_id: null, invitation_email: null, verification_url: null,
        identity_verification_status: String(payload?.data?.attributes?.person?.identity_verification_status ?? "pending"), last_error: null,
      }, { onConflict: "tenant_id,environment" });
      if (error) throw error;
    }
    if (!verificationUrl) {
      const response = await fetch("https://api.paymongo.com/v2/accounts/" + encodeURIComponent(accountId) + "/identity_verification", {
        method: "POST",
        headers: { Authorization: basic(key), Accept: "application/json", "Content-Type": "application/json", "Idempotency-Key": "web2table-tenant-verification-" + tenantId + "-live" },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload?.errors?.[0]?.detail === "string" ? payload.errors[0].detail : "PayMongo identity verification could not be created.";
        await admin.from("tenant_paymongo_accounts").update({ last_error: message, onboarding_step: "identity_verification" }).eq("tenant_id", tenantId).eq("environment", "live");
        return json({ error: message, paymongoAccountId: accountId }, 502);
      }
      verificationUrl = String(payload?.data?.attributes?.url ?? payload?.data?.attributes?.verification_url ?? payload?.data?.attributes?.hosted_url ?? "").trim();
      if (!verificationUrl) return json({ error: "PayMongo did not return a verification URL.", paymongoAccountId: accountId }, 502);
      const { error } = await admin.from("tenant_paymongo_accounts").update({ verification_url: verificationUrl, onboarding_step: "identity_verification", last_error: null })
        .eq("tenant_id", tenantId).eq("environment", "live");
      if (error) throw error;
    }
    return json({ status: "pending", paymongoAccountId: accountId, activationStatus: existing?.activation_status ?? "pending",
      identityVerificationStatus: existing?.identity_verification_status ?? "pending", onboardingStep: "identity_verification", verificationUrl });
  } catch (e) {
    if (e instanceof ResponseError) return json({ error: e.message }, e.status);
    console.error("create-tenant-paymongo-account", e);
    return json({ error: "Unable to start PayMongo merchant onboarding." }, 500);
  }
});