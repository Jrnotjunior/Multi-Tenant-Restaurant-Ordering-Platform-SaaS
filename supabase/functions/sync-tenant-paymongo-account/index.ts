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
    const { data: connection, error: connectionError } = await admin.from("tenant_paymongo_accounts")
      .select("paymongo_account_id,connection_status,activation_status,verification_url,identity_verification_status,onboarding_step,last_error,webhook_id,webhook_secret_id")
      .eq("tenant_id", tenantId).eq("environment", "live").maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection?.paymongo_account_id) return json({ error: "PayMongo onboarding has not been started." }, 409);
    const response = await fetch("https://api.paymongo.com/v2/accounts/" + encodeURIComponent(connection.paymongo_account_id), {
      headers: { Authorization: basic(key), Accept: "application/json" },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return json({ error: typeof payload?.errors?.[0]?.detail === "string" ? payload.errors[0].detail : "Unable to read the PayMongo merchant account." }, 502);
    const attrs = payload?.data?.attributes ?? {};
    const activationStatus = String(attrs.activation_status ?? "").trim() || null;
    const identityStatus = String(attrs.person?.identity_verification_status ?? "").trim() || null;
    let step = connection.onboarding_step ?? "identity_verification";
    if (activationStatus === "activated") step = "active";
    else if (identityStatus === "passed" || identityStatus === "passed_attestation_form") step = "business_information";
    else if (identityStatus === "failed") step = "identity_verification";

    if (activationStatus === "activated") {
      let webhookId = String(connection.webhook_id ?? "").trim();
      if (!webhookId || !connection.webhook_secret_id) {
        const webhookResponse = await fetch("https://api.paymongo.com/v1/webhooks", {
          method: "POST",
          headers: { Authorization: basic(key), "Content-Type": "application/json", "Account-ID": connection.paymongo_account_id, "Idempotency-Key": "web2table-tenant-paymongo-webhook-" + tenantId + "-live" },
          body: JSON.stringify({ data: { attributes: {
            url: url + "/functions/v1/tenant-paymongo-webhook",
            events: ["checkout_session.payment.paid","checkout_session.payment.failed","checkout_session.expired","payment.failed","payment.refunded","refund.created","refund.updated","refund.succeeded","refund.failed"],
          } } }),
        });
        const hook = await webhookResponse.json().catch(() => null);
        if (!webhookResponse.ok) {
          const message = typeof hook?.errors?.[0]?.detail === "string" ? hook.errors[0].detail : "PayMongo is active, but webhook configuration failed.";
          await admin.from("tenant_paymongo_accounts").update({ connection_status:"pending", activation_status:activationStatus,
            identity_verification_status:identityStatus, onboarding_step:"webhook_configuration", last_error:message })
            .eq("tenant_id",tenantId).eq("environment","live");
          return json({status:"pending",paymongoAccountId:connection.paymongo_account_id,activationStatus,identityVerificationStatus:identityStatus,onboardingStep:"webhook_configuration",verificationUrl:connection.verification_url,error:message});
        }
        webhookId = String(hook?.data?.id ?? "").trim();
        const webhookSecret = String(hook?.data?.attributes?.secret_key ?? "").trim();
        if (!webhookId || !webhookSecret) return json({error:"PayMongo did not return webhook credentials."},502);
        const { error: secretError } = await admin.rpc("set_tenant_paymongo_webhook_secret", {p_tenant_id:tenantId,p_secret:webhookSecret,p_environment:"live"});
        if (secretError) throw secretError;
      }
      const { error: updateError } = await admin.from("tenant_paymongo_accounts").update({
        connection_status:"active",activation_status:activationStatus,identity_verification_status:identityStatus,
        onboarding_step:"active",webhook_id:webhookId,last_error:null,
      }).eq("tenant_id",tenantId).eq("environment","live");
      if (updateError) throw updateError;
      const { data: storeRow } = await admin.from("tenant_storefronts").select("online_payments").eq("tenant_id",tenantId).maybeSingle();
      if (storeRow) await admin.from("tenant_storefronts").update({ online_payments:{...(storeRow.online_payments ?? {}),provider_configured:true},updated_at:new Date().toISOString() }).eq("tenant_id",tenantId);
      return json({status:"active",paymongoAccountId:connection.paymongo_account_id,activationStatus,identityVerificationStatus:identityStatus,onboardingStep:"active",verificationUrl:connection.verification_url,account:{person:attrs.person ?? null,business:attrs.business ?? null}});
    }
    const { error: updateError } = await admin.from("tenant_paymongo_accounts").update({
      connection_status:"pending",activation_status:activationStatus,identity_verification_status:identityStatus,
      onboarding_step:step,last_error:null,
    }).eq("tenant_id",tenantId).eq("environment","live");
    if (updateError) throw updateError;
    return json({status:"pending",paymongoAccountId:connection.paymongo_account_id,activationStatus,identityVerificationStatus:identityStatus,onboardingStep:step,verificationUrl:connection.verification_url,account:{person:attrs.person ?? null,business:attrs.business ?? null}});
  } catch(e) {
    if (e instanceof ResponseError) return json({error:e.message},e.status);
    console.error("sync-tenant-paymongo-account",e);
    return json({error:"Unable to synchronize PayMongo merchant onboarding."},500);
  }
});