import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

export const PATIENT_AUTH_DOMAIN =
  Deno.env.get("PATIENT_AUTH_DOMAIN")?.trim() || "patients.irmclinic.local";
export const PATIENT_PASSWORD_MIN_LENGTH = 6;

const LOCAL_ORIGIN_PATTERN = /^(https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?|https?:\/\/[a-z0-9-]+\.localhost(:\d+)?|https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?)$/i;
const LOCAL_HOSTNAME_PATTERN = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|[a-z0-9-]+\.localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/i;

export function buildPatientAuthEmail(patientId: string): string {
  const normalizedId = patientId.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return `patient-${normalizedId}@${PATIENT_AUTH_DOMAIN}`;
}

export function getPatientPasswordError(password: string): string | null {
  const value = password || "";

  if (value.length < PATIENT_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PATIENT_PASSWORD_MIN_LENGTH} characters.`;
  }

  return null;
}

export async function verifyTurnstile(
  token: string,
  req: Request,
  explicitHostname?: string | null
): Promise<string | null> {
  const origin = resolveRequestOrigin(req);
  if ((origin && isLocalOrigin(origin)) || isLocalHostname(explicitHostname || "")) {
    return null;
  }

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    return null;
  }

  if (!token) {
    return "Security check failed. Please try again.";
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);

  const forwardedFor = req.headers.get("x-forwarded-for") || "";
  if (forwardedFor) {
    formData.append("remoteip", forwardedFor.split(",")[0].trim());
  }

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    return "Security check unavailable. Please try again.";
  }

  const result = await response.json();
  if (!result.success) {
    return "Security check failed. Please try again.";
  }

  return null;
}

export function resolvePatientResetUrl(req: Request, overrideBaseUrl?: string): string {
  const configured = overrideBaseUrl?.trim()
    ? overrideBaseUrl
    : Deno.env.get("PATIENT_PORTAL_RESET_URL") ||
      Deno.env.get("PATIENT_RESET_PASSWORD_URL") ||
      Deno.env.get("PATIENT_PORTAL_URL") ||
      Deno.env.get("SITE_URL") ||
      "";

  if (configured.trim()) {
    return normalizeResetUrl(configured);
  }

  const origin = resolveRequestOrigin(req);
  if (origin && isLocalOrigin(origin)) {
    return normalizeResetUrl(`${origin}/patient/reset-password`);
  }

  throw new Error("Patient reset URL is not configured.");
}

export async function getAuthenticatedUserFromRequest(req: Request): Promise<{ user: User; token: string; sessionId: string | null }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";

  if (!supabaseUrl || !anonKey) {
    throw new Error("Server configuration missing.");
  }

  const token = extractBearerToken(authHeader);
  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return {
    user: data.user,
    token,
    sessionId: extractSessionIdFromAccessToken(token),
  };
}

function resolveRequestOrigin(req: Request): string | null {
  const headerValue = req.headers.get("origin") || req.headers.get("referer") || "";
  if (!headerValue) {
    return null;
  }

  try {
    return new URL(headerValue).origin;
  } catch {
    return null;
  }
}

function isLocalOrigin(origin: string): boolean {
  return LOCAL_ORIGIN_PATTERN.test(origin);
}

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAME_PATTERN.test((hostname || "").trim().toLowerCase());
}

function normalizeResetUrl(rawValue: string): string {
  const url = new URL(rawValue.trim());
  const normalizedPath = url.pathname.replace(/\/+$/, "");

  if (normalizedPath.endsWith("/patient/reset-password")) {
    url.pathname = normalizedPath;
  } else {
    url.pathname = `${normalizedPath}/patient/reset-password`.replace(/\/+/g, "/");
  }

  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function extractBearerToken(authHeader: string): string | null {
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token || null;
}

function extractSessionIdFromAccessToken(accessToken: string): string | null {
  try {
    const tokenParts = accessToken.split(".");
    if (tokenParts.length < 2) {
      return null;
    }

    const payload = tokenParts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded));
    return typeof parsed?.session_id === "string" && parsed.session_id.length > 0
      ? parsed.session_id
      : null;
  } catch {
    return null;
  }
}
