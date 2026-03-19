/**
 * Notification Service
 * Handles sending tenant-aware email, SMS, and WhatsApp notifications.
 *
 * Provider credentials are resolved server-side by the edge functions.
 * Preferred order:
 * 1. organization_settings overrides for the current tenant
 * 2. platform-level Edge Function secrets as a fallback
 */

import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo.png";
import { formatPhoneForDisplay } from "@/lib/phone";
import { renderNotificationTemplate } from "@/lib/notificationTemplates";

// Types
export interface NotificationOptions {
  to: string; // email or phone number
  emailTo?: string;
  phoneTo?: string;
  subject?: string; // for email
  message: string;
  type: 'email' | 'sms' | 'whatsapp' | 'both' | 'email_whatsapp' | 'all';
  patientId?: string;
  reminderId?: string;
  branding?: Partial<NotificationBranding>;
  /** Caller-supplied JWT access token. When provided, used directly for Edge
   *  Function auth instead of relying on supabase.auth.getSession(). */
  accessToken?: string;
}

export interface NotificationResult {
  success: boolean;
  error?: string;
  warning?: string;
  method?: 'email' | 'sms' | 'whatsapp';
}

interface PatientWelcomePayload {
  email?: string | null;
  phone?: string | null;
  fullName: string;
  patientId: string;
  portalUrl: string;
  organizationId?: string | null;
  branding?: Partial<NotificationBranding>;
}

interface NotificationBranding {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  primary: string;
  accent: string;
  background: string;
  text: string;
  muted: string;
  border: string;
}

const DEFAULT_NOTIFICATION_BRAND: NotificationBranding = {
  name: "Diagnostic Laboratory",
  tagline: "Accurate. Reliable. Timely.",
  address: "Laboratory address",
  phone: "+91-0000000000",
  email: "support@example.com",
  website: "https://example.com",
  logoUrl: "",
  primary: "#1E3A8A",
  accent: "#3B82F6",
  background: "#F5F8FF",
  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
};

const NOTIFICATION_TEMPLATE_DEFAULTS = {
  testReadySubject: "Test Results Ready: {test_name}",
  testReadyMessage:
    'Dear {patient_name},\n\nYour test results for "{test_name}" are now ready.\nReport Reference: {test_id}\n\nPlease log in to your patient portal to view and download your report:\n{portal_url}\n\nThank you!',
  allTestsReadySubject: "All Test Results Ready ({test_count})",
  allTestsReadyMessage:
    "Dear {patient_name},\n\nAll your test results are now ready. Tests: {test_list}.\n\nPlease log in to your patient portal to view and download your report:\n{portal_url}\n\nThank you!",
  patientWelcomeSubject: "Your Patient Portal Access",
  patientWelcomeMessage:
    "Dear {patient_name},\n\nYour patient portal access has been created.\n\nUser ID: {patient_id_code}\nPassword: {patient_id_code}\n\nPortal: {portal_url}\n\nYou can change your password anytime from Account Settings after signing in.\n\nThank you!",
  paymentReminderSubject: "Payment Reminder: Outstanding Amount ₹{amount}",
  paymentReminderMessage:
    "Dear {patient_name},\n\nYou have an outstanding payment of ₹{amount}{invoice_suffix}. Please make the payment at your earliest convenience.\n\nThank you!",
  paymentReceivedSubject: "Payment Received - View Your Reports",
  paymentReceivedMessage:
    "Dear {patient_name},\n\nWe have received your payment of ₹{amount}{invoice_suffix}.\n\nYou can now view and download your test reports from {business_name}:\n{portal_url}\n\nThank you!",
} as const;

/**
 * Send email notification using Supabase Edge Function (server-side)
 * This calls the send-email Edge Function which uses nodemailer on the server
 */
