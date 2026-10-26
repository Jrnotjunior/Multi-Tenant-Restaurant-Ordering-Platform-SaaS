import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, paymongo-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
function serviceKey() {
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return values.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  }
}
function parseSignature(header: string) {
  const parts = Object.fromEntries(header.split(",").map((part) => {
    const [key, value] = part.trim().split("=", 2);
    return [key, value ?? ""];
  }));
  return { timestamp: parts.t ?? "", test: parts.te ?? "", live: parts.li ?? "" };
}
function hex(bytes: Uint8Array) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
function accountIdFromEvent(attributes: any, eventType: string) {
  const data = attributes?.data ?? {};
  const nested = data?.attributes ?? {};
  // Identity-verification events carry the child account ID in data.attributes.account_id;
  // activation/decline events identify the child account as data.id.
  if (eventType.startsWith("account.identity_verification.") || eventType.startsWith("accounts.identity_verifications.")) {
    return String(nested?.account_id ?? "").trim();
  }
  return String(data?.id ?? nested?.account_id ?? attributes?.account_id ?? "").trim();
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_048_576) return json({ error: "Webhook payload is too large." }, 413);
    let payload: any;
    try { payload = JSON.parse(raw); } catch { return json({ error: "Invalid JSON payload." }, 400); }
    const event = payload?.data ?? {};
    const attributes = event?.attributes ?? {};
    const eventId = String(event?.id ?? "").trim();
    const eventType = String(attributes?.type ?? "").trim();
    const environment = attributes?.livemode ? "live" : "test";
    if (!eventId || !eventType) return json({ error: "Invalid PayMongo lifecycle event." }, 400);

    // This endpoint is registered on the Web2Table PARENT account. Never use a
    // tenant webhook secret to authenticate a parent-level lifecycle notification.
    const secret = environment === "live"
      ? (Deno.env.get("PAYMONGO_PARENT_LIVE_WEBHOOK_SECRET") ?? "")
      : (Deno.env.get("PAYMONGO_PARENT_TEST_WEBHOOK_SECRET") ?? "");
    if (!secret) return json({ error: "Parent PayMongo webhook secret is not configured." }, 503);
    const signature = parseSignature(request.headers.get("Paymongo-Signature") ?? "");
    if (!signature.timestamp || !/^\d+$/.test(signature.timestamp)) return json({ error: "Invalid webhook signature." }, 401);
    const timestamp = Number(signature.timestamp) * 1000;
    if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      return json({ error: "Webhook signature timestamp is outside the allowed window." }, 401);
    }
    const provided = environment === "live" ? signature.live : signature.test;
    const expected = await hmac(secret, signature.timestamp + "." + raw);
    if (!provided || !safeEqual(expected, provided)) return json({ error: "Invalid webhook signature." }, 401);

    const lifecycleEvents = new Set([
      "account.activated", "merchant.activated", "consumer.activated",
      "account.declined", "merchant.declined", "consumer.declined",
      "account.identity_verification.passed", "account.identity_verification.failed",
      // PayMongo webhook reference also documents the plural aliases.
      "accounts.identity_verifications.passed", "accounts.identity_verifications.failed",
    ]);
    if (!lifecycleEvents.has(eventType)) {
      // This endpoint intentionally handles lifecycle events only. Payment/refund
      // events belong on tenant-paymongo-webhook.
      return json({ received: true, ignored: true, eventType }, 200);
    }

    const childAccountId = accountIdFromEvent(attributes, eventType);
    if (!childAccountId) return json({ error: "Lifecycle event did not include a child account ID." }, 400);
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = serviceKey();
    if (!url || !key) return json({ error: "Server configuration is incomplete." }, 500);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: connection, error: lookupError } = await admin.from("tenant_paymongo_accounts")
      .select("tenant_id,connection_status,activation_status,identity_verification_status")
      .eq("paymongo_account_id", childAccountId).eq("environment", environment).maybeSingle();
    if (lookupError) throw lookupError;
    // A parent event for an account not yet mapped to a tenant is safely acknowledged;
    // it must not attach the account to an arbitrary tenant.
    if (!connection) return json({ received: true, ignored: true, reason: "Child account is not mapped to a tenant." }, 200);

    const { data: claimed, error: claimError } = await admin.rpc("claim_tenant_paymongo_webhook_event", {
      p_event_id: eventId, p_tenant_id: connection.tenant_id, p_environment: environment, p_event_type: eventType,
    });
    if (claimError) throw claimError;
    if (!claimed) return json({ received: true, duplicate: true }, 200);

    const resource = attributes?.data?.attributes ?? {};
    const activation = String(resource?.activation_status ?? resource?.status ?? "").toLowerCase();
    const identity = String(resource?.person?.identity_verification_status ?? resource?.identity_verification_status ?? "").toLowerCase();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString(), last_error: null };
    if (["account.activated", "merchant.activated", "consumer.activated"].includes(eventType)) {
      // Activation alone is not enough to enable checkout: sync-tenant-paymongo-account
      // must first configure and persist the child account's payment webhook secret.
      update.connection_status = "pending";
      update.activation_status = activation || "activated";
      update.onboarding_step = "webhook_configuration";
    } else if (["account.declined", "merchant.declined", "consumer.declined"].includes(eventType)) {
      update.connection_status = "pending";
      update.activation_status = activation || "declined";
      update.onboarding_step = "activation";
      update.last_error = "PayMongo declined child account activation. Review the account in PayMongo.";
    } else {
      const verificationResult = String(resource?.result ?? "").toLowerCase();
      if (verificationResult) update.identity_verification_status = verificationResult;
      else if (identity) update.identity_verification_status = identity;
      if (activation) update.activation_status = activation;
      if (eventType === "account.identity_verification.failed" || eventType === "accounts.identity_verifications.failed") {
        update.onboarding_step = "identity_verification";
        update.last_error = "PayMongo identity verification failed. The restaurant owner must retry verification.";
      } else if (eventType === "account.identity_verification.passed" || eventType === "accounts.identity_verifications.passed") {
        update.onboarding_step = "business_information";
        update.last_error = null;
      }
    }
    const { error: updateError } = await admin.from("tenant_paymongo_accounts").update(update)
      .eq("tenant_id", connection.tenant_id).eq("environment", environment).eq("paymongo_account_id", childAccountId);
    if (updateError) {
      await admin.from("tenant_paymongo_webhook_events").update({ status: "failed", last_error: "Child account lifecycle update failed." }).eq("event_id", eventId);
      throw updateError;
    }
    const { error: processedError } = await admin.from("tenant_paymongo_webhook_events").update({
      status: "processed", processed_at: new Date().toISOString(), last_error: null,
    }).eq("event_id", eventId);
    if (processedError) throw processedError;
    return json({ received: true, tenantId: connection.tenant_id, childAccountId, eventType }, 200);
  } catch (error) {
    console.error("paymongo-parent-webhook", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Unable to process PayMongo parent lifecycle event." }, 500);
  }
});
