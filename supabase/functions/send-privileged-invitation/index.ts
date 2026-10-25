// W2T-003: authenticated invitation sender. Never expose service-role keys to callers.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

type InviteRole = "restaurant_owner" | "kitchen" | "dispatcher" | "rider";
const roleValues = new Set<InviteRole>(["restaurant_owner", "kitchen", "dispatcher", "rider"]);

function response(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const redirectBase = Deno.env.get("APP_INVITE_REDIRECT_URL") ?? "";
  // Production URL and Supabase Auth redirect allowlist must be configured
  // before any invitation can be sent.
  if (!url || !anonKey || !serviceKey || !redirectBase) return response({ error: "Invitation service is not configured" }, 503);
  let redirect: URL;
  try {
    redirect = new URL(redirectBase);
    if (redirect.protocol !== "https:" || redirect.username || redirect.password ||
        redirect.search || redirect.hash || !redirect.pathname.replace(/\/+$/, "").endsWith("/restaurant")) throw new Error();
  } catch { return response({ error: "Invalid server redirect configuration" }, 503); }

  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return response({ error: "Authentication required" }, 401);
  let body: { tenantId?: unknown; email?: unknown; role?: unknown; branchId?: unknown };
  try { body = await request.json(); } catch { return response({ error: "Invalid request" }, 400); }
  if (typeof body.tenantId !== "string" || typeof body.email !== "string" ||
      typeof body.role !== "string" || !roleValues.has(body.role as InviteRole) ||
      (body.branchId != null && typeof body.branchId !== "string")) {
    return response({ error: "Invalid invitation arguments" }, 400);
  }

  const actorClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + bearer } },
  });
  const { data: actor, error: actorError } = await actorClient.auth.getUser(bearer);
  if (actorError || !actor.user) return response({ error: "Authentication required" }, 401);
  // The RLS-protected RPC itself checks the caller JWT's AAL2, role and tenant.
  const { data: invitationId, error: requestError } = await actorClient.rpc("request_privileged_invitation", {
    p_tenant_id: body.tenantId,
    p_email: body.email,
    p_role: body.role,
    p_branch_id: body.branchId ?? null,
  });
  if (requestError || typeof invitationId !== "string") return response({ error: "Invitation rejected" }, 403);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  redirect.searchParams.set("invite_id", invitationId);
  try {
    const { data: tenant, error: tenantError } = await admin.from("tenants")
      .select("name,slug").eq("id", body.tenantId).maybeSingle();
    if (tenantError || !tenant) throw new Error("Invitation restaurant could not be resolved");
    const isOwner = body.role === "restaurant_owner";
    const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(body.email.trim().toLowerCase(), {
      redirectTo: redirect.toString(),
      data: {
        invitation_type: isOwner ? "restaurant_owner" : "restaurant_staff",
        invitation_label: isOwner ? "RESTAURANT OWNER INVITATION" : "RESTAURANT TEAM INVITATION",
        restaurant_name: tenant.name,
        invitation_role: isOwner ? "restaurant owner" : body.role,
        account_setup: isOwner ? "your Restaurant Owner account" : "your staff account",
        tenant_id: body.tenantId,
        tenant_slug: tenant.slug,
        tenant_invitation_id: invitationId,
        name: "",
      },
    });
    if (error || !invite.user?.id) throw new Error("Email invitation failed");

    const { data, error: updateError } = await admin.from("privileged_invitations")
      .update({ invited_user_id: invite.user.id, status: "sent", sent_at: new Date().toISOString() })
      .eq("id", invitationId).eq("status", "pending").select("id").single();
    if (updateError || !data?.id) throw new Error("Invitation could not be finalized");
    return response({ invitationId, status: "sent" }, 200);
  } catch (err) {
    await admin.from("privileged_invitations").update({ status: "failed" })
      .eq("id", invitationId).eq("status", "pending");
    console.error("Invitation failed", err instanceof Error ? err.message : "unknown");
    return response({ error: "Invitation delivery failed. No membership was created." }, 502);
  }
});
