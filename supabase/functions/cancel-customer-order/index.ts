import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
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
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const refundRetryWindowMs = 23 * 60 * 60 * 1000;

type PaymentSession = {
  id: string;
  environment: string;
  paymongo_account_id: string;
  checkout_session_id: string | null;
  status: string;
};

type RefundRequest = {
  success?: boolean;
  order_id: string;
  tenant_id: string;
  order_status: string;
  payment_status: string;
  payment_session_id: string;
  environment: string;
  paymongo_account_id: string;
  paymongo_payment_id: string;
  amount_centavos: number;
  reason: string;
  refund_id: string | null;
  refund_attempt_key: string;
  refund_attempt_started_at: string;
  refund_status: "pending" | "refunded";
};

type PayMongoRefund = {
  id?: string;
  attributes?: {
    amount?: number;
    payment_id?: string;
    status?: string;
  };
};

async function expireCheckoutSession(
  admin: ReturnType<typeof createClient>,
  order: { id: string; tenant_id: string },
  session: PaymentSession,
) {
  if (session.status === "paid") return { error: "We found a completed online payment and are confirming it. Please try again shortly; PayMongo will start the refund when cancellation is confirmed." };
  if (!session.checkout_session_id) {
    return session.status === "failed"
      ? { error: null }
      : { error: "Online checkout is still starting. Please try cancelling again in a moment." };
  }

  const secret = paymongoKey(session.environment);
  if (!secret) return { error: `PayMongo ${session.environment} mode is not configured. The order was not cancelled.` };

  const headers: Record<string, string> = { Authorization: basic(secret), Accept: "application/json" };
  if (session.paymongo_account_id !== "platform_test") headers["Account-ID"] = session.paymongo_account_id;
  const checkoutUrl = "https://api.paymongo.com/v1/checkout_sessions/" + encodeURIComponent(session.checkout_session_id);

  const expireResponse = await fetch(checkoutUrl + "/expire", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(10000),
  });

  let expired = expireResponse.ok;
  if (!expired) {
    // PayMongo may refuse expiration if payment completed or is still processing.
    // Retrieve the checkout before allowing the unpaid cancellation path to continue.
    const retrieveResponse = await fetch(checkoutUrl, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    const retrieved = await retrieveResponse.json().catch(() => null);
    const attributes = retrieved?.data?.attributes ?? {};
    const status = String(attributes.status ?? "").toLowerCase();
    const payments = Array.isArray(attributes.payments) ? attributes.payments : [];
    const paymentStates = payments.map((payment: any) => String(payment?.attributes?.status ?? payment?.status ?? "").toLowerCase());

    if (!retrieveResponse.ok) return { error: "We could not confirm the payment state, so the order was not cancelled. Please try again shortly." };
    if (paymentStates.includes("paid")) return { error: "We found a completed online payment and are confirming it. Please try again shortly; PayMongo will start the refund when cancellation is confirmed." };
    if (paymentStates.some((state: string) => ["pending", "processing"].includes(state))) {
      return { error: "The payment is still processing. Please wait for its result before cancelling the order." };
    }
    if (status !== "expired") return { error: "The online checkout could not be safely closed. The order was not cancelled." };
    expired = true;
  }

  if (!expired) return { error: "The online checkout could not be safely closed. The order was not cancelled." };

  const { error: updateError } = await admin.from("customer_order_payment_sessions")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("tenant_id", order.tenant_id)
    .eq("order_id", order.id)
    .eq("id", session.id)
    .in("status", ["active", "failed"]);
  if (updateError) return { error: "The checkout was closed, but its status could not be saved. Please retry cancellation." };
  return { error: null };
}

