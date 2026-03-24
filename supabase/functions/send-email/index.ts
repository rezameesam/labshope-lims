import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  fetchOrganizationBranding,
  fetchScopedSettings,
  resolveOrganizationIdentity,
} from "../_shared/organization-settings.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_FROM_NAME =
  Deno.env.get("DEFAULT_FROM_NAME")?.trim() ||
  Deno.env.get("MAIL_DEFAULT_FROM_NAME")?.trim() ||
  "Diagnostic Laboratory";

const DEFAULT_FROM_EMAIL =
  Deno.env.get("DEFAULT_FROM_EMAIL")?.trim() ||
  Deno.env.get("MAIL_DEFAULT_FROM_EMAIL")?.trim() ||
  "no-reply@example.com";

const trimOrEmpty = (value: string | null | undefined): string => value?.trim() || "";

async function authorizeRequest(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
  serviceRoleKey: string,
): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  const internalServiceKey = req.headers.get("x-internal-service-key");

  if (internalServiceKey && internalServiceKey === serviceRoleKey) {
    return authHeader;
  }

  if (!authHeader) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) {
    throw new Response(
      JSON.stringify({ error: "Invalid authentication token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return authHeader;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, subject, htmlContent, textContent, cc, patientId, organizationId } = await req.json();

    if (!to || !subject || !htmlContent) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: to, subject, htmlContent",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = await authorizeRequest(req, supabaseUrl, supabaseAnonKey, serviceRoleKey);

    let resolvedOrganizationId: string | null = null;
    let emailFromName = "";
    let emailFromAddress = "";
    let replyToEmail = "";
    let settingsMap = new Map<string, string>();

    if (supabaseUrl && serviceRoleKey) {
      const identity = await resolveOrganizationIdentity({
        supabaseUrl,
        supabaseAnonKey,
        serviceRoleKey,
        authHeader,
        organizationId,
        patientId,
      });

      resolvedOrganizationId = identity.organizationId;

      const [scopedSettingsMap, organizationBranding] = await Promise.all([
        fetchScopedSettings(
          supabaseUrl,
          serviceRoleKey,
          [
            "email_from_name",
            "email_from_email",
            "email_reply_to",
            "mailjet_api_key",
            "mailjet_secret_key",
            "resend_api_key",
            "mailgun_api_key",
            "mailgun_domain",
            "sendgrid_api_key",
          ],
          resolvedOrganizationId,
        ),
        fetchOrganizationBranding(supabaseUrl, serviceRoleKey, resolvedOrganizationId),
      ]);
      settingsMap = scopedSettingsMap;

      emailFromName =
        settingsMap.get("email_from_name")?.trim() ||
        organizationBranding?.displayName ||
        DEFAULT_FROM_NAME;
      emailFromAddress =
        settingsMap.get("email_from_email")?.trim() ||
        organizationBranding?.primaryEmail ||
        DEFAULT_FROM_EMAIL;
      replyToEmail = settingsMap.get("email_reply_to")?.trim() || "";
    }

    const orgProviderSettings = {
      mailjetApiKey: trimOrEmpty(settingsMap.get("mailjet_api_key")),
      mailjetSecretKey: trimOrEmpty(settingsMap.get("mailjet_secret_key")),
      resendApiKey: trimOrEmpty(settingsMap.get("resend_api_key")),
      mailgunApiKey: trimOrEmpty(settingsMap.get("mailgun_api_key")),
      mailgunDomain: trimOrEmpty(settingsMap.get("mailgun_domain")),
      sendgridApiKey: trimOrEmpty(settingsMap.get("sendgrid_api_key")),
    };

    const hasOrgSpecificProvider = Boolean(
      orgProviderSettings.mailjetApiKey ||
      orgProviderSettings.mailjetSecretKey ||
      orgProviderSettings.resendApiKey ||
      orgProviderSettings.mailgunApiKey ||
      orgProviderSettings.mailgunDomain ||
      orgProviderSettings.sendgridApiKey
    );

    const providerSettings = {
      mailjetApiKey: orgProviderSettings.mailjetApiKey || (!hasOrgSpecificProvider ? trimOrEmpty(Deno.env.get("MAILJET_API_KEY")) : ""),
      mailjetSecretKey: orgProviderSettings.mailjetSecretKey || (!hasOrgSpecificProvider ? trimOrEmpty(Deno.env.get("MAILJET_SECRET_KEY")) : ""),
      resendApiKey: orgProviderSettings.resendApiKey || (!hasOrgSpecificProvider ? trimOrEmpty(Deno.env.get("RESEND_API_KEY")) : ""),
      mailgunApiKey: orgProviderSettings.mailgunApiKey || (!hasOrgSpecificProvider ? trimOrEmpty(Deno.env.get("MAILGUN_API_KEY")) : ""),
      mailgunDomain: orgProviderSettings.mailgunDomain || (!hasOrgSpecificProvider ? trimOrEmpty(Deno.env.get("MAILGUN_DOMAIN")) : ""),
      sendgridApiKey: orgProviderSettings.sendgridApiKey || (!hasOrgSpecificProvider ? trimOrEmpty(Deno.env.get("SENDGRID_API_KEY")) : ""),
    };

    // Try Mailjet first (if API key is configured) - Free 6,000 emails/month
    if (providerSettings.mailjetApiKey && providerSettings.mailjetSecretKey) {
      try {
        const mailjetFromEmail =
          emailFromAddress ||
          Deno.env.get("MAILJET_FROM_EMAIL") ||
          DEFAULT_FROM_EMAIL;
        const mailjetFromName =
          emailFromName ||
          Deno.env.get("MAILJET_FROM_NAME") ||
          DEFAULT_FROM_NAME;
        
        // Create Basic Auth header (API Key:Secret Key)
        const auth = btoa(`${providerSettings.mailjetApiKey}:${providerSettings.mailjetSecretKey}`);
        
        const mailjetResponse = await fetch("https://api.mailjet.com/v3.1/send", {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Messages: [{
              From: {
                Email: mailjetFromEmail,
                Name: mailjetFromName,
              },
              To: [{
                Email: to,
              }],
              ...(cc && cc.length > 0
                ? { Cc: (Array.isArray(cc) ? cc : [cc]).map((e: string) => ({ Email: e.trim() })) }
                : {}),
              Subject: subject,
              HTMLPart: htmlContent,
              TextPart: textContent || htmlContent.replace(/<[^>]*>/g, ""),
              ...(replyToEmail
                ? {
                    ReplyTo: {
                      Email: replyToEmail,
                      Name: mailjetFromName,
                    },
                  }
                : {}),
            }],
          }),
        });

        const mailjetResult = await mailjetResponse.json();

        // Check if the response is successful
        if (mailjetResponse.ok && mailjetResult.Messages && mailjetResult.Messages[0]?.Status === "success") {
          const messageId = mailjetResult.Messages[0].To?.[0]?.MessageID || 
                           mailjetResult.Messages[0].To?.[0]?.MessageUUID ||
                           "sent";
          return new Response(
            JSON.stringify({ 
              success: true, 
              messageId: messageId, 
              service: "mailjet" 
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        } else {
          // Log error details for debugging
          console.error("Mailjet API error:", {
            status: mailjetResponse.status,
            statusText: mailjetResponse.statusText,
            result: mailjetResult,
          });
        }
      } catch (mailjetError) {
        console.error("Mailjet request error:", mailjetError);
        // Fall through to next service
      }
    }

    // Try Resend (if API key is configured)
    if (providerSettings.resendApiKey) {
      try {
        const resendFrom = emailFromAddress || Deno.env.get("RESEND_FROM_EMAIL") || "onboarding@resend.dev";
        
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${providerSettings.resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: resendFrom,
            to: to,
            subject: subject,
            html: htmlContent,
            text: textContent || htmlContent.replace(/<[^>]*>/g, ""),
            ...(cc && cc.length > 0 ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
            ...(replyToEmail ? { reply_to: replyToEmail } : {}),
          }),
        });

        const resendResult = await resendResponse.json();

        if (resendResponse.ok && resendResult.id) {
          return new Response(
            JSON.stringify({ success: true, messageId: resendResult.id, service: "resend" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (resendError) {
        console.error("Resend error:", resendError);
        // Fall through to SMTP
      }
    }

    // SMTP is not supported in Supabase Edge Functions (no raw TCP).
    
    // Try Mailgun if configured
    if (providerSettings.mailgunApiKey && providerSettings.mailgunDomain) {
      try {
        const mailgunUrl = `https://api.mailgun.net/v3/${providerSettings.mailgunDomain}/messages`;
        const auth = btoa(`api:${providerSettings.mailgunApiKey}`);
        const mailgunFrom = emailFromAddress || Deno.env.get("MAILGUN_FROM_EMAIL") || `noreply@${providerSettings.mailgunDomain}`;
        
        const formData = new FormData();
        formData.append("from", mailgunFrom);
        formData.append("to", to);
        formData.append("subject", subject);
        formData.append("html", htmlContent);
        if (textContent) {
          formData.append("text", textContent);
        }
        if (cc && cc.length > 0) {
          formData.append("cc", Array.isArray(cc) ? cc.join(",") : cc);
        }
        if (replyToEmail) {
          formData.append("h:Reply-To", replyToEmail);
        }

        const mailgunResponse = await fetch(mailgunUrl, {
          method: "POST",
          headers: {
            "Authorization": `Basic ${auth}`,
          },
          body: formData,
        });

        const mailgunResult = await mailgunResponse.json();

        if (mailgunResponse.ok && mailgunResult.id) {
          return new Response(
            JSON.stringify({ success: true, messageId: mailgunResult.id, service: "mailgun" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (mailgunError) {
        console.error("Mailgun error:", mailgunError);
      }
    }

    // Try SendGrid if configured
    if (providerSettings.sendgridApiKey) {
      try {
        const sendgridFrom =
          emailFromAddress ||
          Deno.env.get("SENDGRID_FROM_EMAIL") ||
          DEFAULT_FROM_EMAIL;
        const sendgridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${providerSettings.sendgridApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email: to }],
              ...(cc && cc.length > 0
                ? { cc: (Array.isArray(cc) ? cc : [cc]).map((e: string) => ({ email: e.trim() })) }
                : {}),
            }],
            from: { email: sendgridFrom },
            subject: subject,
            ...(replyToEmail ? { reply_to: { email: replyToEmail } } : {}),
            content: [
              {
                type: "text/html",
                value: htmlContent,
              },
              ...(textContent ? [{
                type: "text/plain",
                value: textContent,
              }] : []),
            ],
          }),
        });

        if (sendgridResponse.ok) {
          const sendgridHeaders = sendgridResponse.headers.get("x-message-id");
          return new Response(
            JSON.stringify({ success: true, messageId: sendgridHeaders || "sent", service: "sendgrid" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } catch (sendgridError) {
        console.error("SendGrid error:", sendgridError);
      }
    }

    // If all else fails, return error with setup instructions
    return new Response(
      JSON.stringify({
        success: false,
        error: hasOrgSpecificProvider
          ? "No working email provider is configured for this organization."
          : "No email service configured. Please set up one of:",
        options: {
          mailjet: "Free 6,000 emails/month - https://mailjet.com (Best free tier)",
          resend: "Free 3,000 emails/month - https://resend.com (Easiest setup)",
          mailgun: "Free 5,000 emails/month - https://mailgun.com",
          sendgrid: "Free 100 emails/day - https://sendgrid.com",
        },
        setup: hasOrgSpecificProvider
          ? "Review this organization's provider credentials in organization_settings and confirm the selected provider account is valid."
          : "Add organization-specific provider credentials in organization_settings, or configure platform Edge Function secrets such as MAILJET_API_KEY + MAILJET_SECRET_KEY (or RESEND_API_KEY, MAILGUN_API_KEY, or SENDGRID_API_KEY).",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    if (error instanceof Response) {
      return error;
    }
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || "Failed to send email",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
