import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchOrganizationAbdmConfig,
  requestAbdmSessionToken,
  type AbdmConfig,
} from "../_shared/abdm-settings.ts";
import { resolveOrganizationIdentity } from "../_shared/organization-settings.ts";
// @ts-expect-error node:crypto available in Supabase Edge Runtime (Deno 1.40+)
import { publicEncrypt, constants } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Certificate cache (6-hour TTL) ──────────────────────────────────────────

let certCache: { pem: string; fetchedAt: number } | null = null;
const CERT_TTL_MS = 6 * 60 * 60 * 1000;

const ABHA_BASE_SANDBOX = "https://abhasbx.abdm.gov.in";
const ABHA_BASE_PROD    = "https://abha.abdm.gov.in";

function abhaBase(env: string): string {
  return env === "production" ? ABHA_BASE_PROD : ABHA_BASE_SANDBOX;
}

async function fetchAbdmCert(config: AbdmConfig): Promise<string> {
  const now = Date.now();
  if (certCache && now - certCache.fetchedAt < CERT_TTL_MS) {
    return certCache.pem;
  }
  const env = config.environment || "sandbox";
  const url = `${abhaBase(env)}/abha/api/v3/profile/public/certificate`;

  // Cert endpoint requires a gateway Bearer token
  const sessionResult = await requestAbdmSessionToken(config);
  if (!sessionResult.success || !sessionResult.accessToken) {
    throw new Error(`Failed to get ABDM gateway token for cert fetch: ${sessionResult.error}`);
  }

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${sessionResult.accessToken}`,
      "X-CM-ID": config.cmId || "sbx",
      "REQUEST-ID": crypto.randomUUID(),
      "TIMESTAMP": new Date().toISOString(),
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ABDM cert: ${res.status}`);
  const body = await res.json();
  // Response: { publicKey: "-----BEGIN CERTIFICATE-----..." }
  const pem: string = body.publicKey || body.certificate || body.cert || body;
  certCache = { pem, fetchedAt: now };
  return pem;
}