async function preparePaidOnlineCancellation(
  admin: ReturnType<typeof createClient>,
  lookup: { trackingToken?: string; tenantId?: string; orderId?: string },
) {
  const { data, error } = await admin.rpc("prepare_customer_order_cancellation", {
    p_tracking_token: lookup.trackingToken ?? null,
    p_tenant_id: lookup.tenantId ?? null,
    p_order_id: lookup.orderId ?? null,
  });
  if (error) return json({ error: error.message || "The paid order could not be safely cancelled." }, 409);

  const refund = data as RefundRequest | null;
  if (!refund?.payment_session_id || !refund.paymongo_payment_id) {
    return json({ error: "The verified PayMongo payment reference is missing. The order was not cancelled." }, 409);
  }
  if (refund.refund_status === "refunded") {
    return json({ success: true, orderId: refund.order_id, orderStatus: "cancelled", refundStatus: "refunded" });
  }
  if (!refund.refund_attempt_key) {
    return json({ error: "The automatic refund could not be started safely. Please contact the restaurant for help." }, 409);
  }

  const secret = paymongoKey(refund.environment);
  if (!secret) {
    const { error: resetError } = await admin.rpc("fail_customer_order_cancellation_refund", {
      p_tenant_id: refund.tenant_id,
      p_payment_session_id: refund.payment_session_id,
      p_refund_attempt_key: refund.refund_attempt_key,
    });
    if (resetError) throw resetError;
    return json({
      success: true,
      orderId: refund.order_id,
      orderStatus: "cancelled",
      refundStatus: "failed",
      message: "The order is cancelled, but the PayMongo refund could not be started automatically. Please contact the restaurant for help.",
    });
  }

  const headers: Record<string, string> = {
    Authorization: basic(secret),
    Accept: "application/json",
    ...(refund.paymongo_account_id === "platform_test" ? {} : { "Account-ID": refund.paymongo_account_id }),
  };
  let response: Response;
  try {
    if (refund.refund_id) {
      response = await fetch("https://api.paymongo.com/v1/refunds/" + encodeURIComponent(refund.refund_id), {
        headers,
        signal: AbortSignal.timeout(10000),
      });
    } else {
      const startedAt = Date.parse(refund.refund_attempt_started_at);
      if (!Number.isFinite(startedAt) || Date.now() - startedAt >= refundRetryWindowMs) {
        return json({
          success: true,
          orderId: refund.order_id,
          orderStatus: "cancelled",
          refundStatus: "pending",
          message: "The order is cancelled. PayMongo has not confirmed the refund yet.",
        }, 202);
      }
      response = await fetch("https://api.paymongo.com/v1/refunds", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Idempotency-Key": refund.refund_attempt_key,
        },
        body: JSON.stringify({ data: { attributes: {
          amount: Number(refund.amount_centavos),
          payment_id: refund.paymongo_payment_id,
          reason: refund.reason,
        } } }),
        signal: AbortSignal.timeout(10000),
      });
    }
  } catch {
    return json({
      success: true,
      orderId: refund.order_id,
      orderStatus: "cancelled",
      refundStatus: "pending",
      message: "The order is cancelled. PayMongo has not confirmed the refund yet.",
    }, 202);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status >= 500 || [408, 409, 425, 429].includes(response.status) || refund.refund_id) {
      return json({
        success: true,
        orderId: refund.order_id,
        orderStatus: "cancelled",
        refundStatus: "pending",
        message: "The order is cancelled. PayMongo has not confirmed the refund yet.",
      }, 202);
    }

    const { error: resetError } = await admin.rpc("fail_customer_order_cancellation_refund", {
      p_tenant_id: refund.tenant_id,
      p_payment_session_id: refund.payment_session_id,
      p_refund_attempt_key: refund.refund_attempt_key,
    });
    if (resetError) {
      console.error("Unable to persist rejected automatic refund state", { paymentSessionId: refund.payment_session_id });
      return json({
        success: true,
        orderId: refund.order_id,
        orderStatus: "cancelled",
        refundStatus: "pending",
        message: "The order is cancelled. PayMongo has not confirmed the refund yet.",
      }, 202);
    }
    return json({
      success: true,
      orderId: refund.order_id,
      orderStatus: "cancelled",
      refundStatus: "failed",
      message: "The order is cancelled, but PayMongo could not process the refund automatically. Please contact the restaurant for help.",
    });
  }

  const resource = payload?.data as PayMongoRefund | undefined;
  const refundId = String(resource?.id ?? refund.refund_id ?? "").trim();
  const attributes = resource?.attributes ?? {};
  const status = String(attributes.status ?? "pending").toLowerCase();
  const refundedAmount = attributes.amount;
  const paymentId = String(attributes.payment_id ?? "").trim();
  if (!refundId || paymentId !== refund.paymongo_payment_id
    || !Number.isSafeInteger(refundedAmount) || refundedAmount !== Number(refund.amount_centavos)) {
    return json({
      success: true,
      orderId: refund.order_id,
      orderStatus: "cancelled",
      refundStatus: "pending",
      message: "The order is cancelled. PayMongo has not confirmed the full refund yet.",
    }, 202);
  }

  if (status === "failed" || ["canceled", "cancelled"].includes(status)) {
    const { error: resetError } = await admin.rpc("fail_customer_order_cancellation_refund", {
      p_tenant_id: refund.tenant_id,
      p_payment_session_id: refund.payment_session_id,
      p_refund_attempt_key: refund.refund_attempt_key,
    });
    if (resetError) throw resetError;
    return json({
      success: true,
      orderId: refund.order_id,
      orderStatus: "cancelled",
      refundStatus: "failed",
      message: "The order is cancelled, but PayMongo could not process the refund automatically. Please contact the restaurant for help.",
    });
  }

  if (status === "succeeded") {
    const { error: finalizeError } = await admin.rpc("finalize_customer_order_refund", {
      p_tenant_id: refund.tenant_id,
      p_payment_session_id: refund.payment_session_id,
      p_refund_id: refundId,
      p_refunded_amount_centavos: refundedAmount,
    });
    if (finalizeError) throw finalizeError;
    return json({ success: true, orderId: refund.order_id, orderStatus: "cancelled", refundStatus: "refunded", refundId });
  }

  const { error: saveError } = await admin.from("customer_order_payment_sessions")
    .update({ refund_id: refundId, updated_at: new Date().toISOString() })
    .eq("tenant_id", refund.tenant_id)
    .eq("id", refund.payment_session_id)
    .eq("status", "refund_pending")
    .eq("refund_attempt_key", refund.refund_attempt_key);
  if (saveError) throw saveError;

  return json({
    success: true,
    orderId: refund.order_id,
    orderStatus: "cancelled",
    refundStatus: "pending",
    refundId,
    message: "The order is cancelled. PayMongo is processing your refund.",
  }, 202);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = serviceKey();
    if (!url || !key) return json({ error: "Order cancellation is not configured." }, 500);

    const body = await request.json().catch(() => ({}));
    const trackingToken = String(body.trackingToken ?? "").trim();
    const tenantId = String(body.tenantId ?? "").trim();
    const orderId = String(body.orderId ?? "").trim();
    const isCustomerRequest = trackingToken.length > 0;
    if (isCustomerRequest ? !isUuid(trackingToken) : (!isUuid(tenantId) || !isUuid(orderId))) {
      return json({ error: isCustomerRequest ? "A valid order tracking token is required." : "A valid tenant and order are required." }, 400);
    }

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    let userClient: ReturnType<typeof createClient> | null = null;

    if (!isCustomerRequest) {
      const authorization = request.headers.get("Authorization") ?? "";
      if (!authorization.startsWith("Bearer ")) return json({ error: "Cashier sign-in is required." }, 401);
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      if (!anonKey) return json({ error: "Staff authorization is not configured." }, 500);
      userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData.user) return json({ error: "Cashier sign-in is required." }, 401);
      const { error: authorizationError } = await userClient.rpc("authorize_staff_order_cancellation", {
        p_tenant_id: tenantId,
        p_order_id: orderId,
      });
      if (authorizationError) return json({ error: authorizationError.message || "You are not authorized to cancel this order." }, 403);
    }

    const orderQuery = admin.from("customer_orders")
      .select("id,tenant_id,order_status,payment_status,payment_method")
      .eq(isCustomerRequest ? "idempotency_key" : "id", isCustomerRequest ? trackingToken : orderId);
    const { data: order, error: orderError } = isCustomerRequest
      ? await orderQuery.maybeSingle()
      : await orderQuery.eq("tenant_id", tenantId).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Order not found." }, 404);

    const isPaidOnline = order.payment_method === "online"
      && ["paid", "refunded"].includes(order.payment_status);
    const isPaidCash = order.payment_method === "cash"
      && ["paid", "refunded"].includes(order.payment_status);
    if (isPaidOnline) {
      return await preparePaidOnlineCancellation(admin, isCustomerRequest
        ? { trackingToken }
        : { tenantId, orderId });
    }
    if (isPaidCash) {
      return json({ error: "This cash-paid order cannot be refunded through PayMongo. Please ask the cashier for help." }, 409);
    }
    if (order.order_status !== "pending_confirmation") {
      return json({ error: "Orders can only be cancelled before cashier confirmation sends them to the kitchen." }, 409);
    }

    const { data: sessions, error: sessionsError } = await admin.from("customer_order_payment_sessions")
      .select("id,environment,paymongo_account_id,checkout_session_id,status")
      .eq("tenant_id", order.tenant_id)
      .eq("order_id", order.id)
      .in("status", ["creating", "active", "failed", "paid"]);
    if (sessionsError) throw sessionsError;

    for (const session of (sessions ?? []) as PaymentSession[]) {
      if (session.status === "creating") {
        return json({ error: "Online checkout is still starting. Please try cancelling again in a moment." }, 409);
      }
      if (session.status === "failed" && !session.checkout_session_id) continue;
      const result = await expireCheckoutSession(admin, order, session);
      if (result.error) return json({ error: result.error }, 409);
    }

    const { error: cancellationError } = isCustomerRequest
      ? await admin.rpc("cancel_customer_order", { p_tracking_token: trackingToken })
      : await userClient!.rpc("transition_staff_order", {
        p_tenant_id: tenantId,
        p_order_id: orderId,
        p_action: "cancel",
      });
    if (cancellationError) return json({ error: cancellationError.message || "The order could not be cancelled." }, 409);

    return json({ success: true, orderId: order.id, orderStatus: "cancelled", refundStatus: null });
  } catch (error) {
    console.error("cancel-customer-order failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Unable to cancel this order right now. Please try again." }, 500);
  }
});
