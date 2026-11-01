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

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const basic = (key: string) => "Basic " + btoa(key + ":");
const retryWindowMs = 23 * 60 * 60 * 1000;

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

type RefundRequest = {
  payment_session_id: string;
  environment: string;
  paymongo_account_id: string;
  paymongo_payment_id: string;
  amount_centavos: number;
  reason: string;
  refund_id: string | null;
  refund_attempt_key: string;
  refund_attempt_started_at: string;
};

type PayMongoRefund = {
  id?: string;
  type?: string;
  attributes?: {
    amount?: number;
    payment_id?: string;
    reason?: string;
    status?: string;
  };
};

async function resetFailedRefund(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  refund: RefundRequest,
) {
  const { error } = await admin.from("customer_order_payment_sessions").update({
    status: "paid",
    refund_reason: null,
    refund_id: null,
    refund_attempt_key: null,
    refund_attempt_started_at: null,
    updated_at: new Date().toISOString(),
  })
    .eq("tenant_id", tenantId)
    .eq("id", refund.payment_session_id)
    .eq("status", "refund_pending")
    .eq("refund_attempt_key", refund.refund_attempt_key);
  if (error) throw error;
}

async function saveRefundId(
  admin: ReturnType<typeof createClient>,
  tenantId: string,
  refund: RefundRequest,
  refundId: string,
) {
  const { error } = await admin.from("customer_order_payment_sessions").update({
    refund_id: refundId,
    updated_at: new Date().toISOString(),
  })
    .eq("tenant_id", tenantId)
    .eq("id", refund.payment_session_id)
    .eq("status", "refund_pending")
    .eq("refund_attempt_key", refund.refund_attempt_key);
  if (error) throw error;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = serviceKey();
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authorization = request.headers.get("Authorization") ?? "";
    if (!url || !key || !anonKey) return json({ error: "Payment service is not configured." }, 500);
    if (!authorization.startsWith("Bearer ")) return json({ error: "Owner sign-in required." }, 401);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Owner sign-in required." }, 401);

    const body = await request.json().catch(() => ({}));
    const tenantId = String(body.tenantId ?? "").trim();
    const orderId = String(body.orderId ?? "").trim();
    const reason = String(body.reason ?? "requested_by_customer").trim();
    const allowedReasons = ["requested_by_customer", "duplicate", "fraudulent", "others"];
    if (!isUuid(tenantId) || !isUuid(orderId)) return json({ error: "A valid tenant and order are required." }, 400);
    if (!allowedReasons.includes(reason)) return json({ error: "Choose a supported refund reason." }, 400);

    const { data: requestData, error: requestError } = await userClient.rpc("request_customer_order_refund", {
      p_tenant_id: tenantId,
      p_order_id: orderId,
      p_reason: reason,
    });
    if (requestError) return json({ error: requestError.message || "Refund request was not authorized." }, 403);

    const refund = requestData as RefundRequest | null;
    if (!refund?.paymongo_payment_id || !refund.payment_session_id || !refund.refund_attempt_key) {
      return json({ error: "The payment reference is missing; contact support for manual review." }, 409);
    }

    const secret = paymongoKey(refund.environment);
    if (!secret) return json({ error: `PayMongo ${refund.environment} mode is not configured.` }, 409);
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

    let response: Response;
    try {
      if (refund.refund_id) {
        response = await fetch("https://api.paymongo.com/refunds/" + encodeURIComponent(refund.refund_id), {
          headers: { Authorization: basic(secret), Accept: "application/json", ...(refund.paymongo_account_id === "platform_test" ? {} : { "Account-ID": refund.paymongo_account_id }) },
          signal: AbortSignal.timeout(10000),
        });
      } else {
        const startedAt = Date.parse(refund.refund_attempt_started_at);
        if (!Number.isFinite(startedAt) || Date.now() - startedAt >= retryWindowMs) {
          return json({
            success: false,
            status: "refund_pending",
            message: "The request may already have reached PayMongo. Check the PayMongo dashboard before retrying to avoid a duplicate refund.",
          }, 202);
        }
        response = await fetch("https://api.paymongo.com/refunds", {
          method: "POST",
          headers: {
            Authorization: basic(secret),
            "Content-Type": "application/json",
            ...(refund.paymongo_account_id === "platform_test" ? {} : { "Account-ID": refund.paymongo_account_id }),
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
        success: false,
        status: "refund_pending",
        message: "PayMongo may have received the request. Check the refund status before retrying.",
      }, 202);
    }

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status >= 500 || [408, 409, 425, 429].includes(response.status) || refund.refund_id) {
        return json({
          success: false,
          status: "refund_pending",
          message: "PayMongo has not confirmed the refund result yet. Check the provider dashboard before retrying.",
        }, 202);
      }
      await resetFailedRefund(admin, tenantId, refund);
      const detail = typeof result?.errors?.[0]?.detail === "string" ? result.errors[0].detail : "PayMongo rejected the refund request.";
      return json({ error: detail, status: "paid" }, 502);
    }

    const resource = result?.data as PayMongoRefund | undefined;
    const refundId = String(resource?.id ?? refund.refund_id ?? "").trim();
    const attributes = resource?.attributes ?? {};
    const status = String(attributes.status ?? "pending").toLowerCase();
    const refundedAmount = attributes.amount;
    const paymentId = String(attributes.payment_id ?? "").trim();
    if (!refundId) {
      return json({ success: false, status: "refund_pending", message: "PayMongo accepted the request but returned no refund reference. Check the provider dashboard." }, 202);
    }
    if (!paymentId || paymentId !== refund.paymongo_payment_id) {
      return json({ success: false, status: "refund_pending", message: "The provider returned a refund for a different payment. Contact support before retrying." }, 202);
    }

    await saveRefundId(admin, tenantId, refund, refundId);

    if (status === "failed") {
      await resetFailedRefund(admin, tenantId, refund);
      return json({ error: "PayMongo could not process this refund. The order remains paid and can be retried.", status: "paid" }, 409);
    }

    if (status === "succeeded") {
      if (!Number.isSafeInteger(refundedAmount) || refundedAmount !== Number(refund.amount_centavos)) {
        return json({ error: "PayMongo reported a refund amount different from the full order total. Contact support for reconciliation." }, 409);
      }
      const { error: finalizeError } = await admin.rpc("finalize_customer_order_refund", {
        p_tenant_id: tenantId,
        p_payment_session_id: refund.payment_session_id,
        p_refund_id: refundId,
        p_refunded_amount_centavos: refundedAmount,
      });
      if (finalizeError) throw finalizeError;
      return json({ success: true, status: "refunded", refundId });
    }

    return json({
      success: true,
      status: "refund_pending",
      refundId,
      message: "PayMongo accepted the full refund request. It will be marked refunded after provider confirmation.",
    }, 202);
  } catch (error) {
    console.error("refund-customer-order failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    return json({ error: "Unable to confirm refund status. Check PayMongo before retrying." }, 500);
  }
});
