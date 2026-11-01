import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigin = "https://app.web2table.io";
const endpoint = "https://portal.georisk.gov.ph/arcgis/rest/services/PSA/Barangay/MapServer/4/query";

function jsonResponse(body: unknown, status: number, origin: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=3600",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin === allowedOrigin) headers["Access-Control-Allow-Origin"] = allowedOrigin;
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin === allowedOrigin ? allowedOrigin : "null",
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);
  if (origin && origin !== allowedOrigin) return jsonResponse({ error: "Origin not allowed" }, 403, origin);

  let body: { latitude?: unknown; longitude?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
  }

  const latitude = body.latitude;
  const longitude = body.longitude;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < 4 || latitude > 22
    || typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < 116 || longitude > 127) {
    return jsonResponse({ error: "Coordinates must be within the Philippines." }, 400, origin);
  }

  const params = new URLSearchParams({
    f: "json",
    geometry: JSON.stringify({ x: longitude, y: latitude, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "brgy_name,city_name,prov_name,reg_name,brgy_code,psgc_10d",
    returnGeometry: "false",
    outSR: "4326",
  });

  try {
    const upstream = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(7000),
    });
    if (!upstream.ok) return jsonResponse({ error: "Barangay boundary service unavailable" }, 502, origin);
    const data = await upstream.json();
    if (data.error) return jsonResponse({ error: "Barangay boundary lookup failed" }, 502, origin);
    const features = Array.isArray(data.features) ? data.features : [];
    const attributes = features[0]?.attributes;
    if (!attributes?.brgy_name) return jsonResponse({ barangay: null, matched: false, source: "PSA indicative boundaries (2016)" }, 200, origin);

    return jsonResponse({
      barangay: String(attributes.brgy_name),
      city: String(attributes.city_name ?? ""),
      province: String(attributes.prov_name ?? ""),
      region: String(attributes.reg_name ?? ""),
      psgcCode: String(attributes.psgc_10d ?? attributes.brgy_code ?? ""),
      matched: true,
      source: "PSA indicative boundaries (2016)",
      boundaryDate: "2016-06",
    }, 200, origin);
  } catch {
    return jsonResponse({ error: "Barangay boundary service timed out" }, 504, origin);
  }
});
