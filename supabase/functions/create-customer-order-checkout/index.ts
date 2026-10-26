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
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return values.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  } catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""; }
}
function paymongoKey(environment: string) {
  if (environment === "test") {
    const explicit = Deno.env.get("PAYMONGO_TEST_SECRET_KEY");
    const fallback = Deno.env.get("PAYMONGO_SECRET_KEY") ?? "";
    return explicit ?? (fallback.startsWith("sk_test_") ? fallback : "");
  }
  const explicit = Deno.env.get("PAYMONGO_LIVE_SECRET_KEY");
  const fallback = Deno.env.get("PAYMONGO_SECRET_KEY") ?? "";
  return explicit ?? (fallback.startsWith("sk_live_") ? fallback : "");
}
const basic = (key: string) => "Basic " + btoa(key + ":");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = serviceKey();
    if (!url || !key) return json({ error: "Payment service is not configured." }, 500);
    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId ?? "").trim();
    const trackingToken = String(body.trackingToken ?? "").trim();
    const restaurantSlug = String(body.restaurantSlug ?? "").trim();
    const environment = body.environment === "live" ? "live" : "test";
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(orderId)) return json({ error: "A valid order is required." }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(trackingToken)) return json({ error: "A valid order tracking token is required." }, 400);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(restaurantSlug)) return json({ error: "A valid restaurant tracking route is required." }, 400);
    const secret = paymongoKey(environment);
    if (!secret) return json({ error: "PayMongo " + environment + " mode is not configured." }, 409);

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: order, error: orderError } = await admin.from("customer_orders")
      .select("id,tenant_id,order_number,order_status,payment_status,total_centavos,currency,idempotency_key")
      .eq("id", orderId).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Order not found." }, 404);
    if (order.idempotency_key !== trackingToken) return json({ error: "Order tracking token does not match." }, 403);
    if (order.order_status !== "pending_confirmation" || !["not_started", "pending", "failed"].includes(order.payment_status)) {
      return json({ error: "This order is not available for online payment." }, 409);
    }
    if (!Number.isSafeInteger(Number(order.total_centavos)) || Number(order.total_centavos) <= 0) {
      return json({ error: "The restaurant must finalize this order total before online payment." }, 409);
    }

    const { data: account, error: accountError } = await admin.from("tenant_paymongo_accounts")
      .select("paymongo_account_id,connection_status").eq("tenant_id", order.tenant_id)
      .eq("environment", environment).maybeSingle();
    if (accountError) throw accountError;
    // In test mode only, allow checkout through the platform's PayMongo test account.
    // Live mode always requires the tenant's own active connected account.
    const platformTest = environment === "test" && !!secret &&
      (!account?.paymongo_account_id || account.connection_status !== "active");
    const effectiveAccountId = platformTest ? "platform_test" : account?.paymongo_account_id;
    if (!effectiveAccountId || (!platformTest && account?.connection_status !== "active")) {
      return json({ error: "This restaurant has not enabled online payments for " + environment + " mode." }, 409);
    }

    const { data: existing, error: existingError } = await admin.from("customer_order_payment_sessions")
      .select("checkout_session_id,checkout_url,status,amount_centavos")
      .eq("tenant_id", order.tenant_id).eq("order_id", order.id).eq("environment", environment)
      .in("status", ["active", "paid"]).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "active" && existing.checkout_url && Number(existing.amount_centavos) === Number(order.total_centavos)) {
      return json({ success: true, checkoutUrl: existing.checkout_url, status: existing.status });
    }
    if (existing?.status === "paid") return json({ error: "This order has already been paid." }, 409);

    const { data: session, error: insertError } = await admin.from("customer_order_payment_sessions")
      .insert({
        tenant_id: order.tenant_id, order_id: order.id, environment,
        paymongo_account_id: effectiveAccountId,
        amount_centavos: Number(order.total_centavos), status: "creating",
      }).select("id").single();
    if (insertError) {
      // Concurrent requests may have created the unique open session. Read it rather than creating a second charge.
      const { data: concurrent } = await admin.from("customer_order_payment_sessions")
        .select("checkout_url,status,amount_centavos").eq("tenant_id", order.tenant_id).eq("order_id", order.id)
        .eq("environment", environment).in("status", ["active", "paid"]).maybeSingle();
      if (concurrent?.status === "active" && concurrent.checkout_url) return json({ success: true, checkoutUrl: concurrent.checkout_url, status: "active" });
      throw insertError;
    }

    const baseUrl = (Deno.env.get("PUBLIC_STOREFRONT_URL") ?? "https://app.web2table.io").trim().replace(/\/$/, "");
    if (!baseUrl || !/^https:\/\//i.test(baseUrl)) {
      await admin.from("customer_order_payment_sessions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", session.id);
      return json({ error: "The public storefront URL is not configured." }, 500);
    }
    const amount = Number(order.total_centavos);
    const payload = {
      data: { attributes: {
        line_items: [{ currency: order.currency || "PHP", amount, name: "Restaurant order #" + order.order_number, quantity: 1 }],
        payment_method_types: ["gcash", "card", "paymaya"],
        description: "Web2Table order #" + order.order_number,
        // Return to the established restaurant tracking route. The browser session retains
        // the tracking token saved before redirecting to PayMongo; the signed webhook remains
        // the only authority that can mark payment as paid.
        success_url: baseUrl + "/#order/" + encodeURIComponent(restaurantSlug) + "/track",
        cancel_url: baseUrl + "/#order/" + encodeURIComponent(restaurantSlug) + "/track",
        metadata: { tenant_id: order.tenant_id, order_id: order.id, payment_session_id: session.id },
      } },
    };
    let response: Response;
    try {
      response = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
        method: "POST",
        headers: {
          Authorization: basic(secret), "Content-Type": "application/json",
          ...(platformTest ? {} : { "Account-ID": effectiveAccountId }),
          "Idempotency-Key": "w2t-checkout-" + session.id,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
    } catch (paymentApiError) {
      console.error("PayMongo checkout API request failed", {
        name: paymentApiError instanceof Error ? paymentApiError.name : "UnknownError",
        message: paymentApiError instanceof Error ? paymentApiError.message : String(paymentApiError),
        environment,
        orderId: order.id,
        paymentSessionId: session.id,
      });
      await admin.from("customer_order_payment_sessions").update({
        status: "failed", updated_at: new Date().toISOString(),
      }).eq("id", session.id);
      return json({ error: "Could not reach PayMongo to start checkout. Please retry; no payment was confirmed." }, 502);
    }
    const result = await response.json().catch(() => null);
    const checkoutSessionId = String(result?.data?.id ?? "");
    const checkoutUrl = String(result?.data?.attributes?.checkout_url ?? "");
    if (!response.ok || !checkoutSessionId || !/^https:\/\//i.test(checkoutUrl)) {
      await admin.from("customer_order_payment_sessions").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", session.id);
      const detail = typeof result?.errors?.[0]?.detail === "string" ? result.errors[0].detail : "PayMongo could not create the checkout session.";
      return json({ error: detail }, 502);
    }
    const { error: updateError } = await admin.from("customer_order_payment_sessions").update({
      checkout_session_id: checkoutSessionId, checkout_url: checkoutUrl,
      status: "active", updated_at: new Date().toISOString(),
    }).eq("id", session.id);
    if (updateError) throw updateError;
    return json({ success: true, checkoutUrl, status: "active" });
  } catch (error) {
    console.error("create-customer-order-checkout failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Unable to create online checkout. No payment was confirmed. Please retry; if it continues, check the Supabase Edge Function logs." }, 500);
  }
});
