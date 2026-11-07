import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

function isValidPassword(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 8
    && value.length <= 128
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value);
}

async function corsHeaders(req: Request, admin: any) {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string,string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === "https:") {
        const { data } = await admin.from("tenant_domains").select("id")
          .eq("hostname", parsed.hostname.toLowerCase())
          .eq("status", "active").not("verified_at", "is", null)
          .limit(1).maybeSingle();
        if (data) headers["Access-Control-Allow-Origin"] = origin;
      }
    } catch { /* Reject unrecognized origins; no credentialed CORS is enabled. */ }
  }
  return headers;
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: "Password setup is temporarily unavailable." }), { status: 500 });
  }
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const headers = await corsHeaders(req, admin);
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });

  try {
    const token = (req.headers.get("Authorization") ?? "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return new Response(JSON.stringify({ error: "Sign in through your invitation link first." }), { status: 401, headers });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;
    if (claimsError || typeof userId !== "string") {
      return new Response(JSON.stringify({ error: "Your invitation session is invalid or expired. Reopen the invitation email." }), { status: 401, headers });
    }
    const { data: identity, error: identityError } = await userClient.auth.getUser(token);
    if (identityError || !identity.user || identity.user.id !== userId) {
      return new Response(JSON.stringify({ error: "Your invitation session could not be verified." }), { status: 401, headers });
    }
    const body = await req.json().catch(() => null);
    const invitationId = typeof body?.invitation_id === "string" ? body.invitation_id : "";
    const password = body?.password;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitationId)) {
      return new Response(JSON.stringify({ error: "The invitation reference is missing. Reopen the invitation email." }), { status: 400, headers });
    }
    if (!isValidPassword(password)) {
      return new Response(JSON.stringify({ error: "Password must be 8–128 characters and include uppercase, lowercase, a number, and a special character." }), { status: 400, headers });
    }
    const { data: invitation, error: invitationError } = await admin.from("privileged_invitations")
      .select("id,email,invited_user_id,status,expires_at")
      .eq("id", invitationId).eq("invited_user_id", userId)
      .eq("status", "sent").is("accepted_at", null).gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (invitationError || !invitation || invitation.email.toLowerCase() !== (identity.user.email ?? "").toLowerCase()) {
      return new Response(JSON.stringify({ error: "This invitation is unavailable or expired. Ask the restaurant owner for a new invitation." }), { status: 403, headers });
    }

    // Set the password through the trusted Auth Admin API. Only after this succeeds
    // do we persist the completion marker used by the onboarding state machine.
    const { error: passwordError } = await admin.auth.admin.updateUserById(userId, { password });
    if (passwordError) {
      return new Response(JSON.stringify({ error: "Supabase could not save your password. Please try again." }), { status: 400, headers });
    }
    const { data: recorded, error: recordError } = await admin.rpc("record_privileged_invitation_password_setup_for_service", {
      p_user_id: userId,
      p_invitation_id: invitationId,
    });
    if (recordError || recorded !== true) {
      console.error("Invitation password completion marker failed", recordError?.message ?? "no matching invitation");
      return new Response(JSON.stringify({ error: "Your password was saved, but account setup could not be advanced. Please retry this step." }), { status: 503, headers });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (error) {
    console.error("Staff invitation password setup failed", error instanceof Error ? error.message : "unknown error");
    return new Response(JSON.stringify({ error: "Password setup could not be completed. Please try again." }), { status: 500, headers });
  }
});
