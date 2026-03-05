/**
 * Notification Service
 * Handles sending emails and SMS notifications to patients
 * 
 * Email Setup (Required):
 * 1. Sign up at resend.com
 * 2. Get API key from Resend dashboard
 * 3. Add to environment variables:
 *    - VITE_RESEND_API_KEY=re_your_api_key_here
 *    - VITE_RESEND_FROM_EMAIL=noreply@yourclinic.com
 * 4. Install package: npm install resend
 * 
 * SMS Setup (Optional - can be added later):
 * - Currently disabled, can be enabled by setting up Twilio
 */

import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo.png";
import { formatPhoneForDisplay } from "@/lib/phone";

// Types
export interface NotificationOptions {
  to: string; // email or phone number
  subject?: string; // for email
  message: string;
  type: 'email' | 'sms' | 'whatsapp' | 'both' | 'email_whatsapp' | 'all';
  patientId?: string;
  reminderId?: string;
}

export interface NotificationResult {
  success: boolean;
  error?: string;
  warning?: string;
  method?: 'email' | 'sms' | 'whatsapp';
}

interface PatientWelcomePayload {
  email: string;
  fullName: string;
  patientId: string;
  portalUrl: string;
}

async function getFunctionAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (publishableKey) {
    headers.apikey = publishableKey;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  return headers;
}

/**
 * Send email notification using Supabase Edge Function (server-side)
 * This calls the send-email Edge Function which uses nodemailer on the server
 */
