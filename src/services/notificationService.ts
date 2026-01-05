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

// Types
export interface NotificationOptions {
  to: string; // email or phone number
  subject?: string; // for email
  message: string;
  type: 'email' | 'sms' | 'both';
  patientId?: string;
  reminderId?: string;
}

export interface NotificationResult {
  success: boolean;
  error?: string;
  method?: 'email' | 'sms';
}

interface PatientWelcomePayload {
  email: string;
  fullName: string;
  patientId: string;
  portalUrl: string;
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
    // Get Supabase URL and anon key from environment variables
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return { 
        success: false, 
        error: "Supabase configuration missing", 
        method: 'email' 
      };
    }

    // Call the Supabase Edge Function
    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
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
 * Generate email HTML template
 */
function generateEmailTemplate(
  title: string,
  message: string,
  type: 'test_result' | 'reminder' | 'promotion' | 'payment' | 'general'
): string {
  const colors = {
    test_result: '#10B981',
    reminder: '#3B82F6',
    promotion: '#F59E0B',
    payment: '#EF4444',
    general: '#6B7280',
  };

  const color = colors[type] || colors.general;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">${title}</h1>
      </div>
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
        <div style="white-space: pre-wrap; font-size: 16px;">${message}</div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
          <p>This is an automated message from your clinic.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Main notification function
 */
export async function sendNotification(
  options: NotificationOptions
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

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

  // Determine recipients
  const emailTo = options.type === 'email' || options.type === 'both' 
    ? (options.to || patientEmail) 
    : null;
  const smsTo = options.type === 'sms' || options.type === 'both' 
    ? (options.to || patientPhone) 
    : null;

  // Send email
  if (emailTo && (options.type === 'email' || options.type === 'both')) {
    const emailHtml = generateEmailTemplate(
      options.subject || 'Notification',
      options.message,
      'general'
    );
    const emailResult = await sendEmail(emailTo, options.subject || 'Notification', emailHtml);
    results.push(emailResult);
  }

  // Send SMS (only if Twilio is configured)
  if (smsTo && (options.type === 'sms' || options.type === 'both')) {
    const twilioConfigured = !!import.meta.env.VITE_TWILIO_ACCOUNT_SID;
    if (twilioConfigured) {
      const smsResult = await sendSMS(smsTo, options.message);
      results.push(smsResult);
    } else {
      // SMS not configured, skip silently or log
      console.log("SMS not configured, skipping SMS notification");
      if (options.type === 'sms') {
        // If only SMS was requested and it's not configured, return error
        results.push({ success: false, error: "SMS service not configured", method: 'sms' });
      }
    }
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

  const message = `Dear ${patient.full_name},\n\nYour test results for "${testName}" are now ready. Please log in to your patient portal to view and download your report.\n\nThank you!`;

  // Use email if available, otherwise skip (SMS not configured yet)
  const notificationType = patient.email ? 'email' : 'none';
  
  if (notificationType === 'none') {
    return [{ success: false, error: 'Patient has no email address and SMS is not configured' }];
  }

  return sendNotification({
    to: patient.email || '',
    subject: `Test Results Ready: ${testName}`,
    message: message,
    type: 'email',
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
  const message = `Dear ${patient.full_name},\n\nAll your test results are now ready. Tests: ${list}.\n\nPlease log in to your patient portal to view and download your report.\n\nThank you!`;

  const notificationType = patient.email ? 'email' : 'none';
  
  if (notificationType === 'none') {
    return [{ success: false, error: 'Patient has no email address and SMS is not configured' }];
  }

  return sendNotification({
    to: patient.email || '',
    subject: `All Test Results Ready (${testNames.length || 1})`,
    message: message,
    type: 'email',
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
    type: notificationMethod as 'email' | 'sms' | 'both',
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
  type: 'email' | 'sms' | 'both' = 'both'
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

  // Use email if available, otherwise skip (SMS not configured yet)
  const notificationType = patient.email ? 'email' : 'none';
  
  if (notificationType === 'none') {
    return [{ success: false, error: 'Patient has no email address and SMS is not configured' }];
  }

  return sendNotification({
    to: patient.email || '',
    subject: `Payment Reminder: Outstanding Amount ₹${amount.toFixed(2)}`,
    message: message,
    type: 'email',
    patientId: patientId,
  });
}
