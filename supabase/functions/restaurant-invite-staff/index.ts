import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = Deno.env.get("TENANT_SETUP_URL") ?? "https://app.web2table.io/restaurant";
const allowedOrigins = new Set(["https://admin.web2table.io","https://app.web2table.io","https://jrnotjunior.github.io"]);
function headersFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://admin.web2table.io",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
}
function respond(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(req) });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(req) });
  if (req.method !== "POST") return respond(req,405,{error:"Method not allowed."});
  const token=(req.headers.get("Authorization")??"").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(req,401,{error:"Sign in as the restaurant owner first."});
  const url=Deno.env.get("SUPABASE_URL"), anonKey=Deno.env.get("SUPABASE_ANON_KEY"), serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anonKey||!serviceKey) return respond(req,500,{error:"Staff invitations are temporarily unavailable."});
  const userClient=createClient(url,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const adminClient=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  let invitationId:string|null=null;
  try {
    const {data:claimsData,error:claimsError}=await userClient.auth.getClaims(token);
    const claims=claimsData?.claims;
    if(claimsError||!claims||typeof claims.sub!=="string") return respond(req,401,{error:"Your session is invalid or expired. Sign in again."});
    if(claims.aal!=="aal2") return respond(req,403,{error:"Complete MFA before inviting staff."});
    const {data:identity,error:identityError}=await userClient.auth.getUser(token);
    if(identityError||!identity.user||identity.user.id!==claims.sub) return respond(req,401,{error:"Your session could not be verified."});
    const body=await req.json().catch(()=>null);
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const role=body?.role;
    const branchId=typeof body?.branch_id==="string"?body.branch_id:"";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) return respond(req,400,{error:"Enter a valid staff email address."});
    if(!["cashier","kitchen","dispatcher","rider"].includes(role)) return respond(req,400,{error:"Choose cashier, kitchen, dispatcher, or rider."});
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) return respond(req,400,{error:"Choose an active branch."});
    const {data:existing,error:existingError}=await adminClient.auth.admin.listUsers({page:1,perPage:1000});
    if(existingError) return respond(req,500,{error:"Could not check whether the email already has an account."});
    if(existing.users.some(user=>user.email?.trim().toLowerCase()===email)) return respond(req,409,{error:"An account already exists for this email. Existing-account staff assignment is not supported by this invitation flow yet."});
    const {data:newInvite,error:inviteRecordError}=await userClient.rpc("request_privileged_invitation",{p_tenant_id:body.tenant_id,p_email:email,p_role:role,p_branch_id:branchId});
    if(inviteRecordError||typeof newInvite!=="string") {
      const msg=inviteRecordError?.message??"Could not prepare invitation.";
      return respond(req,400,{error:msg.includes("pending invitation")?"A pending invitation already exists for this email and restaurant.":msg});
    }
    invitationId=newInvite;
    const {data:sent,error:sendError}=await adminClient.auth.admin.inviteUserByEmail(email,{
      redirectTo:APP_URL,
      data:{full_name:typeof body.name==="string"?body.name.trim().slice(0,120):"",invitation_type:"restaurant_staff",tenant_id:body.tenant_id,tenant_role:role,tenant_invitation_id:invitationId,branch_id:branchId},
    });
    if(sendError||!sent?.user?.id) {
      await adminClient.from("privileged_invitations").update({status:"failed"}).eq("id",invitationId);
      return respond(req,502,{error:"Supabase could not send the invitation email. Check Auth email delivery settings before retrying."});
    }
    const {error:finalizeError}=await adminClient.from("privileged_invitations").update({invited_user_id:sent.user.id,status:"sent",sent_at:new Date().toISOString()}).eq("id",invitationId);
    if(finalizeError) return respond(req,500,{error:"The invitation may have been emailed, but its status could not be finalized. Inspect the invitation before retrying."});
    return respond(req,200,{success:true,email,role,invitation_id:invitationId,message:"Staff invitation sent."});
  } catch(error) {
    console.error("Staff invitation failed:",error instanceof Error?error.message:"unknown error");
    if(invitationId) await adminClient.from("privileged_invitations").update({status:"failed"}).eq("id",invitationId);
    return respond(req,500,{error:"The staff invitation could not be completed."});
  }
});