async function sendEmail(
  to: string,
  subject: string,
  htmlContent: string,
  textContent?: string
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

    const headers = await getFunctionAuthHeaders();

    // Call the Supabase Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to,
        subject,
        htmlContent,
        textContent,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        success: false,
        error: result.error || 'Failed to send email',
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
  templateName?: string
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

    const headers = await getFunctionAuthHeaders();

    const response = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to,
        message,
        ...(templateName ? { type: "template", templateName, templateParams: [message] } : {}),
      }),
    });

    let result: any = {};
    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok || !result.success) {
      if (response.status === 401) {
        return {
          success: false,
          error: "Unauthorized to call WhatsApp service. Please sign in again and retry.",
          method: "whatsapp",
        };
      }
      const message = result.error || "Failed to send WhatsApp message";
      const hint = result.hint ? ` ${result.hint}` : "";
      return {
        success: false,
        error: `${message}${hint}`,
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
  type: 'test_result' | 'reminder' | 'promotion' | 'payment' | 'general'
): string {
  const brand = {
    name: "IRM Clinical Laboratory",
    tagline: "Accurate. Reliable. Timely.",
    address: "Old Post Office Building, Budgam, Jammu and Kashmir - 191111",
    phone: "+91-9419034607 | +91-9622635767",
    email: "irmclinic@gmail.com",
    website: "https://irmclinic.com",
    primary: "#1E3A8A",
    accent: "#3B82F6",
    background: "#F5F8FF",
    text: "#0F172A",
    muted: "#64748B",
    border: "#E2E8F0",
  };

  const accentMap: Record<typeof type, string> = {
    test_result: "#16A34A",
    reminder: brand.accent,
    promotion: "#F59E0B",
    payment: "#DC2626",
    general: brand.primary,
  };

  const accentColor = accentMap[type] || brand.primary;
  const logoSource =
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
    <body style="margin:0; padding:0; background:${brand.background}; font-family: 'Segoe UI', Arial, sans-serif; color:${brand.text};">
      <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${preheader}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${brand.background}; padding: 32px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border:1px solid ${brand.border};">
              <tr>
                <td style="padding: 22px 28px; background:${brand.primary}; color:#ffffff;">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="vertical-align:middle; width:56px;">
                        ${
                          logoSource
                            ? `<img src="${logoSource}" alt="${brand.name}" width="32" height="32" style="display:block; border-radius:8px; background:#ffffff; padding:3px;">`
                            : ""
                        }
                      </td>
                      <td style="vertical-align:middle;">
                        <div style="font-size:18px; font-weight:700; letter-spacing:0.3px;">${brand.name}</div>
                        <div style="font-size:12px; opacity:0.85;">${brand.tagline}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding: 28px;">
                  <div style="font-size:20px; font-weight:700; margin-bottom: 10px;">${title}</div>
                  <div style="height:4px; width:64px; background:${accentColor}; border-radius:999px; margin-bottom:18px;"></div>
                  <div style="font-size:15px; line-height:1.7; color:${brand.text};">${formattedMessage}</div>
                  <div style="margin-top:24px; padding:14px 16px; border-left:4px solid ${accentColor}; background:#F8FAFC; border-radius:10px; font-size:13px; color:${brand.muted};">
                    For assistance, contact us at ${brand.phone} or ${brand.email}.<br/>
                    Visit: <a href="${brand.website}" style="color:${accentColor}; text-decoration:none;">${brand.website}</a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 28px; border-top:1px solid ${brand.border}; background:#ffffff;">
                  <div style="font-size:12px; color:${brand.muted}; text-align:center;">
                    ${brand.address}<br/>
                    <a href="${brand.website}" style="color:${brand.muted}; text-decoration:none;">${brand.website}</a><br/>
                    This is an automated message. Please do not reply.
                  </div>
                </td>
              </tr>
            </table>
            <div style="font-size:11px; color:${brand.muted}; margin-top:16px; text-align:center;">
              © ${new Date().getFullYear()} ${brand.name}. All rights reserved.
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
  message: string
): string {
  const website = "https://irmclinic.com";
  const normalized = message.toLowerCase();
  const hasWebsite = normalized.includes("irmclinic.com");

  return [
    title,
    "",
    message,
    hasWebsite ? "" : `Visit: ${website}`,
    "",
    "IRM Clinical Laboratory",
    "Old Post Office Building, Budgam, Jammu and Kashmir - 191111",
    "Phone: +91-9419034607 | +91-9622635767",
    "Email: irmclinic@gmail.com",
    `Website: ${website}`,
    "",
    "This is an automated message. Please do not reply.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Main notification function
 */
export async function sendNotification(
  options: NotificationOptions
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  const website = "https://irmclinic.com";
  const messageHasWebsite = options.message.toLowerCase().includes("irmclinic.com");
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
  const explicitEmail = explicitIsEmail ? explicitTo : null;
  const explicitPhone = explicitTo && !explicitIsEmail ? explicitTo : null;

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
      'general'
    );
    const emailText = generateEmailText(options.subject || "Notification", messageWithWebsite);
    const emailResult = await sendEmail(emailTo, options.subject || 'Notification', emailHtml, emailText);
    results.push(emailResult);
  }

  // Send WhatsApp
  if (phoneTo && sendWhatsAppChannel) {
    const whatsappResult = await sendWhatsApp(phoneTo, messageWithWebsite);
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
      console.log("SMS not configured, skipping SMS notification");
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
  const message = `Dear ${patient.full_name},\n\nYour test results for "${testName}" are now ready.\nReport Reference: ${testId}\n\nPlease log in to your patient portal to view and download your report:\n${portalUrl}\n\nThank you!`;

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
    subject: `Test Results Ready: ${testName}`,
    message: message,
    type: notificationType,
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
  const message = `Dear ${patient.full_name},\n\nAll your test results are now ready. Tests: ${list}.\n\nPlease log in to your patient portal to view and download your report:\n${portalUrl}\n\nThank you!`;

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
    subject: `All Test Results Ready (${testNames.length || 1})`,
    message: message,
    type: notificationType,
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
  const message = `Dear ${payload.fullName},\n\nYour patient portal access has been created.\n\nUser ID: ${payload.patientId}\nTemporary Password: ${payload.patientId}\n\nPortal: ${payload.portalUrl}\n\nPlease log in and change your password on your first visit.\n\nThank you!`;

  return sendNotification({
    to: payload.email,
    subject: "Your Patient Portal Access",
    message,
    type: "email",
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

  const invoiceText = invoiceNumber ? ` (Invoice: ${invoiceNumber})` : '';
  const message = `Dear ${patient.full_name},\n\nYou have an outstanding payment of ₹${amount.toFixed(2)}${invoiceText}. Please make the payment at your earliest convenience.\n\nThank you!`;

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
    subject: `Payment Reminder: Outstanding Amount ₹${amount.toFixed(2)}`,
    message: message,
    type: notificationType,
    patientId: patientId,
  });
}
