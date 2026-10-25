import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
function serviceKey(){try{const values=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")??"{}");return values.default??Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";}catch{return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";}}
function paymongoKey(environment:string){const explicit=Deno.env.get(environment==="live"?"PAYMONGO_LIVE_SECRET_KEY":"PAYMONGO_TEST_SECRET_KEY");const fallback=Deno.env.get("PAYMONGO_SECRET_KEY")??"";return explicit??(fallback.startsWith(environment==="live"?"sk_live_":"sk_test_")?fallback:"");}
const basic=(key:string)=>"Basic "+btoa(key+":");

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")??"",key=serviceKey(),authorization=req.headers.get("Authorization")??"";
  if(!url||!key)return json({error:"Payment service is not configured."},500);
  if(!authorization.startsWith("Bearer "))return json({error:"Owner sign-in required."},401);
  const userClient=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")??"",{global:{headers:{Authorization:authorization}},auth:{autoRefreshToken:false,persistSession:false}});
  const {data:userData,error:userError}=await userClient.auth.getUser();
  if(userError||!userData.user)return json({error:"Owner sign-in required."},401);
  const body=await req.json().catch(()=>({}));
  const tenantId=String(body.tenantId??"").trim(),orderId=String(body.orderId??"").trim();
  const reason=String(body.reason??"requested_by_customer").trim();
  if(!/^[0-9a-f-]{36}$/i.test(tenantId)||!/^[0-9a-f-]{36}$/i.test(orderId))return json({error:"A valid tenant and order are required."},400);
  const allowedReasons=["requested_by_customer","duplicate","fraudulent","other"];
  if(!allowedReasons.includes(reason))return json({error:"Choose a supported refund reason."},400);
  const {data:requestData,error:requestError}=await userClient.rpc("request_customer_order_refund",{p_tenant_id:tenantId,p_order_id:orderId,p_reason:reason});
  if(requestError) return json({error:requestError.message||"Refund request was not authorized."},403);
  const refund=requestData as {payment_session_id:string;environment:string;paymongo_account_id:string;paymongo_payment_id:string;amount_centavos:number;reason:string};
  if(!refund?.paymongo_payment_id||!refund.payment_session_id)return json({error:"The payment reference is missing; contact support for manual review."},409);
  const secret=paymongoKey(refund.environment);
  if(!secret)return json({error:"PayMongo "+refund.environment+" mode is not configured."},409);
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  let response:Response;
  try{
   response=await fetch("https://api.paymongo.com/v1/refunds",{
    method:"POST",
    headers:{Authorization:basic(secret),"Content-Type":"application/json","Account-ID":refund.paymongo_account_id,"Idempotency-Key":"w2t-refund-"+refund.payment_session_id},
    body:JSON.stringify({data:{attributes:{amount:Number(refund.amount_centavos),payment_id:refund.paymongo_payment_id,reason:refund.reason}}})
   });
  }catch{
   return json({success:false,status:"refund_pending",message:"The refund request may have reached PayMongo, but the response was interrupted. Check the payment provider before retrying."},202);
  }
  const result=await response.json().catch(()=>null);
  if(!response.ok){
   await admin.from("customer_order_payment_sessions").update({status:"paid",refund_reason:null,updated_at:new Date().toISOString()})
    .eq("tenant_id",tenantId).eq("id",refund.payment_session_id).eq("status","refund_pending");
   const detail=typeof result?.errors?.[0]?.detail==="string"?result.errors[0].detail:"PayMongo rejected the refund request.";
   return json({error:detail,status:"paid"},502);
  }
  const refundId=String(result?.data?.id??"").trim();
  const attributes=result?.data?.attributes??{};
  const status=String(attributes.status??"pending").toLowerCase();
  const refundedAmount=Number(attributes.amount);
  if(!refundId)return json({success:false,status:"refund_pending",message:"PayMongo accepted the request but did not return a refund reference. Verify the provider dashboard."},202);
  await admin.from("customer_order_payment_sessions").update({refund_id:refundId,updated_at:new Date().toISOString()})
    .eq("tenant_id",tenantId).eq("id",refund.payment_session_id).eq("status","refund_pending");
  if(status==="succeeded"&&Number.isSafeInteger(refundedAmount)&&refundedAmount===Number(refund.amount_centavos)){
   const {error:finalizeError}=await admin.rpc("finalize_customer_order_refund",{p_tenant_id:tenantId,p_payment_session_id:refund.payment_session_id,p_refund_id:refundId,p_refunded_amount_centavos:refundedAmount});
   if(finalizeError)throw finalizeError;
   return json({success:true,status:"refunded",refundId});
  }
  return json({success:true,status:"refund_pending",refundId,message:"Refund request accepted by PayMongo and is pending confirmation."},202);
 }catch(error){console.error("refund-customer-order",error);return json({error:"Unable to confirm refund status. Check the payment provider before retrying."},500);}
});
