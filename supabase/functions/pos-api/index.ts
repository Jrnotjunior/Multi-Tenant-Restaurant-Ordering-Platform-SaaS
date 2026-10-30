import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigins = new Set(["https://app.web2table.io","https://jrnotjunior.github.io","http://localhost:5173","http://127.0.0.1:5173"]);
type Rec = Record<string, unknown>;

function response(req: Request, body: unknown, status = 200, requestId = crypto.randomUUID()) {
  const origin = req.headers.get("Origin") ?? "";
  const headers: Record<string,string> = {
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods":"GET, OPTIONS",
    "Access-Control-Max-Age":"600","Vary":"Origin",
    "Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","X-Request-Id":requestId
  };
  if (allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return new Response(JSON.stringify(body),{status,headers});
}
const err = (code:string,message:string,requestId:string) => ({error:{code,message,requestId}});
function serviceKey():string {
  try { const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}"); return typeof keys.default==="string" ? keys.default : Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""; }
  catch { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??""; }
}
function claims(token:string):Rec|null {
  try { const part=token.split(".")[1]; if(!part)return null; const s=part.replace(/-/g,"+").replace(/_/g,"/"); const parsed:unknown=JSON.parse(atob(s.padEnd(Math.ceil(s.length/4)*4,"="))); return typeof parsed==="object"&&parsed!==null&&!Array.isArray(parsed)?parsed as Rec:null; } catch { return null; }
}
function displayName(user:{user_metadata?:Rec;app_metadata?:Rec}):string {
  const m=user.user_metadata??{};
  const first=typeof m.first_name==="string"?m.first_name.trim():"";
  const last=typeof m.last_name==="string"?m.last_name.trim():"";
  if(first||last)return [first,last].filter(Boolean).join(" ").slice(0,120);
  for(const k of ["full_name","name","display_name"])if(typeof m[k]==="string"&&(m[k] as string).trim())return (m[k] as string).trim().slice(0,120);
  const app=user.app_metadata?.full_name;
  return typeof app==="string"&&app.trim()?app.trim().slice(0,120):"Staff member";
}
const uuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

Deno.serve(async(req:Request)=>{
  const requestId=crypto.randomUUID();
  if(req.method==="OPTIONS")return response(req,{ok:true},200,requestId);
  if(req.method!=="GET")return response(req,err("VALIDATION_ERROR","Only GET requests are supported.",requestId),405,requestId);
  const origin=req.headers.get("Origin");
  if(origin&&!allowedOrigins.has(origin))return response(req,err("FORBIDDEN","This origin is not allowed to access the POS API.",requestId),403,requestId);
  const token=(req.headers.get("Authorization")??"").match(/^Bearer\s+(.+)$/i)?.[1]??"";
  if(!token)return response(req,err("UNAUTHENTICATED","Sign in to access the POS.",requestId),401,requestId);
  const url=Deno.env.get("SUPABASE_URL")??"",key=serviceKey();
  if(!url||!key){console.error(JSON.stringify({event:"pos_api_misconfigured",requestId}));return response(req,err("INTERNAL_ERROR","The POS service is not configured.",requestId),500,requestId);}
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  try {
    const {data:auth,error:authError}=await admin.auth.getUser(token);
    if(authError||!auth.user)return response(req,err("UNAUTHENTICATED","Your session is invalid or expired. Sign in again.",requestId),401,requestId);
    if(claims(token)?.aal!=="aal2")return response(req,err("FORBIDDEN","Complete multi-factor authentication before accessing the POS.",requestId),403,requestId);
    const path=new URL(req.url).pathname;
    const isSession=path.endsWith("/api/pos/v1/session")||path.endsWith("/session");
    const match=path.match(/\/branches\/([^/]+)\/menu$/);
    const isMenu=Boolean(match)&&(path.includes("/api/pos/v1/")||path.includes("/pos-api/"));
    if(!isSession&&!isMenu)return response(req,err("NOT_FOUND","The requested POS endpoint was not found.",requestId),404,requestId);
    // Owners can access active branches in their tenant. Cashiers must have an
    // explicit branch_memberships row; tenant membership alone is insufficient.
    const {data:memberships,error:membershipError}=await admin.from("tenant_memberships").select("tenant_id,role").eq("user_id",auth.user.id).eq("status","active").in("role",["restaurant_owner","cashier"]).limit(50);
    if(membershipError)throw membershipError;
    if(!memberships?.length)return response(req,err("FORBIDDEN","Your account does not have an active owner or cashier POS permission.",requestId),403,requestId);
    const requestedBranch=match?decodeURIComponent(match[1]):"";
    if(isMenu&&!uuid(requestedBranch))return response(req,err("VALIDATION_ERROR","A valid branch identifier is required.",requestId),400,requestId);
    let context:{tenantId:string;tenantName:string;branchId:string;branchName:string}|null=null;
    for(const m of memberships){
      const {data:t,error:te}=await admin.from("tenants").select("id,name").eq("id",m.tenant_id).eq("status","active").maybeSingle();
      if(te)throw te;if(!t)continue;
      let q=admin.from("branches").select("id,tenant_id,name").eq("tenant_id",t.id).eq("is_active",true);
      if(isMenu)q=q.eq("id",requestedBranch);
      if(m.role==="cashier") {
        const {data:assigned,error:assignedError}=await admin.from("branch_memberships").select("branch_id").eq("tenant_id",t.id).eq("user_id",auth.user.id);
        if(assignedError)throw assignedError;
        const branchIds=(assigned??[]).map((row:Rec)=>row.branch_id).filter((id):id is string=>typeof id==="string");
        if(!branchIds.length)continue;
        q=q.in("id",branchIds);
      }
      const {data:b,error:be}=await q.order("created_at",{ascending:true}).limit(1).maybeSingle();
      if(be)throw be;
      if(b){context={tenantId:t.id,tenantName:t.name,branchId:b.id,branchName:b.name};break;}
    }
    if(!context)return response(req,err(isMenu?"NOT_FOUND":"FORBIDDEN",isMenu?"The requested branch is unavailable or not authorized.":"No active branch is available for your restaurant account.",requestId),isMenu?404:403,requestId);
    const role=memberships.find((m:Rec)=>m.tenant_id===context!.tenantId)?.role;
    if(isSession)return response(req,{data:{userId:auth.user.id,displayName:displayName(auth.user),tenantId:context.tenantId,tenantName:context.tenantName,branchId:context.branchId,branchName:context.branchName,role,permissions:["pos.session.read","pos.menu.read"]},requestId},200,requestId);
    const {data:rows,error:menuError}=await admin.from("menu_items")
      .select("id,category_id,name,description,price_centavos,menu_categories!inner(id,name,is_published),branch_menu_items!inner(is_available,price_override_centavos,tenant_id,branch_id)")
      .eq("tenant_id",context.tenantId).eq("status","published").eq("menu_categories.is_published",true)
      .eq("branch_menu_items.tenant_id",context.tenantId).eq("branch_menu_items.branch_id",context.branchId)
      .eq("branch_menu_items.is_available",true).order("name",{ascending:true}).limit(200);
    if(menuError)throw menuError;
    const data=(rows??[]).map((item:Rec)=>{
      const cat=Array.isArray(item.menu_categories)?item.menu_categories[0] as Rec:item.menu_categories as Rec;
      const branchRows=Array.isArray(item.branch_menu_items)?item.branch_menu_items:[];
      const branch=branchRows[0] as Rec|undefined;
      const price=typeof branch?.price_override_centavos==="number"?branch.price_override_centavos:item.price_centavos;
      return {id:item.id,categoryId:item.category_id,categoryName:typeof cat?.name==="string"?cat.name:"",name:item.name,description:typeof item.description==="string"?item.description:"",unitPriceCentavos:price,available:true};
    }).filter((i:Rec)=>typeof i.id==="string"&&typeof i.categoryId==="string"&&typeof i.categoryName==="string"&&i.categoryName.length>0&&typeof i.name==="string"&&Number.isSafeInteger(i.unitPriceCentavos)&&Number(i.unitPriceCentavos)>=0);
    return response(req,{data,requestId},200,requestId);
  }catch(e){
    console.error(JSON.stringify({event:"pos_api_request_failed",requestId,message:e instanceof Error?e.message:"unknown_error"}));
    return response(req,err("INTERNAL_ERROR","The POS service could not complete the request.",requestId),500,requestId);
  }
});
