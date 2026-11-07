import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

async function isAllowedOrigin(origin: string, adminClient?: any) {
  if (!adminClient || !origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:") return false;
    const { data } = await adminClient.from("tenant_domains").select("id")
      .eq("hostname", parsed.hostname.toLowerCase()).eq("status", "active")
      .not("verified_at", "is", null).limit(1).maybeSingle();
    return Boolean(data);
  } catch { return false; }
}
async function headersFor(req: Request, adminClient?: any) {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json",
  };
  if (await isAllowedOrigin(origin, adminClient)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
async function respond(req: Request, status: number, body: Record<string, unknown>, adminClient?: any) {
  return new Response(JSON.stringify(body), { status, headers: await headersFor(req, adminClient) });
}
Deno.serve(async (req: Request) => {
  const url=Deno.env.get("SUPABASE_URL"), anonKey=Deno.env.get("SUPABASE_ANON_KEY"), serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const adminClient = url && serviceKey ? createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}) : undefined;
  if (req.method === "OPTIONS") return new Response("ok", { headers: await headersFor(req, adminClient) });
  if (req.method !== "POST") return respond(req,405,{error:"Method not allowed."},adminClient);
  const token=(req.headers.get("Authorization")??"").match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return respond(req,401,{error:"Sign in as the restaurant owner first."},adminClient);
  if(!url||!anonKey||!serviceKey||!adminClient) return respond(req,500,{error:"Staff invitations are temporarily unavailable."},adminClient);
  const userClient=createClient(url,anonKey,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  let invitationId:string|null=null;
  try {
    const {data:claimsData,error:claimsError}=await userClient.auth.getClaims(token);
    const claims=claimsData?.claims;
    if(claimsError||!claims||typeof claims.sub!=="string") return respond(req,401,{error:"Your session is invalid or expired. Sign in again."},adminClient);
    if(claims.aal!=="aal2") return respond(req,403,{error:"Complete MFA before inviting staff."},adminClient);
    const {data:identity,error:identityError}=await userClient.auth.getUser(token);
    if(identityError||!identity.user||identity.user.id!==claims.sub) return respond(req,401,{error:"Your session could not be verified."},adminClient);
    const body=await req.json().catch(()=>null);
    const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
    const firstName=typeof body?.first_name==="string"?body.first_name.trim():"";
    const lastName=typeof body?.last_name==="string"?body.last_name.trim():"";
    const phone=typeof body?.phone==="string"?body.phone.trim():"";
    const fullName=[firstName,lastName].filter(Boolean).join(" ");
    const role=body?.role;
    const branchId=typeof body?.branch_id==="string"?body.branch_id:"";
    const tenantId=typeof body?.tenant_id==="string"?body.tenant_id:"";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254) return respond(req,400,{error:"Enter a valid staff email address."},adminClient);
    if(!firstName||firstName.length>60||!lastName||lastName.length>60) return respond(req,400,{error:"Enter both a first name and a last name (up to 60 characters each)."},adminClient);
    if(!/^09\d{9}$/.test(phone)) return respond(req,400,{error:"Enter a valid 11-digit mobile number starting with 09."},adminClient);
    if(!["cashier","kitchen","dispatcher","rider"].includes(role)) return respond(req,400,{error:"Choose cashier, kitchen, dispatcher, or rider."},adminClient);
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuid.test(branchId)||!uuid.test(tenantId)) return respond(req,400,{error:"Choose a restaurant branch."},adminClient);
    const {data:existing,error:existingError}=await adminClient.auth.admin.listUsers({page:1,perPage:1000});
    if(existingError) return respond(req,500,{error:"Could not check whether the email already has an account."},adminClient);
    if(existing.users.some(user=>user.email?.trim().toLowerCase()===email)) return respond(req,409,{error:"An account already exists for this email. Existing-account staff assignment is not supported by this invitation flow yet."},adminClient);
    const {data:newInvite,error:inviteRecordError}=await userClient.rpc("request_privileged_invitation",{p_tenant_id:tenantId,p_email:email,p_role:role,p_branch_id:branchId});
    if(inviteRecordError||typeof newInvite!=="string") {
      const msg=inviteRecordError?.message??"Could not prepare invitation.";
      return respond(req,400,{error:msg.includes("pending invitation")?"A pending invitation already exists for this email and restaurant.":msg},adminClient);
    }
    invitationId=newInvite;
    const [{data:tenant,error:tenantError},{data:branch,error:branchError},{data:domains,error:domainsError}]=await Promise.all([
      adminClient.from("tenants").select("name,slug").eq("id",tenantId).maybeSingle(),
      adminClient.from("branches").select("name,slug").eq("id",branchId).eq("tenant_id",tenantId).maybeSingle(),
      adminClient.from("tenant_domains").select("hostname,kind").eq("tenant_id",tenantId)
        .eq("status","active").not("verified_at","is",null),
    ]);
    if(tenantError||branchError||domainsError||!tenant||!branch) {
      await adminClient.from("privileged_invitations").update({status:"failed"}).eq("id",invitationId);
      return respond(req,500,{error:"Restaurant, branch, or verified restaurant domain could not be loaded for the invitation email."},adminClient);
    }
    // Invitation links must use a verified domain belonging to the invited tenant.
    // Never derive the redirect from the owner's current browser origin.
    const tenantDomainRows=Array.isArray(domains)?domains:[];
    const tenantDomain=tenantDomainRows.find((d:any)=>d.kind==="custom")??tenantDomainRows.find((d:any)=>d.kind==="managed");
    const hostname=typeof tenantDomain?.hostname==="string"?tenantDomain.hostname.toLowerCase():"";
    if(!hostname||hostname.includes("/")||hostname.includes(":")||hostname.includes("@")) {
      await adminClient.from("privileged_invitations").update({status:"failed"}).eq("id",invitationId);
      return respond(req,409,{error:"This restaurant does not have an active, verified invitation domain. Activate its restaurant domain before inviting staff."},adminClient);
    }
    const roleLabels:Record<string,string>={cashier:"cashier",kitchen:"kitchen team member",dispatcher:"dispatcher",rider:"delivery rider"};
    const redirectBase=new URL("/restaurant",`https://${hostname}`);
    redirectBase.searchParams.set("type","invite");
    redirectBase.searchParams.set("invite_id",invitationId);
    const {data:sent,error:sendError}=await adminClient.auth.admin.inviteUserByEmail(email,{
      redirectTo:redirectBase.toString(),
      data:{
        first_name:firstName,last_name:lastName,full_name:fullName,name:fullName,phone,phone_number:phone,
        invitation_type:"restaurant_staff",invitation_label:"RESTAURANT TEAM INVITATION",
        invitation_role:roleLabels[role]??"staff member",account_setup:"your staff account",
        restaurant_name:tenant.name,restaurant_slug:tenant.slug,branch_name:branch.name,branch_slug:branch.slug,
        tenant_id:tenantId,tenant_role:role,tenant_invitation_id:invitationId,branch_id:branchId,
      },
    });
    if(sendError||!sent?.user?.id) {
      await adminClient.from("privileged_invitations").update({status:"failed"}).eq("id",invitationId);
      return respond(req,502,{error:"Supabase could not send the invitation email. Check Auth email delivery settings before retrying."},adminClient);
    }
    const {error:finalizeError}=await adminClient.from("privileged_invitations").update({invited_user_id:sent.user.id,status:"sent",sent_at:new Date().toISOString()}).eq("id",invitationId);
    if(finalizeError) return respond(req,500,{error:"The invitation may have been emailed, but its status could not be finalized. Inspect the invitation before retrying."},adminClient);
    return respond(req,200,{success:true,email,role,invitation_id:invitationId,message:"Staff invitation sent."},adminClient);
  } catch(error) {
    console.error("Staff invitation failed:",error instanceof Error?error.message:"unknown error");
    if(invitationId) await adminClient.from("privileged_invitations").update({status:"failed"}).eq("id",invitationId);
    return respond(req,500,{error:"The staff invitation could not be completed."},adminClient);
  }
});
