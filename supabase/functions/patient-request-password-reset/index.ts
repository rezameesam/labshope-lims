import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePatientResetUrl, verifyTurnstile } from "../_shared/patient-auth.ts";
import {
  fetchOrganizationBranding,
  fetchScopedSettings,
} from "../_shared/organization-settings.ts";
import { resolvePublicOrganizationId } from "../_shared/public-organization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResetRequest {
  identifier: string;
  turnstile_token?: string;
  organization_id?: string | null;
  hostname?: string | null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { identifier, turnstile_token, organization_id, hostname }: ResetRequest = await req.json();
    const trimmedIdentifier = identifier?.trim();

    if (!trimmedIdentifier) {
      return jsonResponse({ error: "Identifier is required." }, 400);
    }

    const turnstileError = await verifyTurnstile(turnstile_token || "", req);
    if (turnstileError) {
      return jsonResponse({ error: turnstileError }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resolvedOrganizationId = await resolvePublicOrganizationId(
      supabase,
      req,
      organization_id || null,
      hostname || null,
    );

    const { data: patients, error } = await supabase.rpc("find_patient_candidates", {
      p_identifier: trimmedIdentifier,
      p_organization_id: resolvedOrganizationId,
    });

    if (error || !patients || patients.length === 0) {
      return jsonResponse({ success: true }, 200);
    }
    const limitedPatients = patients.slice(0, resolvedOrganizationId ? 1 : 2);
    if (!resolvedOrganizationId && limitedPatients.length !== 1) {
      return jsonResponse({ success: true }, 200);
    }

    const patient = limitedPatients[0];
    if (!patient.email) {
      return jsonResponse({ success: true }, 200);
    }

    const organizationId =
      (patient as { organization_id?: string | null }).organization_id || null;
    const [settingsMap, organizationBranding] = await Promise.all([
      fetchScopedSettings(
        supabaseUrl,
        supabaseServiceKey,
        ["patient_portal_name"],
        organizationId,
      ),
      fetchOrganizationBranding(supabaseUrl, supabaseServiceKey, organizationId),
    ]);
    const businessName =
      organizationBranding?.displayName?.trim() ||
      settingsMap.get("patient_portal_name")?.trim() ||
      "Diagnostic Laboratory";

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    await supabase
      .from("patient_password_resets")
      .delete()
      .eq("patient_id", patient.id)
      .is("used_at", null);

    const { error: insertError } = await supabase
      .from("patient_password_resets")
      .insert({
        patient_id: patient.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

    if (insertError) {
      throw insertError;
    }

    const resetLink = `${resolvePatientResetUrl(req)}?token=${token}`;
    const emailBody = buildResetEmail(patient.full_name, resetLink, businessName);

    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-service-key": supabaseServiceKey,
      },
      body: JSON.stringify({
        to: patient.email,
        subject: `Reset your ${businessName} patient portal password`,
        htmlContent: emailBody,
        organizationId,
      }),
    });

    return jsonResponse({ success: true }, 200);
  } catch (error: any) {
    console.error("Error in patient-request-password-reset:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildResetEmail(name: string, link: string, businessName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <h2 style="color:#0f172a;">Reset your password</h2>
      <p>Hello ${name || "there"},</p>
      <p>We received a request to reset your ${escapeHtml(businessName)} patient portal password.</p>
      <p>
        <a href="${link}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">
          Reset Password
        </a>
      </p>
      <p>If you did not request this, you can ignore this email.</p>
      <p style="font-size:12px;color:#64748b;">This link expires in 1 hour.</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonResponse(payload: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
