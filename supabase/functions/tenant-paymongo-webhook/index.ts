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
  // Platform-owned test checkout sessions use one dashboard webhook signing secret.
  // The tenant/order association is still verified by the signed event metadata and payment-session RPC.
  const resourceForLookup=attrs.data??{};
  const resourceAttrsForLookup=resourceForLookup.attributes??{};
  const metadataTenantId=String(resourceAttrsForLookup.metadata?.tenant_id??"").trim();
  const platformTestSecret=Deno.env.get("PAYMONGO_TEST_WEBHOOK_SECRET")??"";
  const platformTest=environment==="test"&&!tenantId&&!!platformTestSecret&&/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(metadataTenantId);
  if(platformTest){tenantId=metadataTenantId;secret=platformTestSecret;}
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
  // Only signed provider events can change payment state; browser redirects are informational only.
  if(eventType==="checkout_session.payment.paid"||eventType==="checkout_session.payment.failed"){
    const resource=attrs.data??{};
    const resourceAttrs=resource.attributes??{};
    const checkoutSessionId=String(resource.id??resourceAttrs.checkout_session_id??"").trim();
    if(!checkoutSessionId){
      await admin.from("tenant_paymongo_webhook_events").update({status:"failed",last_error:"Checkout event missing session ID."}).eq("event_id",eventId);
      return json({error:"Checkout event is missing its session ID."},400);
    }
    if(eventType==="checkout_session.payment.failed"){
      const {error:failureError}=await admin.rpc("finalize_customer_order_payment_failure",{
        p_tenant_id:tenantId,p_environment:environment,p_checkout_session_id:checkoutSessionId
      });
      if(failureError){
        await admin.from("tenant_paymongo_webhook_events").update({status:"failed",last_error:"Order payment failure update failed."}).eq("event_id",eventId);
        throw failureError;
      }
    }else{
      const amount=resourceAttrs.amount;
      if(typeof amount!=="number"||!Number.isSafeInteger(amount)||amount<=0){
        await admin.from("tenant_paymongo_webhook_events").update({status:"failed",last_error:"Paid checkout event missing valid amount."}).eq("event_id",eventId);
        return json({error:"Paid checkout event is missing a valid amount."},400);
      }
      const payments=Array.isArray(resourceAttrs.payments)?resourceAttrs.payments:[];
      const paymentId=String(payments[0]?.id??payments[0]?.data?.id??"").trim();
      const {error:referenceError}=await admin.from("customer_order_payment_sessions").update({
        ...(paymentId?{paymongo_payment_id:paymentId}:{}),updated_at:new Date().toISOString()
      }).eq("tenant_id",tenantId).eq("environment",environment).eq("checkout_session_id",checkoutSessionId);
      if(referenceError)throw referenceError;
      const {error:finalizeError}=await admin.rpc("finalize_customer_order_payment",{
        p_tenant_id:tenantId,p_environment:environment,p_checkout_session_id:checkoutSessionId,p_amount_centavos:amount
      });
      if(finalizeError){
        await admin.from("tenant_paymongo_webhook_events").update({status:"failed",last_error:"Order payment finalization failed."}).eq("event_id",eventId);
        throw finalizeError;
      }
    }
  }
  if(["refund.updated","refund.succeeded","refund.failed"].includes(eventType)){
    const refundResource=attrs.data??{};
    const refundAttributes=refundResource.attributes??{};
    const refundId=String(refundResource.id??"").trim();
    // Some provider events carry the final state in the event type rather than attributes.status.
    const eventStatus=eventType==="refund.succeeded"?"succeeded":eventType==="refund.failed"?"failed":"";
    const refundStatus=String(refundAttributes.status??eventStatus).toLowerCase();
    const refundAmount=refundAttributes.amount;
    if(refundId){
      const {data:refundSession,error:refundLookupError}=await admin.from("customer_order_payment_sessions")
        .select("id,tenant_id,amount_centavos,status").eq("tenant_id",tenantId).eq("refund_id",refundId).maybeSingle();
      if(refundLookupError)throw refundLookupError;
      if(refundSession?.status==="refund_pending"&&refundStatus==="succeeded"){
        if(typeof refundAmount!=="number"||!Number.isSafeInteger(refundAmount)||refundAmount!==Number(refundSession.amount_centavos)){
          await admin.from("tenant_paymongo_webhook_events").update({status:"failed",last_error:"Refund amount did not match the requested full refund."}).eq("event_id",eventId);
          return json({error:"Refund amount mismatch."},400);
        }
        const {error:refundFinalizeError}=await admin.rpc("finalize_customer_order_refund",{
          p_tenant_id:tenantId,p_payment_session_id:refundSession.id,p_refund_id:refundId,p_refunded_amount_centavos:refundAmount
        });
        if(refundFinalizeError)throw refundFinalizeError;
      }else if(refundSession?.status==="refund_pending"&&["failed","canceled","cancelled"].includes(refundStatus)){
        const {error:refundResetError}=await admin.from("customer_order_payment_sessions").update({
          status:"paid",refund_reason:null,updated_at:new Date().toISOString()
        }).eq("tenant_id",tenantId).eq("id",refundSession.id).eq("status","refund_pending");
        if(refundResetError)throw refundResetError;
      }
    }
  }
  const {error:updateError}=await admin.from("tenant_paymongo_webhook_events").update({
    status:"processed",processed_at:new Date().toISOString(),last_error:null
  }).eq("event_id",eventId);
  if(updateError)throw updateError;
  return json({received:true,tenantId,eventType},200);
 }catch(error){console.error("tenant-paymongo-webhook",error);return json({error:"Unable to process PayMongo webhook."},500);}
});