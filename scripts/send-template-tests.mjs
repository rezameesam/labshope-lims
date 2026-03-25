import fs from "fs";
import path from "path";

const envPath = path.resolve(".env");
const envRaw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const env = Object.fromEntries(
  envRaw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [key, ...rest] = line.split("=");
      const value = rest.join("=").replace(/^\"|\"$/g, "");
      return [key, value];
    })
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const TO_EMAIL = process.argv[2];

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env");
  process.exit(1);
}

if (!TO_EMAIL) {
  console.error("Usage: node scripts/send-template-tests.mjs you@example.com");
  process.exit(1);
}

const logoUrl = env.VITE_PUBLIC_LOGO_URL || "";

const brand = {
  name: "LabShope LIMS",
  tagline: "Modern lab management software for diagnostic labs.",
  address: "",
  phone: "",
  email: "info@labshope.com",
  primary: "#1E3A8A",
  accent: "#3B82F6",
  background: "#F5F8FF",
  text: "#0F172A",
  muted: "#64748B",
  border: "#E2E8F0",
};

const accentMap = {
  test_result: "#16A34A",
  reminder: brand.accent,
  promotion: "#F59E0B",
  payment: "#DC2626",
  general: brand.primary,
  signup: "#0EA5E9",
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const generateTemplate = (title, message, type) => {
  const accentColor = accentMap[type] || brand.primary;
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
                          logoUrl
                            ? `<img src="${logoUrl}" alt="${brand.name}" width="32" height="32" style="display:block; border-radius:8px; background:#ffffff; padding:3px;">`
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
                    For assistance, contact us at ${brand.phone} or ${brand.email}.
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 28px; border-top:1px solid ${brand.border}; background:#ffffff;">
                  <div style="font-size:12px; color:${brand.muted}; text-align:center;">
                    ${brand.address}<br/>
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
};

const templates = [
  {
    type: "signup",
    subject: "Welcome to LabShope LIMS",
    message:
      "Dear Patient,\n\nYour patient portal access is ready.\n\nPlease log in and update your password on your first visit.\n\nPortal: https://labshope.com/patient",
  },
  {
    type: "test_result",
    subject: "Your Lab Results Are Ready",
    message:
      "Hello,\n\nYour recent lab test results are now available in the patient portal.\n\nPlease log in to view your report securely.",
  },
  {
    type: "reminder",
    subject: "Appointment Reminder",
    message:
      "This is a friendly reminder for your upcoming appointment on 18 Feb 2026 at 11:30 AM.\n\nPlease bring your requisition and identification.",
  },
  {
    type: "payment",
    subject: "Payment Reminder",
    message:
      "We noticed an outstanding balance of ₹1,250 on your account.\n\nPlease clear the payment at your earliest convenience.",
  },
  {
    type: "promotion",
    subject: "Health Checkup Package Offer",
    message:
      "Get 20% off on our Comprehensive Health Checkup Package until 28 Feb.\n\nBook your slot today.",
  },
  {
    type: "general",
    subject: "Clinic Update",
    message:
      "We have extended our collection hours from 7:00 AM to 8:00 PM for your convenience.\n\nThank you for choosing LabShope LIMS.",
  },
];

const sendEmail = async ({ subject, htmlContent, textContent }) => {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      to: TO_EMAIL,
      subject,
      htmlContent,
      textContent,
    }),
  });
  const result = await response.json();
  return { ok: response.ok, result };
};

let sent = 0;
const runAll = process.argv.includes("--all");
const templateFilter = runAll ? null : (process.argv[3] || "").toLowerCase();
for (const template of templates) {
  if (templateFilter && template.type !== templateFilter) {
    continue;
  }
  const htmlContent = generateTemplate(template.subject, template.message, template.type);
  const textContent = `${template.subject}\n\n${template.message}\n\nLabShope LIMS`;
  const { ok, result } = await sendEmail({
    subject: `[Template: ${template.type}] ${template.subject}`,
    htmlContent,
    textContent,
  });
  if (ok && result.success) {
    sent += 1;
    console.log(`Sent: ${template.type}`);
  } else {
    console.error(`Failed: ${template.type}`, result);
  }
}

const total = templateFilter ? sent : templates.length;
console.log(`Finished. Sent ${sent}/${total} emails.`);