async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string,
  patientId?: string,
  callerAccessToken?: string
): Promise<NotificationResult> {
  try {
    // Get Supabase URL from environment variables
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    if (!supabaseUrl) {
      return { 
        success: false, 
        error: "Supabase configuration missing", 
        method: 'email' 
      };
    }

    // Resolve auth token: prefer caller-supplied token, then the active user
    // session, and finally a refresh attempt. Do not fall back to the anon
    // publishable key as a Bearer token; it is not a JWT and will be rejected.
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    let resolvedToken = callerAccessToken;
    if (!resolvedToken) {
      const { data: { session } } = await supabase.auth.getSession();
      resolvedToken = session?.access_token;
    }

    if (!resolvedToken) {
      const { data: refreshedSessionData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError) {
        resolvedToken = refreshedSessionData.session?.access_token;
      }
    }

    if (!resolvedToken) {
      return {
        success: false,
        error: "You must be signed in with a valid session to send test emails.",
        method: 'email',
      };
    }

    const requestBody = JSON.stringify({ to, subject, htmlContent, textContent, patientId });
    const sendRequest = async (token: string) =>
      fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
        },
        body: requestBody,
      });

    let rawResponse = await sendRequest(resolvedToken);

    if (rawResponse.status === 401) {
      const { data: refreshedSessionData, error: refreshError } = await supabase.auth.refreshSession();
      const refreshedToken = refreshError ? null : refreshedSessionData.session?.access_token;
      if (refreshedToken) {
        rawResponse = await sendRequest(refreshedToken);
      }
    }

    const result = rawResponse.ok ? await rawResponse.json() : null;
    const invokeError = rawResponse.ok ? null : { message: `HTTP ${rawResponse.status}` };

    if (invokeError || !result?.success) {
      return {
        success: false,
        error: result?.error || invokeError?.message || 'Failed to send email',
        method: 'email',
      };
    }

    return { success: true, method: 'email' };
  } catch (error: any) {
    console.error("Email send error:", error);
    return {
      success: false,
      error: error.message || "Failed to send email",
      method: 'email',
    };
  }
}

/**
 * Send SMS notification using Twilio
 * SMS support disabled - uncomment and install twilio package if needed
 */
async function sendSMS(
  to: string,
  message: string
): Promise<NotificationResult> {
  // SMS support disabled - install twilio package if needed
  // Uncomment and install: npm install twilio
  return { success: false, error: "SMS service not configured", method: 'sms' };
  
  /*
  try {
    const accountSid = import.meta.env.VITE_TWILIO_ACCOUNT_SID;
    const authToken = import.meta.env.VITE_TWILIO_AUTH_TOKEN;
    const fromNumber = import.meta.env.VITE_TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.warn("Twilio credentials not configured. SMS not sent.");
      return { success: false, error: "SMS service not configured", method: 'sms' };
    }

    // Format phone number (ensure it starts with +)
    const formattedPhone = to.startsWith('+') ? to : `+91${to}`;

    // Dynamic import to avoid errors if package not installed
    const twilio = await import('twilio');
    const client = twilio.default(accountSid, authToken);

    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: formattedPhone,
    });

    if (result.errorCode) {
      return { success: false, error: result.errorMessage || "Failed to send SMS", method: 'sms' };
    }

    return { success: true, method: 'sms' };
  } catch (error: any) {
    console.error("SMS send error:", error);
    return { success: false, error: error.message || "Failed to send SMS", method: 'sms' };
  }
  */
}

/**
 * Send WhatsApp notification using Supabase Edge Function (Meta WhatsApp Cloud API)
 */
async function sendWhatsApp(
  to: string,
  message: string,
  templateName?: string,
  patientId?: string
): Promise<NotificationResult> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    if (!supabaseUrl) {
      return {
        success: false,
        error: "Supabase configuration missing",
        method: "whatsapp",
      };
    }

    const { data: result, error: invokeError } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        to,
        message,
        patientId,
        ...(templateName ? { type: "template", templateName, templateParams: [message] } : {}),
      },
    });

    if (invokeError || !result?.success) {
      const errMsg = result?.error || invokeError?.message || "Failed to send WhatsApp message";
      const hint = result?.hint ? ` ${result.hint}` : "";
      return {
        success: false,
        error: `${errMsg}${hint}`,
        method: "whatsapp",
      };
    }

    const providerStatus = String(result.messageStatus || "accepted").toLowerCase();
    const normalizedTo = formatPhoneForDisplay(String(result.to || to));
    const warning = providerStatus !== "delivered"
      ? `WhatsApp accepted for ${normalizedTo}. Delivery is pending confirmation.`
      : undefined;

    return { success: true, method: "whatsapp", warning };
  } catch (error: any) {
    console.error("WhatsApp send error:", error);
    return {
      success: false,
      error: error.message || "Failed to send WhatsApp message",
      method: "whatsapp",
    };
  }
}

