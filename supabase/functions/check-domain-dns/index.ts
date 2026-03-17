import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeCname = (value: string) =>
  value.trim().toLowerCase().replace(/\.$/, "");

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const { domain, expected_cname } = await req.json().catch(() => ({}));

    if (!domain || typeof domain !== "string") {
      return jsonResponse({ error: "domain is required." }, 400);
    }

    const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, "");
    const normalizedExpected = expected_cname
      ? normalizeCname(String(expected_cname))
      : null;

    // Query Cloudflare DNS-over-HTTPS for CNAME records
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(normalizedDomain)}&type=CNAME`;
    const dohRes = await fetch(dohUrl, {
      headers: { Accept: "application/dns-json" },
    });

    if (!dohRes.ok) {
      return jsonResponse({ error: "DNS lookup failed.", connected: false, cname: null }, 502);
    }

    const dohData = await dohRes.json();

    // Status 3 = NXDOMAIN, Status 0 = NOERROR
    if (dohData.Status !== 0 || !Array.isArray(dohData.Answer) || dohData.Answer.length === 0) {
      return jsonResponse({ connected: false, cname: null });
    }

    // Find any CNAME answer (type 5)
    const cnameAnswer = dohData.Answer.find((a: { type: number }) => a.type === 5);
    const cname = cnameAnswer ? normalizeCname(cnameAnswer.data as string) : null;

    const connected = normalizedExpected
      ? cname !== null && (cname === normalizedExpected || cname.endsWith(`.${normalizedExpected}`))
      : cname !== null;

    return jsonResponse({ connected, cname });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("check-domain-dns error:", error);
    return jsonResponse({ error: message, connected: false, cname: null }, 500);
  }
});
