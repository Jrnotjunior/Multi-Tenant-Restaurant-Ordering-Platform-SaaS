import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_MAP_SERVICE_ORIGIN = "https://app.web2table.io";
const MAP_SERVICE_ORIGIN = (Deno.env.get("MAP_SERVICE_ORIGIN") || DEFAULT_MAP_SERVICE_ORIGIN).trim();

function json(req: Request, body: unknown, status = 200) {
  const origin = req.headers.get("origin") || "";
  const cors: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "Content-Type": "application/json",
  };
  if (origin === MAP_SERVICE_ORIGIN) cors["Access-Control-Allow-Origin"] = MAP_SERVICE_ORIGIN;
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (origin !== MAP_SERVICE_ORIGIN) {
    return json(req, { error: "Central map configuration is not available from this origin." }, 403);
  }

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": MAP_SERVICE_ORIGIN,
        "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Vary": "Origin",
        "Cache-Control": "no-store",
      },
    });
  }

  if (req.method !== "GET") return json(req, { error: "Method not allowed." }, 405);

  const token = (Deno.env.get("MAPBOX_PUBLIC_TOKEN") || "").trim();
  if (!token) {
    return json(req, { error: "The central map service is not configured yet. Contact Web2Table support." }, 503);
  }
  if (!token.startsWith("pk.")) {
    console.error("MAPBOX_PUBLIC_TOKEN must be a public Mapbox token. No token value was logged.");
    return json(req, { error: "The central map service has an invalid token configuration." }, 503);
  }

  // This is intentionally a public browser token, not a secret token. It is
  // delivered at runtime so it never gets committed inside compiled assets.
  // Restrict its Mapbox scopes and allowed URL to the central map-service origin.
  return json(req, { token, serviceOrigin: MAP_SERVICE_ORIGIN });
});
