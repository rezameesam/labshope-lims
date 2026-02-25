import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ConsentPayload = {
  version?: string;
  analytics?: boolean;
  personalization?: boolean;
  ads?: boolean;
};

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

const normalizeCountryCode = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (!COUNTRY_CODE_PATTERN.test(normalized)) {
    return null;
  }
  if (normalized === "XX" || normalized === "ZZ") {
    return null;
  }
  return normalized;
};

const parseCountryFromAcceptLanguage = (acceptLanguage: string | null): string | null => {
  if (!acceptLanguage) {
    return null;
  }

  const locales = acceptLanguage.split(",").map((item) => item.split(";")[0].trim());
  for (const locale of locales) {
    if (!locale) {
      continue;
    }
    const parts = locale.replace(/_/g, "-").split("-");
    for (let index = 1; index < parts.length; index += 1) {
      const candidate = normalizeCountryCode(parts[index]);
      if (candidate) {
        return candidate;
      }
    }
  }
  return null;
};

const resolveCountryName = (countryCode: string | null, countryNameFromBody: unknown): string | null => {
  if (typeof countryNameFromBody === "string" && countryNameFromBody.trim()) {
    return countryNameFromBody.trim();
  }

  if (!countryCode) {
    return null;
  }

  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    return displayNames.of(countryCode) || countryCode;
  } catch {
    return countryCode;
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const eventType = typeof body.event_type === "string" ? body.event_type : "page_view";
    const path = typeof body.path === "string" ? body.path : null;
    const referrer = typeof body.referrer === "string" ? body.referrer : null;
    const consent = typeof body.consent === "object" ? (body.consent as ConsentPayload) : null;

    const forwardedFor = req.headers.get("x-forwarded-for") || "";
    const ip = forwardedFor.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;
    const countryHeader =
      req.headers.get("cf-ipcountry") ||
      req.headers.get("x-vercel-ip-country") ||
      req.headers.get("x-country") ||
      req.headers.get("x-geo-country") ||
      req.headers.get("cloudfront-viewer-country");
    const acceptLanguage = req.headers.get("accept-language");

    const countryCode =
      normalizeCountryCode(body.country_code) ||
      normalizeCountryCode(countryHeader) ||
      parseCountryFromAcceptLanguage(acceptLanguage);
    const countryName = resolveCountryName(countryCode, body.country_name);

    const insertPayload = {
      event_type: eventType,
      path,
      referrer,
      consent,
      ip,
      user_agent: userAgent,
      country_code: countryCode,
      country_name: countryName,
    };
    let { error } = await supabaseAdmin.from("visitor_logs").insert(insertPayload);
    if (error && (String(error.message || "").includes("country_code") || String(error.message || "").includes("country_name"))) {
      const fallbackPayload = {
        event_type: eventType,
        path,
        referrer,
        consent,
        ip,
        user_agent: userAgent,
      };
      const fallbackResult = await supabaseAdmin.from("visitor_logs").insert(fallbackPayload);
      error = fallbackResult.error;
    }

    if (error) {
      console.error("Failed to log visitor:", error);
      return new Response(
        JSON.stringify({ error: "Failed to log visitor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
