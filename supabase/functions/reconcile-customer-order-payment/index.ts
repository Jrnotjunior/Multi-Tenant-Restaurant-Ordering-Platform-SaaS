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
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  }
}

function paymongoKey(environment: string) {
  const explicit = Deno.env.get(environment === "live" ? "PAYMONGO_LIVE_SECRET_KEY" : "PAYMONGO_TEST_SECRET_KEY");
  const fallback = Deno.env.get("PAYMONGO_SECRET_KEY") ?? "";
  return explicit ?? (fallback.startsWith(environment === "live" ? "sk_live_" : "sk_test_") ? fallback : "");
}

const basic = (key: string) => "Basic " + btoa(key + ":");

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = serviceKey();
    if (!url || !key) return json({ error: "Payment service is not configured." }, 500);

    const body = await request.json().catch(() => ({}));
    const trackingToken = String(body.trackingToken ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(trackingToken)) {
      return json({ error: "A valid order tracking token is required." }, 400);
    }

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: order, error: orderError } = await admin.from("customer_orders")
      .select("id,tenant_id,total_centavos,payment_status,payment_method")
      .eq("idempotency_key", trackingToken).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Order not found." }, 404);
    if (order.payment_method !== "online" || ["paid", "refunded"].includes(order.payment_status)) {
      return json({ success: true, status: order.payment_status });
    }

    const { data: session, error: sessionError } = await admin.from("customer_order_payment_sessions")
      .select("id,tenant_id,order_id,environment,paymongo_account_id,checkout_session_id,amount_centavos,status,paymongo_payment_id")
      .eq("tenant_id", order.tenant_id).eq("order_id", order.id)
      .in("status", ["active", "paid"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session || session.status === "paid" || !session.checkout_session_id) {
      return json({ success: true, status: order.payment_status });
    }

    const secret = paymongoKey(session.environment);
    if (!secret) return json({ error: "PayMongo payment verification is not configured." }, 409);
    const headers: Record<string, string> = { Authorization: basic(secret), Accept: "application/json" };
    if (session.paymongo_account_id !== "platform_test") headers["Account-ID"] = session.paymongo_account_id;

    const providerResponse = await fetch(
      "https://api.paymongo.com/v1/checkout_sessions/" + encodeURIComponent(session.checkout_session_id),
      { headers, signal: AbortSignal.timeout(10000) },
    );
    const providerPayload = await providerResponse.json().catch(() => null);
    if (!providerResponse.ok) {
      console.warn("PayMongo session reconciliation request failed", {
        status: providerResponse.status,
        environment: session.environment,
        orderId: order.id,
        paymentSessionId: session.id,
      });
      return json({ success: false, status: order.payment_status }, 502);
    }

    const resource = providerPayload?.data;
    const attributes = resource?.attributes ?? {};
    const metadata = attributes.metadata ?? {};
    const isLive = session.environment === "live";
    if (resource?.id !== session.checkout_session_id
      || attributes.livemode !== isLive
      || String(metadata.tenant_id ?? "") !== order.tenant_id
      || String(metadata.order_id ?? "") !== order.id
      || String(metadata.payment_session_id ?? "") !== session.id) {
      console.error("PayMongo session reconciliation identity mismatch", { orderId: order.id, paymentSessionId: session.id });
      return json({ error: "PayMongo returned a session that does not match this order." }, 409);
    }

    const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
    const paidPayments = payments.filter((payment: any) => String(payment?.attributes?.status ?? "").toLowerCase() === "paid");
    if (!paidPayments.length) return json({ success: true, status: order.payment_status });
    if (paidPayments.length !== 1) {
      console.error("PayMongo returned multiple paid payments for one checkout session", { orderId: order.id, paymentSessionId: session.id });
      return json({ error: "PayMongo returned an unexpected payment state." }, 409);
    }

    const paidPayment = paidPayments[0];
    const paidAttributes = paidPayment.attributes ?? {};
    const amount = paidAttributes.amount;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0
      || amount !== Number(session.amount_centavos) || amount !== Number(order.total_centavos)
      || String(paidAttributes.currency ?? "").toUpperCase() !== "PHP"
      || paidAttributes.livemode !== isLive) {
      console.error("PayMongo paid amount or mode did not match order", { orderId: order.id, paymentSessionId: session.id });
      return json({ error: "Paid amount does not match the order total." }, 409);
    }

    const paymentId = String(paidPayment.id ?? "").trim();
    if (!paymentId) return json({ error: "PayMongo did not return a payment reference." }, 409);
    const { error: referenceError } = await admin.from("customer_order_payment_sessions").update({
      paymongo_payment_id: paymentId,
      updated_at: new Date().toISOString(),
    }).eq("id", session.id).eq("tenant_id", order.tenant_id).eq("status", "active");
    if (referenceError) throw referenceError;

    const { data: finalized, error: finalizeError } = await admin.rpc("finalize_customer_order_payment", {
      p_tenant_id: order.tenant_id,
      p_environment: session.environment,
      p_checkout_session_id: session.checkout_session_id,
      p_amount_centavos: amount,
    });
    if (finalizeError) throw finalizeError;
    if (!finalized?.success) return json({ error: "The paid order could not be finalized." }, 409);
    return json({ success: true, status: "paid" });
  } catch (error) {
    console.error("reconcile-customer-order-payment failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Unable to verify the PayMongo payment right now." }, 500);
  }
});
