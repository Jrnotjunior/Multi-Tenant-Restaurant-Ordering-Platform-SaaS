import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function serviceKey() {
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    return values.default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  } catch {
    return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  }
}

function routingBaseUrl() {
  // The public OSRM demo is a development fallback only. Configure ROUTING_BASE_URL
  // to a self-hosted OSRM/compatible service before production; public demo servers
  // have usage policies and no production SLA.
  const configured = (Deno.env.get("ROUTING_BASE_URL") ?? "https://router.project-osrm.org").trim();
  const url = new URL(configured);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("The routing service must use HTTPS.");
  }
  return url.toString().replace(/\/$/, "");
}

async function drivingDistance(originLongitude: number, originLatitude: number, destinationLongitude: number, destinationLatitude: number) {
  const coordinates = [originLongitude, originLatitude, destinationLongitude, destinationLatitude];
  if (!coordinates.every(Number.isFinite)) throw new Error("Choose a valid delivery location on the map.");
  const url = new URL(
    `${routingBaseUrl()}/route/v1/driving/${originLongitude},${originLatitude};${destinationLongitude},${destinationLatitude}`,
  );
  url.searchParams.set("overview", "false");
  url.searchParams.set("alternatives", "false");
  url.searchParams.set("steps", "false");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => null);
  const distance = Number(body?.routes?.[0]?.distance);
  if (!response.ok || body?.code !== "Ok" || !Number.isFinite(distance) || distance <= 0) {
    throw new Error("A driving route could not be calculated. Choose another map location.");
  }
  return distance;
}

async function quote(admin: any, slug: string, latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error("Choose a valid delivery location on the map.");
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants").select("id,status").eq("slug", slug).maybeSingle();
  if (tenantError) throw tenantError;
  if (!tenant || tenant.status !== "active") throw new Error("This restaurant is unavailable.");

  const { data: storefront, error: storefrontError } = await admin
    .from("tenant_storefronts")
    .select("status,delivery_pricing,delivery_location_latitude,delivery_location_longitude")
    .eq("tenant_id", tenant.id).maybeSingle();
  if (storefrontError) throw storefrontError;
  if (!storefront || storefront.status !== "published") throw new Error("This restaurant is not accepting online orders.");

  const originLatitude = Number(storefront.delivery_location_latitude);
  const originLongitude = Number(storefront.delivery_location_longitude);
  if (storefront.delivery_location_latitude === null || storefront.delivery_location_longitude === null ||
      !Number.isFinite(originLatitude) || !Number.isFinite(originLongitude)) {
    throw new Error("The restaurant has not configured its delivery location yet.");
  }

  const pricing = storefront.delivery_pricing ?? {};
  const baseFee = Number(pricing.base_fee);
  const incrementMeters = Number(pricing.distance_increment_meters);
  const feePerIncrement = Number(pricing.fee_per_increment);
  const maxDistanceMeters = Number(pricing.max_distance_meters);
  if (![baseFee, incrementMeters, feePerIncrement, maxDistanceMeters].every(Number.isFinite) ||
      baseFee < 0 || incrementMeters <= 0 || feePerIncrement < 0 || maxDistanceMeters <= 0) {
    throw new Error("The restaurant delivery pricing is incomplete.");
  }

  const distanceMeters = await drivingDistance(originLongitude, originLatitude, longitude, latitude);
  if (distanceMeters > maxDistanceMeters) {
    throw new Error("This address is outside the restaurant delivery area (" +
      (maxDistanceMeters / 1000).toFixed(1) + " km maximum driving distance).");
  }

  return {
    feeCentavos: Math.round((baseFee + Math.ceil(distanceMeters / incrementMeters) * feePerIncrement) * 100),
    distanceMeters: Math.round(distanceMeters),
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const key = serviceKey();
    if (!supabaseUrl || !key) return json({ error: "Delivery pricing service is not configured." }, 500);

    const admin = createClient(supabaseUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await request.json();
    const slug = String(body.restaurantSlug ?? "").trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 3 || slug.length > 64) {
      return json({ error: "Choose a valid restaurant." }, 400);
    }

    const result = await quote(admin, slug, Number(body.latitude), Number(body.longitude));
    return json({ success: true, feeCentavos: result.feeCentavos, distanceMeters: result.distanceMeters });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to calculate delivery pricing.";
    const status = message === "The routing service must use HTTPS." ? 500 : 400;
    return json({ error: message }, status);
  }
});
