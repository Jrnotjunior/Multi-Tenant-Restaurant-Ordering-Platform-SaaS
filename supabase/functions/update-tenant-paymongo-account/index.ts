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
    const { admin, user } = await ownerContext(request);
    const key = paymongoKey();
    if (!key) return json({error:"PayMongo live mode is not configured yet."},409);
    const body = await request.json().catch(() => ({}));
    const tenantId = String(body.tenantId ?? "").trim();
    const person = body.person && typeof body.person === "object" ? body.person : null;
    const business = body.business && typeof body.business === "object" ? body.business : null;
    if (!tenantId) return json({error:"Restaurant is required."},400);
    if (!person && !business) return json({error:"Onboarding information is required."},400);
    await assertTenantOwner(admin,user.id,tenantId);
    const {data:connection,error:connectionError}=await admin.from("tenant_paymongo_accounts")
      .select("paymongo_account_id,connection_status,activation_status,identity_verification_status,onboarding_step")
      .eq("tenant_id",tenantId).eq("environment","live").maybeSingle();
    if(connectionError)throw connectionError;
    if(!connection?.paymongo_account_id)return json({error:"PayMongo onboarding has not been started."},409);
    if(connection.connection_status==="active")return json({error:"This PayMongo account is already active."},409);
    const requestBody:Record<string,unknown>={};
    if(person)requestBody.person=person;
    if(business)requestBody.business=business;
    const response=await fetch("https://api.paymongo.com/v2/accounts/"+encodeURIComponent(connection.paymongo_account_id),{
      method:"PATCH",headers:{Authorization:basic(key),"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(requestBody)
    });
    const payload=await response.json().catch(()=>null);
    if(!response.ok)return json({error:typeof payload?.errors?.[0]?.detail==="string"?payload.errors[0].detail:"PayMongo rejected the onboarding information."},502);
    const attrs=payload?.data?.attributes??{};
    const {error:updateError}=await admin.from("tenant_paymongo_accounts").update({
      activation_status:String(attrs.activation_status??connection.activation_status??"").trim()||null,
      identity_verification_status:String(attrs.person?.identity_verification_status??connection.identity_verification_status??"").trim()||null,
      onboarding_step:"activation",last_error:null,
    }).eq("tenant_id",tenantId).eq("environment","live");
    if(updateError)throw updateError;
    return json({status:"pending",paymongoAccountId:connection.paymongo_account_id,onboardingStep:"activation",
      activationStatus:attrs.activation_status??connection.activation_status??null,
      identityVerificationStatus:attrs.person?.identity_verification_status??connection.identity_verification_status??null,
      account:{person:attrs.person??null,business:attrs.business??null}});
  } catch(e) {
    if(e instanceof ResponseError)return json({error:e.message},e.status);
    console.error("update-tenant-paymongo-account",e);
    return json({error:"Unable to update PayMongo merchant information."},500);
  }
});