function encryptWithCert(plaintext: string, certPem: string): string {
  const encrypted = publicEncrypt(
    { key: certPem, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(plaintext, "utf8"),
  );
  return encrypted.toString("base64");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const normalizeText = (v?: string | null) => v?.trim() || null;

// Fetch ABHA profile using the X-Token returned after a successful auth/login.
async function fetchProfile(baseUrl: string, xToken: string | null): Promise<any> {
  if (!xToken) return {};
  try {
    const res = await fetch(`${baseUrl}/abha/api/v3/profile/account`, {
      headers: {
        "X-Token": xToken,
        "REQUEST-ID": crypto.randomUUID(),
        "TIMESTAMP": new Date().toISOString(),
      },
    });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
  const anonKey         = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin   = createClient(supabaseUrl, serviceRoleKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const body = await req.json();
    const action: string = body.action;

    const identity = await resolveOrganizationIdentity({
      supabaseUrl,
      supabaseAnonKey: anonKey,
      serviceRoleKey,
      authHeader,
      organizationId: normalizeText(body.organization_id),
    });

    if (!identity.userId) return json({ error: "Invalid authentication token" }, 401);
    if (!identity.organizationId) return json({ error: "Staff user is not linked to an active organization" }, 403);

    const organizationId = identity.organizationId;
    const userId = identity.userId;

    const config = await fetchOrganizationAbdmConfig(supabaseUrl, serviceRoleKey, organizationId);
    if (!config.enabled) return json({ error: "ABDM is not enabled for this organization." }, 403);

    const env = config.environment || "sandbox";

    // ── get_cert ──────────────────────────────────────────────────────────────
    if (action === "get_cert") {
      const pem = await fetchAbdmCert(config);
      return json({ cert_pem: pem });
    }

    // ── send_otp ──────────────────────────────────────────────────────────────
    if (action === "send_otp") {
      const aadhaar = normalizeText(body.aadhaar);
      if (!aadhaar || !/^\d{12}$/.test(aadhaar)) {
        return json({ error: "A valid 12-digit Aadhaar number is required." }, 400);
      }

      const certPem = await fetchAbdmCert(config);
      const encryptedAadhaar = encryptWithCert(aadhaar, certPem);

      const otpUrl = `${abhaBase(env)}/abha/api/v3/enrollment/request/otp`;
      const otpRes = await fetch(otpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString(), "X-CM-ID": config.cmId || "sbx" },
        body: JSON.stringify({
          otpSystem: "aadhaar",
          loginHint: "aadhaar",
          loginId: encryptedAadhaar,
          scope: "abha-enrol",
        }),
      });

      const otpBody = await otpRes.json().catch(() => ({}));
      if (!otpRes.ok) {
        return json({ error: otpBody?.message || otpBody?.details || `ABDM OTP request failed (${otpRes.status})` }, 502);
      }

      const txnId: string = otpBody.txnId;
      if (!txnId) return json({ error: "ABDM did not return a transaction ID." }, 502);

      const { data: session, error: sessionError } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .insert({ organization_id: organizationId, user_id: userId, txn_id: txnId, status: "otp_sent" })
        .select("id")
        .single();

      if (sessionError || !session) throw sessionError || new Error("Failed to create enrollment session");

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId,
        user_id: userId,
        request_type: "abha_enrollment_otp",
        request_status: "success",
        request_payload: { scope: "abha-enrol", txnId },
      });

      return json({ session_id: (session as { id: string }).id });
    }

    // ── verify_otp ────────────────────────────────────────────────────────────
    if (action === "verify_otp") {
      const sessionId = normalizeText(body.session_id);
      const otp       = normalizeText(body.otp);
      if (!sessionId) return json({ error: "session_id is required." }, 400);
      if (!otp || !/^\d{6}$/.test(otp)) return json({ error: "A valid 6-digit OTP is required." }, 400);

      const { data: session, error: fetchErr } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("organization_id", organizationId)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (fetchErr || !session) return json({ error: "Enrollment session not found or expired." }, 404);

      const certPem = await fetchAbdmCert(config);
      const encryptedOtp = encryptWithCert(otp, certPem);

      const verifyUrl = `${abhaBase(env)}/abha/api/v3/enrollment/enrol/byAadhaar`;
      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString(), "X-CM-ID": config.cmId || "sbx" },
        body: JSON.stringify({
          authData: {
            authMethods: ["otp"],
            otp: { txnId: (session as any).txn_id, otpValue: encryptedOtp },
          },
          consent: { code: "abha-enrollment", version: "1.4" },
        }),
      });

      const verifyBody = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        await supabaseAdmin.from("abdm_enrollment_sessions").update({ status: "failed", error_message: verifyBody?.message || `HTTP ${verifyRes.status}`, updated_at: new Date().toISOString() }).eq("id", sessionId);
        return json({ error: verifyBody?.message || verifyBody?.details || `OTP verification failed (${verifyRes.status})` }, 502);
      }

      // Extract T-token from response header (ABDM returns it as "T-token" header)
      const tToken = verifyRes.headers.get("T-token") || verifyRes.headers.get("t-token") || verifyBody.tokens?.token || null;
      const abhaNumber = String(verifyBody.ABHANumber || verifyBody.abhaNumber || "");
      const fullName   = verifyBody.name || verifyBody.fullName || "";
      const gender     = verifyBody.gender || "";
      const dob        = verifyBody.dateOfBirth || verifyBody.dob || "";
      const mobile     = verifyBody.mobile || verifyBody.mobileNumber || "";

      await supabaseAdmin.from("abdm_enrollment_sessions").update({
        t_token: tToken,
        abha_number: abhaNumber || null,
        full_name: fullName || null,
        gender: gender || null,
        date_of_birth: dob || null,
        mobile: mobile || null,
        status: "otp_verified",
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId,
        user_id: userId,
        request_type: "abha_enrollment_verify",
        request_status: "success",
        abha_number: abhaNumber || null,
        request_payload: { txnId: (session as any).txn_id },
        response_payload: { abha_number: abhaNumber, full_name: fullName, gender, dob, mobile },
      });

      return json({ session_id: sessionId, abha_number: abhaNumber, full_name: fullName, gender, date_of_birth: dob, mobile });
    }

    // ── get_suggestions ───────────────────────────────────────────────────────
    if (action === "get_suggestions") {
      const sessionId = normalizeText(body.session_id);
      if (!sessionId) return json({ error: "session_id is required." }, 400);

      const { data: session, error: fetchErr } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("organization_id", organizationId)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (fetchErr || !session) return json({ error: "Enrollment session not found or expired." }, 404);
      if (!(session as any).t_token) return json({ error: "OTP must be verified before fetching suggestions." }, 400);

      const suggestUrl = `${abhaBase(env)}/abha/api/v3/enrollment/enrol/suggestion`;
      const suggestRes = await fetch(suggestUrl, {
        headers: { "Authorization": `Bearer ${(session as any).t_token}`, "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString() },
      });

      const suggestBody = await suggestRes.json().catch(() => ({}));
      if (!suggestRes.ok) {
        return json({ error: suggestBody?.message || `Suggestion fetch failed (${suggestRes.status})` }, 502);
      }

      const suggestions: string[] = (suggestBody.abhaAddressList || suggestBody.suggestions || []);

      await supabaseAdmin.from("abdm_enrollment_sessions").update({
        suggested_addresses: suggestions,
        status: "suggestions_fetched",
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      return json({ session_id: sessionId, suggestions });
    }

    // ── set_address ───────────────────────────────────────────────────────────
    if (action === "set_address") {
      const sessionId   = normalizeText(body.session_id);
      const abhaAddress = normalizeText(body.abha_address);
      const patientId   = normalizeText(body.patient_id);
      if (!sessionId)   return json({ error: "session_id is required." }, 400);
      if (!abhaAddress) return json({ error: "abha_address is required." }, 400);

      const { data: session, error: fetchErr } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("organization_id", organizationId)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (fetchErr || !session) return json({ error: "Enrollment session not found or expired." }, 404);
      if (!(session as any).t_token) return json({ error: "OTP must be verified before setting address." }, 400);

      const setUrl = `${abhaBase(env)}/abha/api/v3/enrollment/enrol/abha-address`;
      const setRes = await fetch(setUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${(session as any).t_token}`, "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString() },
        body: JSON.stringify({ abhaAddress }),
      });

      const setBody = await setRes.json().catch(() => ({}));
      if (!setRes.ok) {
        return json({ error: setBody?.message || `Set address failed (${setRes.status})` }, 502);
      }

      const finalAddress: string = setBody.abhaAddress || setBody.preferredAbhaAddress || abhaAddress;
      const abhaNumber: string   = (session as any).abha_number || setBody.ABHANumber || "";

      await supabaseAdmin.from("abdm_enrollment_sessions").update({
        abha_address: finalAddress,
        status: "address_set",
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      // Optionally update the patient record
      if (patientId) {
        await supabaseAdmin.from("patients").update({
          abha_number: abhaNumber || null,
          abha_address: finalAddress,
          abdm_link_status: "verified",
          abdm_source: "abha_enrollment",
          abdm_linked_at: new Date().toISOString(),
          abdm_last_verified_at: new Date().toISOString(),
        }).eq("id", patientId).eq("organization_id", organizationId);
      }

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId,
        user_id: userId,
        patient_id: patientId || null,
        request_type: "abha_enrollment_set_address",
        request_status: "success",
        abha_number: abhaNumber || null,
        abha_address: finalAddress,
      });

      return json({ session_id: sessionId, abha_number: abhaNumber, abha_address: finalAddress, full_name: (session as any).full_name, gender: (session as any).gender, date_of_birth: (session as any).date_of_birth, mobile: (session as any).mobile });
    }

    // ── send_mobile_otp ───────────────────────────────────────────────────────
    // For patients who already have an ABHA — send OTP to their registered mobile.
    if (action === "send_mobile_otp") {
      const loginHint = normalizeText(body.login_hint) || "mobile"; // "mobile" | "abha-number" | "abha-address"
      const loginId   = normalizeText(body.login_id);
      if (!loginId) return json({ error: "login_id is required." }, 400);

      const certPem = await fetchAbdmCert(config);
      const encryptedLoginId = encryptWithCert(loginId, certPem);

      const otpUrl = `${abhaBase(env)}/abha/api/v3/profile/login/request/otp`;
      const otpRes = await fetch(otpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString(), "X-CM-ID": config.cmId || "sbx" },
        body: JSON.stringify({ loginHint, loginId: encryptedLoginId, scope: "abha-login" }),
      });

      const otpBody = await otpRes.json().catch(() => ({}));
      if (!otpRes.ok) return json({ error: otpBody?.message || `OTP request failed (${otpRes.status})` }, 502);

      const txnId: string = otpBody.txnId;
      if (!txnId) return json({ error: "ABDM did not return a transaction ID." }, 502);

      const { data: session, error: sessionError } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .insert({ organization_id: organizationId, user_id: userId, txn_id: txnId, status: "mobile_otp_sent" })
        .select("id")
        .single();
      if (sessionError || !session) throw sessionError || new Error("Failed to create session");

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId, user_id: userId,
        request_type: "abha_login_otp_request",
        request_status: "success",
        request_payload: { loginHint, scope: "abha-login", txnId },
      });

      return json({ session_id: (session as { id: string }).id });
    }

    // ── verify_mobile_otp ─────────────────────────────────────────────────────
    if (action === "verify_mobile_otp") {
      const sessionId = normalizeText(body.session_id);
      const otp       = normalizeText(body.otp);
      const patientId = normalizeText(body.patient_id);
      if (!sessionId) return json({ error: "session_id is required." }, 400);
      if (!otp || !/^\d{6}$/.test(otp)) return json({ error: "A valid 6-digit OTP is required." }, 400);

      const { data: session, error: fetchErr } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .select("*").eq("id", sessionId).eq("organization_id", organizationId)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (fetchErr || !session) return json({ error: "Session not found or expired." }, 404);

      const certPem = await fetchAbdmCert(config);
      const encryptedOtp = encryptWithCert(otp, certPem);

      const verifyUrl = `${abhaBase(env)}/abha/api/v3/profile/login/verify/otp`;
      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString(), "X-CM-ID": config.cmId || "sbx" },
        body: JSON.stringify({
          scope: "abha-login",
          authData: { authMethods: ["otp"], otp: { txnId: (session as any).txn_id, otpValue: encryptedOtp } },
        }),
      });

      const verifyBody = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        await supabaseAdmin.from("abdm_enrollment_sessions")
          .update({ status: "failed", error_message: verifyBody?.message || `HTTP ${verifyRes.status}`, updated_at: new Date().toISOString() })
          .eq("id", sessionId);
        return json({ error: verifyBody?.message || `Login OTP verification failed (${verifyRes.status})` }, 502);
      }

      const xToken = verifyRes.headers.get("X-Token") || verifyRes.headers.get("x-token") || verifyBody.token || null;
      const profile = await fetchProfile(abhaBase(env), xToken);

      const abhaNumber = String(profile.ABHANumber || profile.abhaNumber || "");
      const abhaAddress = profile.preferredAbhaAddress || profile.abhaAddress || "";
      const fullName    = profile.name || profile.fullName || "";
      const gender      = profile.gender || "";
      const dob         = profile.dateOfBirth || profile.dob || "";
      const mobile      = profile.mobile || profile.mobileNumber || "";

      await supabaseAdmin.from("abdm_enrollment_sessions").update({
        t_token: xToken, abha_number: abhaNumber || null, abha_address: abhaAddress || null,
        full_name: fullName || null, gender: gender || null, date_of_birth: dob || null,
        mobile: mobile || null, status: "verified", updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      if (patientId && abhaNumber) {
        await supabaseAdmin.from("patients").update({
          abha_number: abhaNumber, abha_address: abhaAddress || null,
          abdm_link_status: "verified", abdm_source: "mobile_otp",
          abdm_linked_at: new Date().toISOString(), abdm_last_verified_at: new Date().toISOString(),
        }).eq("id", patientId).eq("organization_id", organizationId);
      }

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId, user_id: userId, patient_id: patientId || null,
        request_type: "abha_login_otp_verify", request_status: "success",
        abha_number: abhaNumber || null, abha_address: abhaAddress || null,
        response_payload: { abha_number: abhaNumber, abha_address: abhaAddress, full_name: fullName },
      });

      return json({ session_id: sessionId, abha_number: abhaNumber, abha_address: abhaAddress, full_name: fullName, gender, date_of_birth: dob, mobile });
    }

    // ── init_face_auth ────────────────────────────────────────────────────────
    // Initialises a face-auth session for an existing ABHA holder.
    if (action === "init_face_auth") {
      const abhaId    = normalizeText(body.abha_number) || normalizeText(body.abha_address);
      const loginHint = abhaId?.includes("@") ? "abha-address" : "abha-number";
      if (!abhaId) return json({ error: "abha_number or abha_address is required." }, 400);

      const certPem = await fetchAbdmCert(config);
      const encryptedId = encryptWithCert(abhaId, certPem);

      const initUrl = `${abhaBase(env)}/abha/api/v3/profile/login/request/auth/init`;
      const initRes = await fetch(initUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString(), "X-CM-ID": config.cmId || "sbx" },
        body: JSON.stringify({ loginHint, loginId: encryptedId, authMethod: "FACE", scope: "abha-login" }),
      });

      const initBody = await initRes.json().catch(() => ({}));
      if (!initRes.ok) return json({ error: initBody?.message || `Face auth init failed (${initRes.status})` }, 502);

      const txnId: string = initBody.txnId;
      if (!txnId) return json({ error: "ABDM did not return a transaction ID." }, 502);

      const { data: session, error: sessionError } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .insert({ organization_id: organizationId, user_id: userId, txn_id: txnId, status: "face_auth_init" })
        .select("id").single();
      if (sessionError || !session) throw sessionError || new Error("Failed to create session");

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId, user_id: userId,
        request_type: "abha_face_auth_init", request_status: "success",
        request_payload: { loginHint, authMethod: "FACE", txnId },
      });

      return json({ session_id: (session as { id: string }).id, txn_id: txnId });
    }

    // ── verify_face ───────────────────────────────────────────────────────────
    // face_image must be a base64-encoded JPEG captured from the patient's camera.
    if (action === "verify_face") {
      const sessionId  = normalizeText(body.session_id);
      const faceImage  = normalizeText(body.face_image); // base64 JPEG
      const patientId  = normalizeText(body.patient_id);
      if (!sessionId)  return json({ error: "session_id is required." }, 400);
      if (!faceImage)  return json({ error: "face_image (base64 JPEG) is required." }, 400);

      const { data: session, error: fetchErr } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .select("*").eq("id", sessionId).eq("organization_id", organizationId)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
      if (fetchErr || !session) return json({ error: "Session not found or expired." }, 404);

      const certPem = await fetchAbdmCert(config);
      const encryptedFace = encryptWithCert(faceImage, certPem);

      const verifyUrl = `${abhaBase(env)}/abha/api/v3/profile/login/verify/face`;
      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString(), "X-CM-ID": config.cmId || "sbx" },
        body: JSON.stringify({
          scope: "abha-login",
          authData: {
            authMethods: ["face"],
            face: { txnId: (session as any).txn_id, faceAuthData: encryptedFace },
          },
        }),
      });

      const verifyBody = await verifyRes.json().catch(() => ({}));
      if (!verifyRes.ok) {
        await supabaseAdmin.from("abdm_enrollment_sessions")
          .update({ status: "failed", error_message: verifyBody?.message, updated_at: new Date().toISOString() })
          .eq("id", sessionId);
        return json({ error: verifyBody?.message || `Face verification failed (${verifyRes.status})` }, 502);
      }

      const xToken = verifyRes.headers.get("X-Token") || verifyRes.headers.get("x-token") || verifyBody.token || null;
      const profile = await fetchProfile(abhaBase(env), xToken);

      const abhaNumber = String(profile.ABHANumber || profile.abhaNumber || "");
      const abhaAddress = profile.preferredAbhaAddress || profile.abhaAddress || "";
      const fullName    = profile.name || profile.fullName || "";
      const gender      = profile.gender || "";
      const dob         = profile.dateOfBirth || profile.dob || "";
      const mobile      = profile.mobile || "";

      await supabaseAdmin.from("abdm_enrollment_sessions").update({
        t_token: xToken, abha_number: abhaNumber || null, abha_address: abhaAddress || null,
        full_name: fullName || null, gender: gender || null, date_of_birth: dob || null,
        mobile: mobile || null, status: "verified", updated_at: new Date().toISOString(),
      }).eq("id", sessionId);

      if (patientId && abhaNumber) {
        await supabaseAdmin.from("patients").update({
          abha_number: abhaNumber, abha_address: abhaAddress || null,
          abdm_link_status: "verified", abdm_source: "face_auth",
          abdm_linked_at: new Date().toISOString(), abdm_last_verified_at: new Date().toISOString(),
        }).eq("id", patientId).eq("organization_id", organizationId);
      }

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId, user_id: userId, patient_id: patientId || null,
        request_type: "abha_face_auth_verify", request_status: "success",
        abha_number: abhaNumber || null, abha_address: abhaAddress || null,
      });

      return json({ session_id: sessionId, abha_number: abhaNumber, abha_address: abhaAddress, full_name: fullName, gender, date_of_birth: dob, mobile });
    }

    // ── verify_demographic ────────────────────────────────────────────────────
    // Verify an existing ABHA holder using name + DOB + gender (no OTP needed).
    if (action === "verify_demographic") {
      const abhaId  = normalizeText(body.abha_number) || normalizeText(body.abha_address);
      const name    = normalizeText(body.name);
      const dob     = normalizeText(body.date_of_birth); // YYYY-MM-DD
      const gender  = normalizeText(body.gender);        // M / F / O
      const mobile  = normalizeText(body.mobile);
      const patientId = normalizeText(body.patient_id);

      if (!abhaId)         return json({ error: "abha_number or abha_address is required." }, 400);
      if (!name || !dob || !gender) return json({ error: "name, date_of_birth, and gender are required." }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return json({ error: "date_of_birth must be YYYY-MM-DD." }, 400);
      if (!["M", "F", "O"].includes(gender)) return json({ error: "gender must be M, F, or O." }, 400);

      const certPem = await fetchAbdmCert(config);
      const loginHint = abhaId.includes("@") ? "abha-address" : "abha-number";
      const encryptedId = encryptWithCert(abhaId, certPem);

      const demoUrl = `${abhaBase(env)}/abha/api/v3/profile/login/verify/demographics`;
      const demoRes = await fetch(demoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "REQUEST-ID": crypto.randomUUID(), "TIMESTAMP": new Date().toISOString(), "X-CM-ID": config.cmId || "sbx" },
        body: JSON.stringify({
          scope: "abha-login",
          authData: {
            authMethods: ["demographics"],
            demographics: {
              loginHint, loginId: encryptedId,
              name, dateOfBirth: dob, gender,
              ...(mobile ? { mobile } : {}),
            },
          },
        }),
      });

      const demoBody = await demoRes.json().catch(() => ({}));
      if (!demoRes.ok) return json({ error: demoBody?.message || `Demographic verification failed (${demoRes.status})` }, 502);

      const xToken = demoRes.headers.get("X-Token") || demoRes.headers.get("x-token") || demoBody.token || null;
      const profile = await fetchProfile(abhaBase(env), xToken);

      const abhaNumber  = String(profile.ABHANumber || profile.abhaNumber || abhaId);
      const abhaAddress = profile.preferredAbhaAddress || profile.abhaAddress || "";
      const fullName    = profile.name || profile.fullName || name;

      if (patientId) {
        await supabaseAdmin.from("patients").update({
          abha_number: abhaNumber || null, abha_address: abhaAddress || null,
          abdm_link_status: "verified", abdm_source: "demographic",
          abdm_linked_at: new Date().toISOString(), abdm_last_verified_at: new Date().toISOString(),
        }).eq("id", patientId).eq("organization_id", organizationId);
      }

      const { data: session } = await supabaseAdmin
        .from("abdm_enrollment_sessions")
        .insert({
          organization_id: organizationId, user_id: userId,
          txn_id: crypto.randomUUID(),
          abha_number: abhaNumber || null, abha_address: abhaAddress || null,
          full_name: fullName || null, gender: gender || null,
          date_of_birth: dob || null, mobile: mobile || null,
          t_token: xToken, status: "verified",
        })
        .select("id").single();

      await supabaseAdmin.from("abdm_scan_logs").insert({
        organization_id: organizationId, user_id: userId, patient_id: patientId || null,
        request_type: "abha_demographic_verify", request_status: "success",
        abha_number: abhaNumber || null, abha_address: abhaAddress || null,
      });

      return json({
        session_id: (session as any)?.id ?? null,
        abha_number: abhaNumber, abha_address: abhaAddress,
        full_name: fullName, gender, date_of_birth: dob, mobile: mobile || "",
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);

  } catch (error: any) {
    console.error("Error in abdm-enroll-abha:", error);
    return json({ error: error.message || "ABHA enrollment failed" }, 500);
  }
});
