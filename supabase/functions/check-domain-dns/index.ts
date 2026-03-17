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

// Try Deno native DNS first, fall back to Google DoH, then Cloudflare DoH
const resolveCname = async (domain: string): Promise<string | null> => {
  // Attempt 1: Deno native DNS resolution
  try {
    const records = await Deno.resolveDns(domain, "CNAME");
    if (records && records.length > 0) {
      return normalizeCname(records[0]);
    }
  } catch {
    // fall through to DoH
  }

  // Attempt 2: Google DoH
  try {
    const googleRes = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=CNAME`,
      { headers: { Accept: "application/dns-json" } }
    );
    if (googleRes.ok) {
      const data = await googleRes.json();
      if (data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0) {
        const cnameAnswer = data.Answer.find((a: { type: number }) => a.type === 5);
        if (cnameAnswer) return normalizeCname(cnameAnswer.data as string);
      }
    }
  } catch {
    // fall through to Cloudflare DoH
  }

  // Attempt 3: Cloudflare DoH
  try {
    const cfRes = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=CNAME`,
      { headers: { Accept: "application/dns-json" } }
    );
    if (cfRes.ok) {
      const data = await cfRes.json();
      if (data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0) {
        const cnameAnswer = data.Answer.find((a: { type: number }) => a.type === 5);
        if (cnameAnswer) return normalizeCname(cnameAnswer.data as string);
      }
    }
  } catch {
    // all methods failed
  }

  return null;
};

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

    const cname = await resolveCname(normalizedDomain);

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