/**
 * Generate email HTML template
 */
function generateEmailTemplate(
  title: string,
  message: string,
  type: 'test_result' | 'reminder' | 'promotion' | 'payment' | 'general',
  branding: NotificationBranding = DEFAULT_NOTIFICATION_BRAND
): string {
  const accentMap: Record<typeof type, string> = {
    test_result: "#16A34A",
    reminder: branding.accent,
    promotion: "#F59E0B",
    payment: "#DC2626",
    general: branding.primary,
  };

  const accentColor = accentMap[type] || branding.primary;
  const logoSource =
    branding.logoUrl ||
    import.meta.env.VITE_PUBLIC_LOGO_URL ||
    (typeof window !== "undefined"
      ? new URL(logoUrl, window.location.origin).toString()
      : logoUrl);

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const formattedMessage = escapeHtml(message).replace(/\n/g, "<br/>");
  const preheader = escapeHtml(title).slice(0, 80);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin:0; padding:0; background:${branding.background}; font-family: 'Segoe UI', Arial, sans-serif; color:${branding.text};">
      <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${branding.background}; padding: 32px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border:1px solid ${branding.border};">
              <tr>
                <td style="padding: 22px 28px; background:${branding.primary}; color:#ffffff;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle; width:56px;">
                        ${
                          logoSource
                            ? `<img src="${logoSource}" alt="${branding.name}" width="32" height="32" style="display:block; border-radius:8px; background:#ffffff; padding:3px;">`
                            : ""
                        }
                      </td>
                      <td style="vertical-align:middle;">
                        <div style="font-size:18px; font-weight:700; letter-spacing:0.3px;">${branding.name}</div>
                        <div style="font-size:12px; opacity:0.85;">${branding.tagline}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 28px;">
                  <div style="font-size:20px; font-weight:700; margin-bottom: 10px;">${title}</div>
                  <div style="height:4px; width:64px; background:${accentColor}; border-radius:999px; margin-bottom:18px;"></div>
                  <div style="font-size:15px; line-height:1.7; color:${branding.text};">${formattedMessage}</div>
                  <div style="margin-top:24px; padding:14px 16px; border-left:4px solid ${accentColor}; background:#F8FAFC; border-radius:10px; font-size:13px; color:${branding.muted};">
                    For assistance, contact us at ${branding.phone} or ${branding.email}.<br/>
                    Visit: <a href="${branding.website}" style="color:${accentColor}; text-decoration:none;">${branding.website}</a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 28px; border-top:1px solid ${branding.border}; background:#ffffff;">
                  <div style="font-size:12px; color:${branding.muted}; text-align:center;">
                    ${branding.address}<br/>
                    <a href="${branding.website}" style="color:${branding.muted}; text-decoration:none;">${branding.website}</a><br/>
                    This is an automated message. Please do not reply.
                  </div>
                </td>
              </tr>
            </table>
            <div style="font-size:11px; color:${branding.muted}; margin-top:16px; text-align:center;">
              © ${new Date().getFullYear()} ${branding.name}. All rights reserved.
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

function generateEmailText(
  title: string,
  message: string,
  branding: NotificationBranding = DEFAULT_NOTIFICATION_BRAND
): string {
  const website = branding.website;
  const normalized = message.toLowerCase();
  const hasWebsite = normalized.includes(website.toLowerCase());

  return [
    title,
    "",
    message,
    hasWebsite ? "" : `Visit: ${website}`,
    "",
    branding.name,
    branding.address,
    `Phone: ${branding.phone}`,
    `Email: ${branding.email}`,
    `Website: ${website}`,
    "",
    "This is an automated message. Please do not reply.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

async function resolveNotificationBranding(
  options: Pick<NotificationOptions, "patientId" | "branding">
): Promise<NotificationBranding> {
  const base: NotificationBranding = {
    ...DEFAULT_NOTIFICATION_BRAND,
    logoUrl:
      import.meta.env.VITE_PUBLIC_LOGO_URL ||
      (typeof window !== "undefined"
        ? new URL(logoUrl, window.location.origin).toString()
        : logoUrl),
  };

  const websiteFromWindow =
    typeof window !== "undefined" ? window.location.origin : DEFAULT_NOTIFICATION_BRAND.website;

  if (!options.patientId) {
    return {
      ...base,
      website: websiteFromWindow,
      ...options.branding,
    };
  }

  const { data: patient } = await supabase
    .from("patients")
    .select("organization_id, lab_id")
    .eq("id", options.patientId)
    .maybeSingle();

  const patientRecord = patient as { organization_id?: string | null; lab_id?: string | null } | null;
  const organizationId = patientRecord?.organization_id ?? null;
  const labId = patientRecord?.lab_id ?? null;

  const [organizationResult, labResult] = await Promise.all([
    organizationId
      ? supabase
          .from("organizations" as any)
          .select("display_name, primary_email, primary_phone, logo_url, metadata")
          .eq("id", organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    labId
      ? supabase
          .from("labs")
          .select("name, address, city, state, pincode, phone, email, logo_url, settings")
          .eq("id", labId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const organization = organizationResult.data as
    | {
        display_name?: string | null;
        primary_email?: string | null;
        primary_phone?: string | null;
        logo_url?: string | null;
        metadata?: Record<string, unknown> | null;
      }
    | null;
  const lab = labResult.data as
    | {
        name?: string | null;
        address?: string | null;
        city?: string | null;
        state?: string | null;
        pincode?: string | null;
        phone?: string | null;
        email?: string | null;
        logo_url?: string | null;
        settings?: Record<string, unknown> | null;
      }
    | null;

  const metadata = organization?.metadata || {};
  const labSettings = lab?.settings || {};
  const address = [lab?.address, [lab?.city, lab?.state].filter(Boolean).join(", "), lab?.pincode]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(", ");

  return {
    ...base,
    name: organization?.display_name || lab?.name || base.name,
    tagline:
      (typeof metadata.tagline === "string" && metadata.tagline) ||
      (typeof labSettings.tagline === "string" && labSettings.tagline) ||
      base.tagline,
    address: address || base.address,
    phone: lab?.phone || organization?.primary_phone || base.phone,
    email: lab?.email || organization?.primary_email || base.email,
    website: websiteFromWindow,
    logoUrl: lab?.logo_url || organization?.logo_url || base.logoUrl,
    ...options.branding,
  };
}

async function fetchScopedNotificationSettings(
  keys: string[],
  options?: {
    patientId?: string;
    organizationId?: string | null;
  }
) {
  const settingsMap = new Map<string, string>();
  const uniqueKeys = Array.from(new Set(keys));
  let organizationId = options?.organizationId || null;

  if (!organizationId && options?.patientId) {
    const { data: patient } = await supabase
      .from("patients")
      .select("organization_id")
      .eq("id", options.patientId)
      .maybeSingle();

    organizationId = (patient as { organization_id?: string | null } | null)?.organization_id || null;
  }

  if (organizationId) {
    const { data: organizationSettings } = await supabase
      .from("organization_settings" as any)
      .select("setting_key, setting_value")
      .eq("organization_id", organizationId)
      .in("setting_key", uniqueKeys);

    (organizationSettings || []).forEach((row: any) => {
      settingsMap.set(row.setting_key, row.setting_value || "");
    });
  }

  const missingKeys = uniqueKeys.filter((key) => !settingsMap.get(key)?.trim());
  if (missingKeys.length > 0) {
    const { data: systemSettings } = await supabase
      .from("system_settings" as any)
      .select("setting_key, setting_value")
      .in("setting_key", missingKeys);

    (systemSettings || []).forEach((row: any) => {
      if (!settingsMap.get(row.setting_key)?.trim()) {
        settingsMap.set(row.setting_key, row.setting_value || "");
      }
    });
  }

  return settingsMap;
}

const formatCurrencyAmount = (amount: number) => amount.toFixed(2);

/**
 * Main notification function
 */
export async function sendNotification(
  options: NotificationOptions
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  const branding = await resolveNotificationBranding(options);
  const website = branding.website;
  const messageHasWebsite = options.message.toLowerCase().includes(website.toLowerCase());
  const messageWithWebsite = messageHasWebsite
    ? options.message
    : `${options.message}\n\nWebsite: ${website}`;

  // Get patient info if patientId provided
  let patientEmail: string | null = null;
  let patientPhone: string | null = null;

  if (options.patientId) {
    const { data: patient } = await supabase
      .from('patients')
      .select('email, phone')
      .eq('id', options.patientId)
      .single();

    if (patient) {
      patientEmail = patient.email;
      patientPhone = patient.phone;
    }
  }

  const explicitTo = (options.to || "").trim();
  const explicitIsEmail = explicitTo.includes("@");
  const explicitEmail = options.emailTo?.trim() || (explicitIsEmail ? explicitTo : null);
  const explicitPhone = options.phoneTo?.trim() || (explicitTo && !explicitIsEmail ? explicitTo : null);

  const sendEmailChannel = options.type === "email" || options.type === "both" || options.type === "email_whatsapp" || options.type === "all";
  const sendSmsChannel = options.type === "sms" || options.type === "both" || options.type === "all";
  const sendWhatsAppChannel = options.type === "whatsapp" || options.type === "email_whatsapp" || options.type === "all";

  const emailTo = sendEmailChannel ? (explicitEmail || patientEmail) : null;
  const phoneTo = sendSmsChannel || sendWhatsAppChannel ? (explicitPhone || patientPhone) : null;

  // Send email
  if (emailTo && sendEmailChannel) {
    const emailHtml = generateEmailTemplate(
      options.subject || 'Notification',
      messageWithWebsite,
      'general',
      branding
    );
    const emailText = generateEmailText(options.subject || "Notification", messageWithWebsite, branding);
    const emailResult = await sendEmail(
      emailTo,
      options.subject || 'Notification',
      emailHtml,
      emailText,
      options.patientId,
      options.accessToken
    );
    results.push(emailResult);
  }

  // Send WhatsApp
  if (phoneTo && sendWhatsAppChannel) {
    const whatsappResult = await sendWhatsApp(phoneTo, messageWithWebsite, undefined, options.patientId);
    results.push(whatsappResult);
  } else if (sendWhatsAppChannel) {
    results.push({ success: false, error: "WhatsApp recipient not available", method: "whatsapp" });
  }

  // Send SMS (only if Twilio is configured)
  if (phoneTo && sendSmsChannel) {
    const twilioConfigured = !!import.meta.env.VITE_TWILIO_ACCOUNT_SID;
    if (twilioConfigured) {
      const smsResult = await sendSMS(phoneTo, options.message);
      results.push(smsResult);
    } else {
      // SMS not configured, skip silently or log
      // SMS not configured, skipping
      if (options.type === 'sms') {
        results.push({ success: false, error: "SMS service not configured", method: 'sms' });
      }
    }
  } else if (sendSmsChannel && options.type === "sms") {
    results.push({ success: false, error: "SMS recipient not available", method: "sms" });
  }

  // Update reminder notification_sent if reminderId provided
  if (options.reminderId && results.some(r => r.success)) {
    await supabase
      .from('patient_reminders')
      .update({ notification_sent: true })
      .eq('id', options.reminderId);
  }

  return results;
}

/**
 * Send test result ready notification
 */
export async function sendTestResultNotification(
  patientId: string,
  testName: string,
  testId: string
): Promise<NotificationResult[]> {
  const { data: patient } = await supabase
    .from('patients')
    .select('full_name, email, phone')
    .eq('id', patientId)
    .single();

  if (!patient) {
    return [{ success: false, error: 'Patient not found' }];
  }

  const portalUrl = `${window.location.origin}/auth/patient`;
  const settingsMap = await fetchScopedNotificationSettings(
    ["notification_test_ready_subject", "notification_test_ready_message"],
    { patientId }
  );
  const templateContext = {
    patient_name: patient.full_name,
    test_name: testName,
    test_id: testId,
    portal_url: portalUrl,
  };
  const message = renderNotificationTemplate(
    settingsMap.get("notification_test_ready_message") || NOTIFICATION_TEMPLATE_DEFAULTS.testReadyMessage,
    templateContext
  );
  const subject = renderNotificationTemplate(
    settingsMap.get("notification_test_ready_subject") || NOTIFICATION_TEMPLATE_DEFAULTS.testReadySubject,
    templateContext
  );

  if (!patient.email) {
    return [{ success: false, error: "Patient has no email address" }];
  }

  return sendNotification({
    to: patient.email,
    emailTo: patient.email,
    subject,
    message: message,
    type: "email",
    patientId: patientId,
  });
}

/**
 * Send all tests ready notification for a visit/invoice
 */
export async function sendAllTestsReadyNotification(
  patientId: string,
  testNames: string[]
): Promise<NotificationResult[]> {
  const { data: patient } = await supabase
    .from('patients')
    .select('full_name, email, phone')
    .eq('id', patientId)
    .single();

  if (!patient) {
    return [{ success: false, error: 'Patient not found' }];
  }

  const list = testNames.length > 0 ? testNames.join(", ") : "your tests";
  const portalUrl = `${window.location.origin}/auth/patient`;
  const settingsMap = await fetchScopedNotificationSettings(
    ["notification_all_tests_ready_subject", "notification_all_tests_ready_message"],
    { patientId }
  );
  const templateContext = {
    patient_name: patient.full_name,
    test_list: list,
    test_count: String(testNames.length || 1),
    portal_url: portalUrl,
  };
  const message = renderNotificationTemplate(
    settingsMap.get("notification_all_tests_ready_message") || NOTIFICATION_TEMPLATE_DEFAULTS.allTestsReadyMessage,
    templateContext
  );
  const subject = renderNotificationTemplate(
    settingsMap.get("notification_all_tests_ready_subject") || NOTIFICATION_TEMPLATE_DEFAULTS.allTestsReadySubject,
    templateContext
  );

  if (!patient.email) {
    return [{ success: false, error: "Patient has no email address" }];
  }

  return sendNotification({
    to: patient.email,
    emailTo: patient.email,
    subject,
    message: message,
    type: "email",
    patientId: patientId,
  });
}

/**
 * Send reminder notification
 */
export async function sendReminderNotification(
  reminderId: string
): Promise<NotificationResult[]> {
  const { data: reminder } = await supabase
    .from('patient_reminders')
    .select(`
      *,
      patients (
        full_name,
        email,
        phone
      )
    `)
    .eq('id', reminderId)
    .single();

  if (!reminder || !reminder.patients) {
    return [{ success: false, error: 'Reminder or patient not found' }];
  }

  const patient = reminder.patients as any;
  const notificationMethod = reminder.notification_method || 'both';

  return sendNotification({
    to: patient.email || patient.phone || '',
    subject: reminder.title,
    message: reminder.message || reminder.title,
    type: notificationMethod as NotificationOptions["type"],
    patientId: reminder.patient_id,
    reminderId: reminderId,
  });
}

/**
 * Send promotional message
 */
export async function sendPromotionalMessage(
  patientIds: string[],
  subject: string,
  message: string,
  type: NotificationOptions["type"] = 'both'
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const patientId of patientIds) {
    const results = await sendNotification({
      to: '',
      subject: subject,
      message: message,
      type: type,
      patientId: patientId,
    });

    if (results.some(r => r.success)) {
      sent++;
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Send patient portal credentials after first registration.
 */
export async function sendPatientWelcomeEmail(
  payload: PatientWelcomePayload
): Promise<NotificationResult[]> {
  const hasEmail = !!payload.email?.trim();
  const hasPhone = !!payload.phone?.trim();

  if (!hasEmail && !hasPhone) {
    return [{ success: false, error: "Patient has no email or phone number" }];
  }

  const settingsMap = await fetchScopedNotificationSettings(
    ["notification_patient_welcome_subject", "notification_patient_welcome_message"],
    { organizationId: payload.organizationId || null }
  );
  const templateContext = {
    patient_name: payload.fullName,
    patient_id_code: payload.patientId,
    portal_url: payload.portalUrl,
  };
  const message = renderNotificationTemplate(
    settingsMap.get("notification_patient_welcome_message") || NOTIFICATION_TEMPLATE_DEFAULTS.patientWelcomeMessage,
    templateContext
  );
  const subject = renderNotificationTemplate(
    settingsMap.get("notification_patient_welcome_subject") || NOTIFICATION_TEMPLATE_DEFAULTS.patientWelcomeSubject,
    templateContext
  );

  return sendNotification({
    to: payload.email?.trim() || payload.phone?.trim() || "",
    emailTo: payload.email?.trim() || undefined,
    phoneTo: payload.phone?.trim() || undefined,
    subject,
    message,
    type: hasEmail && hasPhone ? "email_whatsapp" : hasEmail ? "email" : "whatsapp",
    branding: payload.branding,
  });
}

/**
 * Send payment reminder
 */
export async function sendPaymentReminder(
  patientId: string,
  amount: number,
  invoiceNumber?: string
): Promise<NotificationResult[]> {
  const { data: patient } = await supabase
    .from('patients')
    .select('full_name, email, phone')
    .eq('id', patientId)
    .single();

  if (!patient) {
    return [{ success: false, error: 'Patient not found' }];
  }

  const settingsMap = await fetchScopedNotificationSettings(
    ["notification_payment_reminder_subject", "notification_payment_reminder_message"],
    { patientId }
  );
  const templateContext = {
    patient_name: patient.full_name,
    amount: formatCurrencyAmount(amount),
    invoice_number: invoiceNumber || "",
    invoice_suffix: invoiceNumber ? ` (Invoice: ${invoiceNumber})` : "",
  };
  const message = renderNotificationTemplate(
    settingsMap.get("notification_payment_reminder_message") || NOTIFICATION_TEMPLATE_DEFAULTS.paymentReminderMessage,
    templateContext
  );
  const subject = renderNotificationTemplate(
    settingsMap.get("notification_payment_reminder_subject") || NOTIFICATION_TEMPLATE_DEFAULTS.paymentReminderSubject,
    templateContext
  );

  if (!patient.email && !patient.phone) {
    return [{ success: false, error: "Patient has no email or phone number" }];
  }

  const notificationType = patient.email && patient.phone
    ? "email_whatsapp"
    : patient.email
      ? "email"
      : "whatsapp";

  return sendNotification({
    to: patient.email || patient.phone || "",
    subject,
    message: message,
    type: notificationType,
    patientId: patientId,
  });
}

/**
 * Send payment confirmation with portal access details after an invoice is fully paid.
 */
export async function sendPaymentSuccessNotification(
  patientId: string,
  amount: number,
  invoiceNumber?: string,
  businessName?: string,
  portalUrl?: string,
): Promise<NotificationResult[]> {
  const { data: patient } = await supabase
    .from("patients")
    .select("full_name, email, phone")
    .eq("id", patientId)
    .single();

  if (!patient) {
    return [{ success: false, error: "Patient not found" }];
  }

  if (!patient.email && !patient.phone) {
    return [{ success: false, error: "Patient has no email or phone number" }];
  }

  const resolvedBusinessName = businessName || DEFAULT_NOTIFICATION_BRAND.name;
  const resolvedPortalUrl = portalUrl || `${window.location.origin}/auth/patient`;
  const settingsMap = await fetchScopedNotificationSettings(
    ["notification_payment_received_subject", "notification_payment_received_message"],
    { patientId }
  );
  const templateContext = {
    patient_name: patient.full_name,
    amount: formatCurrencyAmount(amount),
    invoice_number: invoiceNumber || "",
    invoice_suffix: invoiceNumber ? ` for invoice ${invoiceNumber}` : "",
    business_name: resolvedBusinessName,
    portal_url: resolvedPortalUrl,
  };
  const message = renderNotificationTemplate(
    settingsMap.get("notification_payment_received_message") || NOTIFICATION_TEMPLATE_DEFAULTS.paymentReceivedMessage,
    templateContext
  );
  const subject = renderNotificationTemplate(
    settingsMap.get("notification_payment_received_subject") || NOTIFICATION_TEMPLATE_DEFAULTS.paymentReceivedSubject,
    templateContext
  );

  return sendNotification({
    to: patient.email || patient.phone || "",
    emailTo: patient.email || undefined,
    phoneTo: patient.phone || undefined,
    subject,
    message,
    type: patient.email && patient.phone ? "email_whatsapp" : patient.email ? "email" : "whatsapp",
    patientId,
    branding: {
      name: resolvedBusinessName,
      website: typeof window !== "undefined" ? window.location.origin : DEFAULT_NOTIFICATION_BRAND.website,
    },
  });
}
