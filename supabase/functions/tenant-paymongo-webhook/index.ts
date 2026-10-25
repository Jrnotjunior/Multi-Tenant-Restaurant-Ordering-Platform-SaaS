import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, paymongo-signature","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
function serviceKey(){const values=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");return values.default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";}
function parseSignature(header:string){const parts=Object.fromEntries(header.split(",").map(part=>{const [key,value]=part.trim().split("=",2);return [key,value??""];}));return{timestamp:parts.t??"",test:parts.te??"",live:parts.li??""};}
function hex(bytes:Uint8Array){return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function hmac(secret:string,value:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))));}
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
Deno.serve(async(request)=>{
 if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 try{
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>1_048_576)return json({error:"Webhook payload is too large."},413);
  const payload=JSON.parse(raw);
  const attrs=payload?.data?.attributes??{};
  const eventId=String(payload?.data?.id??"").trim();
  const eventType=String(attrs.type??"unknown").trim();
  const environment=attrs.livemode?"live":"test";
  const organizationId=String(attrs.organization_id??"").trim();
  if(!eventId)return json({error:"Invalid webhook event."},400);
  const url=Deno.env.get("SUPABASE_URL")??"",key=serviceKey();
  if(!url||!key)return json({error:"Server configuration is incomplete."},500);
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  let tenantId:string|null=null,secret="";
  if(organizationId){
    const {data:connection,error}=await admin.from("tenant_paymongo_accounts").select("tenant_id").eq("paymongo_account_id",organizationId).eq("environment",environment).maybeSingle();
    if(error)throw error;
    if(connection?.tenant_id){
      tenantId=String(connection.tenant_id);
      const {data:stored,error:secretError}=await admin.rpc("get_tenant_paymongo_webhook_secret",{p_tenant_id:tenantId,p_environment:environment});
      if(secretError)throw secretError;
      secret=String(stored??"");
    }
  }
  if(!tenantId||!secret)return json({error:"Webhook account is not registered."},401);
  const signature=parseSignature(request.headers.get("Paymongo-Signature")??"");
  if(!signature.timestamp||!/^\d+$/.test(signature.timestamp))return json({error:"Invalid webhook signature."},401);
  const ts=Number(signature.timestamp)*1000;
  if(!Number.isSafeInteger(ts)||Math.abs(Date.now()-ts)>10*60*1000)return json({error:"Webhook signature timestamp is outside the allowed window."},401);
  const provided=environment==="live"?signature.live:signature.test;
  const expected=await hmac(secret,signature.timestamp+"."+raw);
  if(!provided||!safeEqual(expected,provided))return json({error:"Invalid webhook signature."},401);
  const {data:claimed,error:claimError}=await admin.rpc("claim_tenant_paymongo_webhook_event",{p_event_id:eventId,p_tenant_id:tenantId,p_environment:environment,p_event_type:eventType});
  if(claimError)throw claimError;
  if(!claimed)return json({received:true,duplicate:true},200);
  // Finalize only from a verified PayMongo paid event, never from a browser redirect.
  if(eventType==="checkout_session.payment.paid"){
    const resource=attrs.data??{};
    const resourceAttrs=resource.attributes??{};
    const checkoutSessionId=String(resource.id??resourceAttrs.checkout_session_id??"").trim();
    const amount=resourceAttrs.amount;
    if(!checkoutSessionId||typeof amount!=="number"||!Number.isSafeInteger(amount)||amount<=0){
      await admin.from("tenant_paymongo_webhook_events").update({
        status:"failed",last_error:"Paid checkout event missing session ID or valid amount."
      }).eq("event_id",eventId);
      return json({error:"Paid checkout event is missing required payment details."},400);
    }
    const {error:finalizeError}=await admin.rpc("finalize_customer_order_payment",{
      p_tenant_id:tenantId,
      p_environment:environment,
      p_checkout_session_id:checkoutSessionId,
      p_amount_centavos:amount
    });
    if(finalizeError){
      await admin.from("tenant_paymongo_webhook_events").update({
        status:"failed",last_error:"Order payment finalization failed."
      }).eq("event_id",eventId);
      throw finalizeError;
    }
  }
  // Other signed events are recorded but do not mark an order paid.
  const {error:updateError}=await admin.from("tenant_paymongo_webhook_events").update({
    status:"processed",processed_at:new Date().toISOString(),last_error:null
  }).eq("event_id",eventId);
  if(updateError)throw updateError;
  return json({received:true,tenantId,eventType},200);
 }catch(error){console.error("tenant-paymongo-webhook",error);return json({error:"Unable to process PayMongo webhook."},500);}
});