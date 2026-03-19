import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyTurnstile } from "../_shared/patient-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type UserRole = "admin" | "employee" | "patient" | "collector";

interface EmployeeLoginRequest {
  email: string;
  password: string;
  turnstile_token?: string;
  organization_slug?: string | null;
  otp?: string;
  challenge_id?: string | null;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, turnstile_token, organization_slug, otp, challenge_id }: EmployeeLoginRequest = await req.json();
    const trimmedEmail = email?.trim().toLowerCase();
    const normalizedOtp = otp?.trim() || "";
    const normalizedChallengeId = challenge_id?.trim() || null;
    const isTwoFactorVerification = Boolean(normalizedChallengeId && normalizedOtp);

    if (!trimmedEmail || !password) {
      return jsonResponse({ error: "Email and password are required." }, 400);
    }

    if (isTwoFactorVerification && !/^\d{6}$/.test(normalizedOtp)) {
      return jsonResponse({ error: "A valid 6-digit OTP is required." }, 400);
    }

    if (!isTwoFactorVerification) {
      const turnstileError = await verifyTurnstile(turnstile_token || "", req);
      if (turnstileError) {
        return jsonResponse({ error: turnstileError }, 400);
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration missing." }, 500);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: authData, error: authError } = await authClient.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });

    if (authError || !authData.session || !authData.user) {
      return jsonResponse({ error: "Invalid email or password." }, 401);
    }

    const { data: roleRows, error: rolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", authData.user.id);

    if (rolesError) {
      console.error("Error fetching staff roles:", rolesError);
      await authClient.auth.signOut();
      return jsonResponse({ error: "Unable to verify staff access." }, 500);
    }

    const roles = (roleRows?.map((row) => row.role as UserRole) || []);
    const isStaff = roles.some((role) => role === "admin" || role === "employee" || role === "collector");
    const isCollector =
      roles.includes("collector") &&
      !roles.includes("admin") &&
      !roles.includes("employee");

    // Check if this user is a platform admin — they can access any tenant org.
    const { data: platformAdminRecord } = await adminClient
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    const isPlatformAdmin = Boolean(platformAdminRecord?.user_id);

    if (!isStaff && !isPlatformAdmin) {
      await authClient.auth.signOut();
      return jsonResponse({ error: "Your account does not have staff access." }, 403);
    }

    let resolvedOrganizationId: string | null = null;
    let employeeEmail = trimmedEmail;
    let twoFactorEmailEnabled = false;

    if (isPlatformAdmin) {
      // Platform admins bypass employee record and membership checks.
      // Resolve the org they're logging into from the slug (tenant subdomain login)
      // or fall back to their own employee record org if logging in at platform hostname.
      if (organization_slug) {
        const { data: requestedOrg, error: orgLookupError } = await adminClient
          .from("organizations")
          .select("id")
          .eq("slug", organization_slug)
          .maybeSingle();

        if (orgLookupError) {
          console.error("Error looking up organization by slug:", orgLookupError);
          await authClient.auth.signOut();
          return jsonResponse({ error: "Unable to verify organization." }, 500);
        }

        if (!requestedOrg) {
          await authClient.auth.signOut();
          return jsonResponse({ error: "Organization not found." }, 403);
        }

        resolvedOrganizationId = requestedOrg.id;
      } else {
        // No slug — try to get org from their own employee record.
        const { data: empRecord } = await adminClient
          .from("employees")
          .select("organization_id")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        resolvedOrganizationId = (empRecord as { organization_id?: string | null } | null)?.organization_id ?? null;
      }
    } else {
      // Normal staff flow — verify employee record and org membership.
      const { data: employeeRecord, error: employeeError } = await adminClient
        .from("employees")
        .select("id, is_active, organization_id, email, two_factor_email_enabled")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (employeeError || !employeeRecord || employeeRecord.is_active !== true) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "Your staff account is inactive or not linked to an employee record." }, 403);
      }

      resolvedOrganizationId =
        (employeeRecord as { organization_id?: string | null }).organization_id || null;
      employeeEmail =
        (employeeRecord as { email?: string | null }).email?.trim().toLowerCase() || trimmedEmail;
      twoFactorEmailEnabled =
        (employeeRecord as { two_factor_email_enabled?: boolean | null }).two_factor_email_enabled === true;

      if (!resolvedOrganizationId) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "Your staff account is not linked to an active organization." }, 403);
      }

      // Verify the employee belongs to the org on whose subdomain they're logging in.
      if (organization_slug) {
        const { data: requestedOrg, error: orgLookupError } = await adminClient
          .from("organizations")
          .select("id")
          .eq("slug", organization_slug)
          .maybeSingle();

        if (orgLookupError) {
          console.error("Error looking up organization by slug:", orgLookupError);
          await authClient.auth.signOut();
          return jsonResponse({ error: "Unable to verify organization." }, 500);
        }

        if (!requestedOrg) {
          await authClient.auth.signOut();
          return jsonResponse({ error: "Organization not found." }, 403);
        }

        if (requestedOrg.id !== resolvedOrganizationId) {
          await authClient.auth.signOut();
          return jsonResponse({ error: "Your account does not belong to this organization." }, 403);
        }
      }

      const { data: organizationMemberships, error: organizationMembershipError } = await adminClient
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", authData.user.id)
        .eq("organization_id", resolvedOrganizationId)
        .eq("is_active", true)
        .limit(1);

      if (organizationMembershipError) {
        console.error("Error verifying organization membership:", organizationMembershipError);
        await authClient.auth.signOut();
        return jsonResponse({ error: "Unable to verify staff organization access." }, 500);
      }

      if (!organizationMemberships || organizationMemberships.length === 0) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "Your staff account is not linked to an active organization." }, 403);
      }
    }

    if (!isPlatformAdmin && twoFactorEmailEnabled) {
      if (!employeeEmail) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "Two-factor authentication is enabled, but no staff email is configured." }, 400);
      }

      if (!isTwoFactorVerification) {
        const otpCode = generateOtp();
        const otpHash = await hashOtp(otpCode);

        await adminClient
          .from("employee_login_challenges")
          .delete()
          .eq("user_id", authData.user.id)
          .eq("organization_id", resolvedOrganizationId)
          .is("consumed_at", null);

        const { data: challenge, error: challengeError } = await adminClient
          .from("employee_login_challenges")
          .insert({
            user_id: authData.user.id,
            organization_id: resolvedOrganizationId,
            email: employeeEmail,
            otp_hash: otpHash,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          })
          .select("id")
          .single();

        if (challengeError || !challenge) {
          console.error("Error creating employee login challenge:", challengeError);
          await authClient.auth.signOut();
          return jsonResponse({ error: "Unable to start two-factor authentication." }, 500);
        }

        const emailResult = await sendTwoFactorEmail({
          supabaseUrl,
          serviceRoleKey,
          organizationId: resolvedOrganizationId,
          to: employeeEmail,
          otp: otpCode,
        });

        if (!emailResult.success) {
          console.error("Error sending two-factor OTP email:", emailResult.error);
          await adminClient.from("employee_login_challenges").delete().eq("id", challenge.id);
          await authClient.auth.signOut();
          return jsonResponse({ error: emailResult.error || "Unable to send the email OTP." }, 500);
        }

        await authClient.auth.signOut();
        return jsonResponse({
          success: true,
          requires_two_factor: true,
          challenge_id: challenge.id,
          masked_email: maskEmail(employeeEmail),
        });
      }

      const { data: challenge, error: challengeError } = await adminClient
        .from("employee_login_challenges")
        .select("id, otp_hash, attempts, expires_at, consumed_at")
        .eq("id", normalizedChallengeId)
        .eq("user_id", authData.user.id)
        .eq("organization_id", resolvedOrganizationId)
        .maybeSingle();

      if (challengeError || !challenge) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "The two-factor challenge is invalid or expired." }, 400);
      }

      const challengeRecord = challenge as {
        id: string;
        otp_hash: string;
        attempts: number;
        expires_at: string;
        consumed_at: string | null;
      };

      if (challengeRecord.consumed_at) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "This two-factor code has already been used." }, 400);
      }

      if (new Date(challengeRecord.expires_at).getTime() < Date.now()) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "The two-factor code has expired. Please sign in again." }, 400);
      }

      if (challengeRecord.attempts >= 5) {
        await authClient.auth.signOut();
        return jsonResponse({ error: "Too many invalid OTP attempts. Please sign in again." }, 429);
      }

      const providedHash = await hashOtp(normalizedOtp);
      if (providedHash !== challengeRecord.otp_hash) {
        await adminClient
          .from("employee_login_challenges")
          .update({ attempts: challengeRecord.attempts + 1 })
          .eq("id", challengeRecord.id);
        await authClient.auth.signOut();
        return jsonResponse({ error: "Invalid email OTP." }, 401);
      }

      await adminClient
        .from("employee_login_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challengeRecord.id);
    }

    return jsonResponse({
      success: true,
      roles,
      is_staff: isStaff || isPlatformAdmin,
      is_collector: isCollector,
      is_platform_admin: isPlatformAdmin,
      organization_id: resolvedOrganizationId,
      password_reset_required: authData.user.user_metadata?.must_change_password === true,
      first_login_flow: typeof authData.user.user_metadata?.first_login_flow === "string"
        ? authData.user.user_metadata.first_login_flow
        : null,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
    });
  } catch (error: any) {
    console.error("Error in employee-login:", error);
    return jsonResponse({ error: error.message || "Internal server error" }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskEmail(email: string): string {
  const [localPart, domainPart] = email.split("@");
  if (!localPart || !domainPart) {
    return email;
  }

  if (localPart.length <= 2) {
    return `${localPart[0] || "*"}*@${domainPart}`;
  }

  return `${localPart.slice(0, 2)}${"*".repeat(Math.max(1, localPart.length - 2))}@${domainPart}`;
}

async function sendTwoFactorEmail(input: {
  supabaseUrl: string;
  serviceRoleKey: string;
  organizationId: string | null;
  to: string;
  otp: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${input.supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-service-key": input.serviceRoleKey,
      },
      body: JSON.stringify({
        to: input.to,
        organizationId: input.organizationId,
        subject: "Your staff login verification code",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
            <h2 style="margin-bottom: 12px;">Staff login verification</h2>
            <p>Use the following one-time code to finish signing in:</p>
            <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 16px 0;">${input.otp}</p>
            <p>This code expires in 10 minutes.</p>
            <p>If you did not try to sign in, you can ignore this email.</p>
          </div>
        `,
        textContent: `Your staff login verification code is ${input.otp}. This code expires in 10 minutes.`,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, error: result?.error || "Failed to send the verification email." };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Failed to send the verification email." };
  }
}
