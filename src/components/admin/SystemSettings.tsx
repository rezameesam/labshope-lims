import { useCallback, useEffect, useState } from "react";
import { Settings, CreditCard, Mail, Save, Eye, EyeOff, CheckCircle2, MessageCircle, Smartphone, ShieldCheck, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";

interface SystemSetting {
  id: string;
  organization_id?: string | null;
  setting_key: string;
  setting_value: string | null;
  setting_type: string;
  category: string;
  label: string;
  description: string | null;
  is_encrypted: boolean;
  platform_only?: boolean;
}

interface ScopedSetting extends SystemSetting {
  scope: "organization" | "system" | "default";
}

const PAYMENT_SETTING_TEMPLATES: SystemSetting[] = [
  {
    id: "template-payment_provider",
    organization_id: null,
    setting_key: "payment_provider",
    setting_value: "razorpay",
    setting_type: "text",
    category: "payment",
    label: "Payment Provider",
    description: "Choose default online payment provider for patient billing: Razorpay or PhonePe.",
    is_encrypted: false,
  },
  {
    id: "template-razorpay_key_id",
    organization_id: null,
    setting_key: "razorpay_key_id",
    setting_value: "",
    setting_type: "password",
    category: "payment",
    label: "Razorpay Key ID",
    description: "Razorpay API Key ID (starts with rzp_test_ or rzp_live_).",
    is_encrypted: true,
  },
  {
    id: "template-razorpay_key_secret",
    organization_id: null,
    setting_key: "razorpay_key_secret",
    setting_value: "",
    setting_type: "password",
    category: "payment",
    label: "Razorpay Key Secret",
    description: "Razorpay API Key Secret.",
    is_encrypted: true,
  },
  {
    id: "template-razorpay_webhook_secret",
    organization_id: null,
    setting_key: "razorpay_webhook_secret",
    setting_value: "",
    setting_type: "password",
    category: "payment",
    label: "Razorpay Webhook Secret",
    description: "Webhook secret configured in Razorpay dashboard for payment event verification.",
    is_encrypted: true,
  },
  {
    id: "template-razorpay_mode",
    organization_id: null,
    setting_key: "razorpay_mode",
    setting_value: "test",
    setting_type: "text",
    category: "payment",
    label: "Razorpay Mode",
    description: "Use test mode in sandbox and switch to live mode only after validation.",
    is_encrypted: false,
  },
  {
    id: "template-phonepe_merchant_id",
    organization_id: null,
    setting_key: "phonepe_merchant_id",
    setting_value: "",
    setting_type: "password",
    category: "payment",
    label: "PhonePe Merchant ID",
    description: "Merchant ID from PhonePe Payment Gateway dashboard.",
    is_encrypted: true,
  },
  {
    id: "template-phonepe_salt_key",
    organization_id: null,
    setting_key: "phonepe_salt_key",
    setting_value: "",
    setting_type: "password",
    category: "payment",
    label: "PhonePe Salt Key",
    description: "Salt key used to generate X-VERIFY checksum.",
    is_encrypted: true,
  },
  {
    id: "template-phonepe_salt_index",
    organization_id: null,
    setting_key: "phonepe_salt_index",
    setting_value: "1",
    setting_type: "text",
    category: "payment",
    label: "PhonePe Salt Index",
    description: "Salt index mapped to the active PhonePe salt key.",
    is_encrypted: false,
  },
  {
    id: "template-phonepe_base_url",
    organization_id: null,
    setting_key: "phonepe_base_url",
    setting_value: "https://api-preprod.phonepe.com/apis/pg-sandbox",
    setting_type: "text",
    category: "payment",
    label: "PhonePe Base URL",
    description: "Use preprod URL for testing, production URL for live transactions.",
    is_encrypted: false,
  },
  {
    id: "template-payu_key",
    organization_id: null,
    setting_key: "payu_key",
    setting_value: "",
    setting_type: "password",
    category: "payment",
    label: "PayU Key",
    description: "Merchant key from PayU dashboard.",
    is_encrypted: true,
  },
  {
    id: "template-payu_salt",
    organization_id: null,
    setting_key: "payu_salt",
    setting_value: "",
    setting_type: "password",
    category: "payment",
    label: "PayU Salt",
    description: "Merchant salt used for request/response hash verification.",
    is_encrypted: true,
  },
  {
    id: "template-payu_base_url",
    organization_id: null,
    setting_key: "payu_base_url",
    setting_value: "https://test.payu.in",
    setting_type: "text",
    category: "payment",
    label: "PayU Base URL",
    description: "Use https://test.payu.in for testing and https://secure.payu.in for production.",
    is_encrypted: false,
  },
];

const EMAIL_SETTING_TEMPLATES: SystemSetting[] = [
  {
    id: "template-email_from_name",
    organization_id: null,
    setting_key: "email_from_name",
    setting_value: "",
    setting_type: "text",
    category: "email",
    label: "Sender Name",
    description: "Displayed as the sender name for patient emails from this organization.",
    is_encrypted: false,
  },
  {
    id: "template-email_from_email",
    organization_id: null,
    setting_key: "email_from_email",
    setting_value: "",
    setting_type: "text",
    category: "email",
    label: "Sender Email",
    description: "Optional verified sender address for this organization. Falls back to the platform sender if left blank.",
    is_encrypted: false,
  },
  {
    id: "template-email_reply_to",
    organization_id: null,
    setting_key: "email_reply_to",
    setting_value: "",
    setting_type: "text",
    category: "email",
    label: "Reply-To Email",
    description: "Replies from patient emails will be directed here if supported by the configured provider.",
    is_encrypted: false,
  },
  {
    id: "template-mailjet_api_key",
    organization_id: null,
    setting_key: "mailjet_api_key",
    setting_value: "",
    setting_type: "password",
    category: "email",
    label: "Mailjet API Key",
    description: "Optional organization-specific Mailjet API key. Falls back to the platform secret if left blank.",
    is_encrypted: true,
  },
  {
    id: "template-mailjet_secret_key",
    organization_id: null,
    setting_key: "mailjet_secret_key",
    setting_value: "",
    setting_type: "password",
    category: "email",
    label: "Mailjet Secret Key",
    description: "Optional organization-specific Mailjet secret key.",
    is_encrypted: true,
  },
  {
    id: "template-resend_api_key",
    organization_id: null,
    setting_key: "resend_api_key",
    setting_value: "",
    setting_type: "password",
    category: "email",
    label: "Resend API Key",
    description: "Optional organization-specific Resend API key.",
    is_encrypted: true,
  },
  {
    id: "template-mailgun_api_key",
    organization_id: null,
    setting_key: "mailgun_api_key",
    setting_value: "",
    setting_type: "password",
    category: "email",
    label: "Mailgun API Key",
    description: "Optional organization-specific Mailgun API key.",
    is_encrypted: true,
  },
  {
    id: "template-mailgun_domain",
    organization_id: null,
    setting_key: "mailgun_domain",
    setting_value: "",
    setting_type: "text",
    category: "email",
    label: "Mailgun Domain",
    description: "Optional organization-specific Mailgun sending domain.",
    is_encrypted: false,
  },
  {
    id: "template-sendgrid_api_key",
    organization_id: null,
    setting_key: "sendgrid_api_key",
    setting_value: "",
    setting_type: "password",
    category: "email",
    label: "SendGrid API Key",
    description: "Optional organization-specific SendGrid API key.",
    is_encrypted: true,
  },
  {
    id: "template-booking_alert_primary_email",
    organization_id: null,
    setting_key: "booking_alert_primary_email",
    setting_value: "",
    setting_type: "text",
    category: "email",
    label: "Book Test Alert — Primary Email",
    description: "Primary recipient email for new book-test requests submitted from the website. Falls back to the organization's primary email if left blank.",
    is_encrypted: false,
  },
  {
    id: "template-booking_alert_cc_emails",
    organization_id: null,
    setting_key: "booking_alert_cc_emails",
    setting_value: "",
    setting_type: "text",
    category: "email",
    label: "Book Test Alert — CC Emails",
    description: "Comma-separated list of additional email addresses to CC on every new book-test request alert (e.g. manager@lab.com, front-desk@lab.com).",
    is_encrypted: false,
  },
];

const WHATSAPP_SETTING_TEMPLATES: SystemSetting[] = [
  {
    id: "template-whatsapp_enabled",
    organization_id: null,
    setting_key: "whatsapp_enabled",
    setting_value: "false",
    setting_type: "boolean",
    category: "whatsapp",
    label: "WhatsApp Enabled",
    description: "Turn on WhatsApp delivery for OTP and notification flows for this organization.",
    is_encrypted: false,
  },
  {
    id: "template-whatsapp_access_token",
    organization_id: null,
    setting_key: "whatsapp_access_token",
    setting_value: "",
    setting_type: "password",
    category: "whatsapp",
    label: "WhatsApp Access Token",
    description: "Optional organization-specific Meta WhatsApp Cloud API access token. Falls back to the platform secret if left blank.",
    is_encrypted: true,
  },
  {
    id: "template-whatsapp_phone_number_id",
    organization_id: null,
    setting_key: "whatsapp_phone_number_id",
    setting_value: "",
    setting_type: "text",
    category: "whatsapp",
    label: "WhatsApp Phone Number ID",
    description: "Meta WhatsApp phone number ID used for this organization's outbound sends and inbound webhook routing.",
    is_encrypted: false,
  },
  {
    id: "template-whatsapp_api_version",
    organization_id: null,
    setting_key: "whatsapp_api_version",
    setting_value: "",
    setting_type: "text",
    category: "whatsapp",
    label: "WhatsApp API Version",
    description: "Optional override like v23.0. Leave blank to use the platform default.",
    is_encrypted: false,
  },
  {
    id: "template-whatsapp_default_country_code",
    organization_id: null,
    setting_key: "whatsapp_default_country_code",
    setting_value: "91",
    setting_type: "text",
    category: "whatsapp",
    label: "Default Country Code",
    description: "Used to normalize local phone numbers before sending WhatsApp messages.",
    is_encrypted: false,
  },
  {
    id: "template-whatsapp_template_language_code",
    organization_id: null,
    setting_key: "whatsapp_template_language_code",
    setting_value: "en_US",
    setting_type: "text",
    category: "whatsapp",
    label: "Template Language Code",
    description: "Default template language code such as en_US.",
    is_encrypted: false,
  },
  {
    id: "template-whatsapp_otp_template_name",
    organization_id: null,
    setting_key: "whatsapp_otp_template_name",
    setting_value: "",
    setting_type: "text",
    category: "whatsapp",
    label: "OTP Template Name",
    description: "Approved Meta template name used for OTP delivery.",
    is_encrypted: false,
  },
  {
    id: "template-whatsapp_utility_template_name",
    organization_id: null,
    setting_key: "whatsapp_utility_template_name",
    setting_value: "",
    setting_type: "text",
    category: "whatsapp",
    label: "Utility Template Name",
    description: "Approved Meta template name used for operational notifications.",
    is_encrypted: false,
  },
  {
    id: "template-whatsapp_report_template_name",
    organization_id: null,
    setting_key: "whatsapp_report_template_name",
    setting_value: "",
    setting_type: "text",
    category: "whatsapp",
    label: "Report Template Name",
    description: "Approved Meta template name used for report-ready notifications.",
    is_encrypted: false,
  },
  {
    id: "template-whatsapp_verify_token",
    organization_id: null,
    setting_key: "whatsapp_verify_token",
    setting_value: "",
    setting_type: "password",
    category: "whatsapp",
    label: "WhatsApp Verify Token",
    description: "Optional organization-specific Meta webhook verify token used during webhook subscription setup.",
    is_encrypted: true,
  },
  {
    id: "template-whatsapp_app_secret",
    organization_id: null,
    setting_key: "whatsapp_app_secret",
    setting_value: "",
    setting_type: "password",
    category: "whatsapp",
    label: "WhatsApp App Secret",
    description: "Optional organization-specific Meta app secret used to verify inbound webhook signatures.",
    is_encrypted: true,
  },
];

const SMS_SETTING_TEMPLATES: SystemSetting[] = [
  {
    id: "template-demo_mode_enabled",
    organization_id: null,
    setting_key: "demo_mode_enabled",
    setting_value: "",
    setting_type: "boolean",
    category: "sms",
    label: "Demo Mode Enabled",
    description: "When enabled, OTP requests use the demo OTP instead of real delivery for this organization.",
    is_encrypted: false,
  },
  {
    id: "template-msg91_auth_key",
    organization_id: null,
    setting_key: "msg91_auth_key",
    setting_value: "",
    setting_type: "password",
    category: "sms",
    label: "MSG91 Auth Key",
    description: "Optional organization-specific MSG91 auth key used for OTP SMS fallback. Falls back to the platform secret if left blank.",
    is_encrypted: true,
  },
  {
    id: "template-msg91_template_id",
    organization_id: null,
    setting_key: "msg91_template_id",
    setting_value: "",
    setting_type: "text",
    category: "sms",
    label: "MSG91 Template ID",
    description: "Organization-specific MSG91 OTP template ID.",
    is_encrypted: false,
  },
  {
    id: "template-msg91_sender_id",
    organization_id: null,
    setting_key: "msg91_sender_id",
    setting_value: "",
    setting_type: "text",
    category: "sms",
    label: "MSG91 Sender ID",
    description: "Organization-specific MSG91 sender ID used for OTP SMS fallback.",
    is_encrypted: false,
  },
];

const ABDM_SETTING_TEMPLATES: SystemSetting[] = [
  {
    id: "template-abdm_enabled",
    organization_id: null,
    setting_key: "abdm_enabled",
    setting_value: "",
    setting_type: "boolean",
    category: "abdm",
    label: "ABDM Enabled",
    description: "Enable ABDM for this lab. Make sure you have linked your facility to the software's Bridge ID via HFR login before enabling.",
    is_encrypted: false,
  },
  {
    id: "template-abdm_environment",
    organization_id: null,
    setting_key: "abdm_environment",
    setting_value: "sandbox",
    setting_type: "text",
    category: "abdm",
    label: "ABDM Environment",
    description: "Use sandbox for testing. Switch to production only after completing ABDM sandbox verification.",
    is_encrypted: false,
  },
  {
    id: "template-abdm_scan_share_enabled",
    organization_id: null,
    setting_key: "abdm_scan_share_enabled",
    setting_value: "",
    setting_type: "boolean",
    category: "abdm",
    label: "Scan And Share Enabled",
    description: "Enables the QR-based patient intake — patients scan the QR at the front desk and their ABHA profile is shared automatically.",
    is_encrypted: false,
  },
  {
    id: "template-abdm_facility_id",
    organization_id: null,
    setting_key: "abdm_facility_id",
    setting_value: "",
    setting_type: "text",
    category: "abdm",
    label: "HFR Facility ID",
    description: "Your lab's Health Facility Registry (HFR) ID — e.g. IN0710000001. Obtained when you register on the ABDM Health Facility Registry.",
    is_encrypted: false,
  },
  {
    id: "template-abdm_hip_id",
    organization_id: null,
    setting_key: "abdm_hip_id",
    setting_value: "",
    setting_type: "text",
    category: "abdm",
    label: "HIP ID (Service ID)",
    description: "Your lab's HIP / Service ID assigned by ABDM after linking your facility to the Bridge ID via HFR login.",
    is_encrypted: false,
  },
  {
    id: "template-abdm_cm_id",
    organization_id: null,
    setting_key: "abdm_cm_id",
    setting_value: "",
    setting_type: "text",
    category: "abdm",
    label: "ABDM CM ID",
    description: "Consent-manager identifier — defaults to 'sbx' for sandbox. Usually does not need to be changed.",
    is_encrypted: false,
  },
  {
    id: "template-abdm_gateway_base_url",
    organization_id: null,
    setting_key: "abdm_gateway_base_url",
    setting_value: "https://dev.abdm.gov.in",
    setting_type: "text",
    category: "abdm",
    label: "ABDM Gateway Base URL",
    description: "Platform-level gateway base URL. Sandbox: https://dev.abdm.gov.in — shared across all tenants.",
    is_encrypted: false,
    platform_only: true,
  },
  {
    id: "template-abdm_client_id",
    organization_id: null,
    setting_key: "abdm_client_id",
    setting_value: "",
    setting_type: "text",
    category: "abdm",
    label: "ABDM Bridge ID (Client ID)",
    description: "Your software's ABDM Bridge ID / Client ID. This is platform-level — one credential for all tenants. Labs link to this Bridge ID via their HFR login.",
    is_encrypted: false,
    platform_only: true,
  },
  {
    id: "template-abdm_client_secret",
    organization_id: null,
    setting_key: "abdm_client_secret",
    setting_value: "",
    setting_type: "text",
    category: "abdm",
    label: "ABDM Client Secret",
    description: "Gateway client secret for your Bridge ID. Platform-level — shared across all tenants. Labs never need this.",
    is_encrypted: true,
    platform_only: true,
  },
  {
    id: "template-abdm_callback_url",
    organization_id: null,
    setting_key: "abdm_callback_url",
    setting_value: "",
    setting_type: "text",
    category: "abdm",
    label: "ABDM Callback URL",
    description: "Platform-level public callback base URL registered with ABDM for Scan and Share and other push callbacks.",
    is_encrypted: false,
    platform_only: true,
  },
  {
    id: "template-abdm_hpr_id",
    organization_id: null,
    setting_key: "abdm_hpr_id",
    setting_value: "",
    setting_type: "text",
    category: "abdm",
    label: "ABDM HPR ID",
    description: "Healthcare professional identifier used in the Scan and Share profile-share metadata.",
    is_encrypted: false,
  },
];

const GENERAL_SETTING_TEMPLATES: SystemSetting[] = [
  {
    id: "template-branding_tagline",
    organization_id: null,
    setting_key: "branding_tagline",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Brand Tagline",
    description: "Short public-facing tagline used across the site and report header.",
    is_encrypted: false,
  },
  {
    id: "template-branding_description",
    organization_id: null,
    setting_key: "branding_description",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Brand Description",
    description: "Longer organization description used in marketing and landing page sections.",
    is_encrypted: false,
  },
  {
    id: "template-branding_established_year",
    organization_id: null,
    setting_key: "branding_established_year",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Established Year",
    description: "Year displayed in the public site about/history sections.",
    is_encrypted: false,
  },
  {
    id: "template-organization_website",
    organization_id: null,
    setting_key: "organization_website",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Website URL",
    description: "Canonical public website URL for the organization. Leave blank to use the current app origin.",
    is_encrypted: false,
  },
  {
    id: "template-report_tagline",
    organization_id: null,
    setting_key: "report_tagline",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Report Footer Tagline",
    description: "Short line shown at the bottom of generated reports next to the organization name.",
    is_encrypted: false,
  },
  {
    id: "template-report_footer_note",
    organization_id: null,
    setting_key: "report_footer_note",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Report Footer Note",
    description: "Footer note shown on generated PDF reports.",
    is_encrypted: false,
  },
  {
    id: "template-report_default_header_template",
    organization_id: null,
    setting_key: "report_default_header_template",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Default Report Header Template",
    description: "Starter header text when creating a new report template. Supports report template tokens like {patient_name} and {test_date}.",
    is_encrypted: false,
  },
  {
    id: "template-report_default_footer_template",
    organization_id: null,
    setting_key: "report_default_footer_template",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Default Report Footer Template",
    description: "Starter footer text when creating a new report template. Supports report template tokens like {lab_name} and {entered_by}.",
    is_encrypted: false,
  },
  {
    id: "template-trial_period_days",
    organization_id: null,
    setting_key: "trial_period_days",
    setting_value: "14",
    setting_type: "text",
    category: "general",
    label: "Default Trial Period (days)",
    description: "Number of days a newly provisioned organization stays on trial before being auto-suspended. Default is 14.",
    is_encrypted: false,
    platform_only: true,
  },
  {
    id: "template-notification_follow_up_title",
    organization_id: null,
    setting_key: "notification_follow_up_title",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Follow-up Reminder Title",
    description: "Reminder title shown for follow-up reminders. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_follow_up_message",
    organization_id: null,
    setting_key: "notification_follow_up_message",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Follow-up Reminder Message",
    description: "Reminder body for follow-up reminders. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_checkup_title",
    organization_id: null,
    setting_key: "notification_checkup_title",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Checkup Reminder Title",
    description: "Reminder title shown for routine checkup reminders. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_checkup_message",
    organization_id: null,
    setting_key: "notification_checkup_message",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Checkup Reminder Message",
    description: "Reminder body for routine checkup reminders. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_payment_title",
    organization_id: null,
    setting_key: "notification_payment_title",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Payment Reminder Title",
    description: "Reminder title shown for reminder-type payment follow-ups. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_payment_message",
    organization_id: null,
    setting_key: "notification_payment_message",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Payment Reminder Message",
    description: "Reminder body for reminder-type payment follow-ups. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_test_result_title",
    organization_id: null,
    setting_key: "notification_test_result_title",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Test Result Reminder Title",
    description: "Reminder title shown when reminding patients that results are ready. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_test_result_message",
    organization_id: null,
    setting_key: "notification_test_result_message",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Test Result Reminder Message",
    description: "Reminder body shown when reminding patients that results are ready. Supports {patient_name}, {business_name}, and {portal_url}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_custom_title",
    organization_id: null,
    setting_key: "notification_custom_title",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Custom Reminder Title",
    description: "Default reminder title for custom reminders. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
  {
    id: "template-notification_custom_message",
    organization_id: null,
    setting_key: "notification_custom_message",
    setting_value: "",
    setting_type: "text",
    category: "general",
    label: "Custom Reminder Message",
    description: "Default reminder body for custom reminders. Supports {patient_name} and {business_name}.",
    is_encrypted: false,
  },
];

const CATEGORY_ORDER = ["payment", "email", "whatsapp", "sms", "abdm", "other"];
const ORGANIZATION_BRANDING_BUCKET = "organization-branding";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const MAX_FAVICON_BYTES = 512 * 1024;

const sortSettings = (settings: ScopedSetting[]) =>
  [...settings].sort((a, b) => {
    const categoryA = CATEGORY_ORDER.indexOf(a.category);
    const categoryB = CATEGORY_ORDER.indexOf(b.category);
    const normalizedA = categoryA === -1 ? CATEGORY_ORDER.length : categoryA;
    const normalizedB = categoryB === -1 ? CATEGORY_ORDER.length : categoryB;

    if (normalizedA !== normalizedB) {
      return normalizedA - normalizedB;
    }

    return a.label.localeCompare(b.label);
  });

const mergeSettings = (
  systemSettings: SystemSetting[],
  organizationSettings: SystemSetting[],
  useOrganizationScope: boolean,
): ScopedSetting[] => {
  const merged = new Map<string, ScopedSetting>();

  [...systemSettings, ...PAYMENT_SETTING_TEMPLATES, ...EMAIL_SETTING_TEMPLATES, ...WHATSAPP_SETTING_TEMPLATES, ...SMS_SETTING_TEMPLATES, ...ABDM_SETTING_TEMPLATES, ...GENERAL_SETTING_TEMPLATES].forEach((setting) => {
    if (!merged.has(setting.setting_key)) {
      merged.set(setting.setting_key, {
        ...setting,
        scope: setting.id.startsWith("template-") ? "default" : "system",
      });
    }
  });

  organizationSettings.forEach((setting) => {
    const fallback = merged.get(setting.setting_key);
    merged.set(setting.setting_key, {
      ...(fallback || setting),
      ...setting,
      // preserve platform_only from template even when org overrides the value
      platform_only: fallback?.platform_only ?? setting.platform_only,
      scope: "organization",
    });
  });

  if (!useOrganizationScope) {
    return sortSettings(
      Array.from(merged.values()).filter((setting) => setting.scope !== "organization")
    );
  }

  return sortSettings(Array.from(merged.values()));
};

const shouldUseTextarea = (settingKey: string) =>
  settingKey.includes("_message") ||
  settingKey.includes("_template") ||
  settingKey.includes("description") ||
  settingKey.includes("footer_note");

const getProviderHelpLink = (settingKey: string) => {
  if (settingKey.startsWith("razorpay_")) {
    return {
      label: "Open Razorpay Dashboard",
      href: "https://dashboard.razorpay.com/app/website-app-settings/api-keys",
    };
  }

  if (settingKey.startsWith("phonepe_")) {
    return {
      label: "Open PhonePe PG Docs",
      href: "https://developer.phonepe.com/payment-gateway/backend-sdk/nodejs-be-sdk/integration-steps",
    };
  }

  if (settingKey.startsWith("payu_")) {
    return {
      label: "Open PayU Docs",
      href: "https://docs.payu.in/docs/introduction",
    };
  }

  if (settingKey.startsWith("whatsapp_")) {
    return {
      label: "Open Meta WhatsApp Setup",
      href: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    };
  }

  if (settingKey.startsWith("msg91_")) {
    return {
      label: "Open MSG91 OTP Setup",
      href: "https://docs.msg91.com/collection/otp",
    };
  }

  if (settingKey.startsWith("abdm_")) {
    return {
      label: "Open ABDM Sandbox",
      href: "https://sandbox.abdm.gov.in/",
    };
  }

  if (
    settingKey.startsWith("mailjet_") ||
    settingKey.startsWith("resend_") ||
    settingKey.startsWith("mailgun_") ||
    settingKey.startsWith("sendgrid_") ||
    settingKey.startsWith("email_")
  ) {
    return {
      label: "Open Email Provider Setup",
      href: "https://app.resend.com/",
    };
  }

  return null;
};

const SystemSettings = ({ platformMode = false }: { platformMode?: boolean } = {}) => {
  const { user } = useAuth();
  const { organization, branding, refreshOrganization } = useOrganization();
  const [settings, setSettings] = useState<ScopedSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [brandingUploadState, setBrandingUploadState] = useState<{ logo: boolean; favicon: boolean }>({ logo: false, favicon: false });
  const [testingAbdm, setTestingAbdm] = useState(false);
  const [abdmTestResult, setAbdmTestResult] = useState<{ success: boolean; tokenType?: string | null; error?: string | null } | null>(null);
  // In platformMode, always operate on system_settings (no org scope) regardless of user's org membership
  const useOrganizationScope = platformMode ? false : !!organization?.id;
  const organizationId = useOrganizationScope ? (organization?.id ?? null) : null;

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [systemResponse, organizationResponse] = await Promise.all([
        supabase
          .from("system_settings" as any)
          .select("*"),
        useOrganizationScope
          ? supabase
              .from("organization_settings" as any)
              .select("*")
              .eq("organization_id", organizationId)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (systemResponse.error) throw systemResponse.error;
      if (organizationResponse.error) throw organizationResponse.error;

      const mergedSettings = mergeSettings(
        ((systemResponse.data || []) as unknown as SystemSetting[]),
        ((organizationResponse.data || []) as unknown as SystemSetting[]),
        useOrganizationScope
      );

      setSettings(mergedSettings);
      
      // Initialize form data
      const initialData: Record<string, string> = {};
      mergedSettings.forEach((setting) => {
        initialData[setting.setting_key] = setting.setting_value || "";
      });
      setFormData(initialData);
    } catch (error: any) {
      console.error("Error fetching settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [organizationId, useOrganizationScope]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (event?: React.FormEvent) => {
    event?.preventDefault();

    try {
      setSaving(true);

      const changedSettings = settings.filter((setting) => {
        const newValue = formData[setting.setting_key] || "";
        const oldValue = setting.setting_value || "";
        return newValue !== oldValue;
      });

      if (changedSettings.length === 0) {
        toast.success("No changes to save");
        return;
      }

      const updates = changedSettings.map(async (setting) => {
        const newValue = formData[setting.setting_key] || "";

        if (useOrganizationScope && organization?.id) {
          const { error } = await supabase
            .from("organization_settings" as any)
            .upsert(
              {
                organization_id: organization.id,
                setting_key: setting.setting_key,
                setting_value: newValue,
                setting_type: setting.setting_type,
                category: setting.category,
                label: setting.label,
                description: setting.description,
                is_encrypted: setting.is_encrypted,
                updated_by: user?.id,
              },
              {
                onConflict: "organization_id,setting_key",
              }
            );

          if (error) throw error;
          return;
        }

        const { error } = await supabase
          .from("system_settings" as any)
          .upsert(
            {
              setting_key: setting.setting_key,
              setting_value: newValue,
              setting_type: setting.setting_type,
              category: setting.category,
              label: setting.label,
              description: setting.description,
              is_encrypted: setting.is_encrypted,
              updated_by: user?.id,
            },
            {
              onConflict: "setting_key",
            }
          );

        if (error) throw error;
      });

      await Promise.all(updates);

      toast.success(
        useOrganizationScope
          ? `${branding.displayName} settings saved successfully. Organization overrides now take precedence over platform defaults.`
          : "Settings saved successfully! Edge Functions will automatically use these values from the database."
      );

      // Refresh settings
      await fetchSettings();
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const getFileExtension = (file: File) => {
    const fromName = file.name.split(".").pop()?.toLowerCase();
    if (fromName) return fromName;
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "image/svg+xml") return "svg";
    if (file.type === "image/x-icon" || file.type === "image/vnd.microsoft.icon") return "ico";
    return "jpg";
  };

  const validateBrandingAsset = (file: File, kind: "logo" | "favicon") => {
    const allowedTypes =
      kind === "logo"
        ? ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
        : ["image/png", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];
    const maxBytes = kind === "logo" ? MAX_LOGO_BYTES : MAX_FAVICON_BYTES;

    if (!allowedTypes.includes(file.type)) {
      throw new Error(kind === "logo" ? "Logo must be JPG, PNG, WebP, or SVG" : "Favicon must be PNG, WebP, SVG, or ICO");
    }

    if (file.size > maxBytes) {
      throw new Error(kind === "logo" ? "Logo must be 2 MB or smaller" : "Favicon must be 512 KB or smaller");
    }
  };

  const uploadBrandingAsset = async (file: File, kind: "logo" | "favicon") => {
    if (!organization?.id) {
      throw new Error("Organization context is required");
    }

    validateBrandingAsset(file, kind);
    setBrandingUploadState((prev) => ({ ...prev, [kind]: true }));

    try {
      const extension = getFileExtension(file);
      const path = `${organization.id}/${kind}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from(ORGANIZATION_BRANDING_BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(ORGANIZATION_BRANDING_BUCKET).getPublicUrl(path);
      const field = kind === "logo" ? "logo_url" : "favicon_url";
      const { error: updateError } = await supabase
        .from("organizations" as any)
        .update({ [field]: data.publicUrl })
        .eq("id", organization.id);

      if (updateError) throw updateError;

      await refreshOrganization();
      toast.success(`${kind === "logo" ? "Logo" : "Favicon"} updated`);
    } finally {
      setBrandingUploadState((prev) => ({ ...prev, [kind]: false }));
    }
  };

  const handleBrandingAssetSelection = async (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: "logo" | "favicon",
  ) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    if (!file) return;

    try {
      await uploadBrandingAsset(file, kind);
    } catch (error: any) {
      toast.error(error.message || `Failed to upload ${kind}`);
    }
  };

  const handleTestAbdmCredentials = async () => {
    if (!organization?.id) return;
    setTestingAbdm(true);
    setAbdmTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("abdm-scan-share", {
        body: {
          organization_id: organization.id,
          preflight_only: true,
        },
      });
      if (error) {
        setAbdmTestResult({ success: false, error: error.message });
      } else {
        setAbdmTestResult({
          success: data?.success === true,
          tokenType: data?.preflight?.token_type ?? null,
          error: data?.preflight?.error ?? null,
        });
      }
    } catch (err: unknown) {
      setAbdmTestResult({ success: false, error: (err as Error).message || "Test failed" });
    } finally {
      setTestingAbdm(false);
    }
  };

  const renderSettingInput = (setting: ScopedSetting) => {
    if (setting.setting_type === "boolean") {
      return (
        <Select
          value={formData[setting.setting_key] || "false"}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, [setting.setting_key]: value }))
          }
        >
          <SelectTrigger id={setting.setting_key}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Disabled</SelectItem>
            <SelectItem value="true">Enabled</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (setting.setting_key === "payment_provider") {
      return (
        <Select
          value={formData[setting.setting_key] || "razorpay"}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, [setting.setting_key]: value }))
          }
        >
          <SelectTrigger id={setting.setting_key}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="razorpay">Razorpay</SelectItem>
            <SelectItem value="phonepe">PhonePe</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (setting.setting_key === "razorpay_mode") {
      return (
        <Select
          value={formData[setting.setting_key] || "test"}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, [setting.setting_key]: value }))
          }
        >
          <SelectTrigger id={setting.setting_key}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test">Test Mode</SelectItem>
            <SelectItem value="live">Live Mode</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (setting.setting_key === "abdm_environment") {
      return (
        <Select
          value={formData[setting.setting_key] || "sandbox"}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, [setting.setting_key]: value }))
          }
        >
          <SelectTrigger id={setting.setting_key}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sandbox">Sandbox</SelectItem>
            <SelectItem value="production">Production</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (shouldUseTextarea(setting.setting_key)) {
      return (
        <Textarea
          id={setting.setting_key}
          value={formData[setting.setting_key] || ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, [setting.setting_key]: e.target.value }))
          }
          placeholder={`Enter ${setting.label.toLowerCase()}`}
          rows={setting.setting_key.includes("_message") ? 5 : 3}
        />
      );
    }

    return (
      <div className="relative">
        <Input
          id={setting.setting_key}
          type={
            setting.setting_type === "password" && !showSecrets[setting.setting_key]
              ? "password"
              : "text"
          }
          value={formData[setting.setting_key] || ""}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, [setting.setting_key]: e.target.value }))
          }
          placeholder={`Enter ${setting.label.toLowerCase()}`}
          className={setting.is_encrypted ? "pr-10" : ""}
        />
        {setting.setting_type === "password" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3"
            onClick={() => toggleShowSecret(setting.setting_key)}
          >
            {showSecrets[setting.setting_key] ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    );
  };

  const renderSettingField = (setting: ScopedSetting) => {
    const helpLink = getProviderHelpLink(setting.setting_key);

    return (
      <div key={setting.id} className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={setting.setting_key}>
            {setting.label}
            {setting.is_encrypted && (
              <Badge variant="outline" className="ml-2 text-xs">Encrypted</Badge>
            )}
          </Label>
          <div className="flex items-center gap-2">
            {useOrganizationScope && (
              <Badge variant="outline" className="text-xs">
                {setting.scope === "organization" ? "Organization" : "Platform Fallback"}
              </Badge>
            )}
            {isConfigured(setting) && (
              <Badge variant="outline" className="text-xs text-green-600">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Configured
              </Badge>
            )}
          </div>
        </div>
        {setting.description && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{setting.description}</span>
            {helpLink ? (
              <a
                href={helpLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {helpLink.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
        )}
        {renderSettingInput(setting)}
      </div>
    );
  };

  const getSettingsByCategory = (category: string) => {
    if (category === "other") {
      return settings.filter(
        (s) => s.category !== "payment" && s.category !== "email" && s.category !== "whatsapp" && s.category !== "sms" && s.category !== "abdm"
      );
    }
    // In org scope, hide platform-only settings (Bridge ID credentials etc.) — those are set by the platform admin
    if (category === "abdm" && useOrganizationScope) {
      return settings.filter((s) => s.category === category && !s.platform_only);
    }
    return settings.filter((s) => s.category === category && s.setting_key !== "payment_provider");
  };

  const isConfigured = (setting: SystemSetting) => {
    return (formData[setting.setting_key] || "").trim() !== "";
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">
          {useOrganizationScope ? "Organization Settings" : "System Settings"}
        </h2>
        <p className="text-muted-foreground">
          {useOrganizationScope
            ? `Manage payment, email, and WhatsApp configuration for ${branding.displayName}. Empty values continue to use platform defaults.`
            : "Manage API keys and system configuration"}
        </p>
      </div>

      <form onSubmit={(event) => void handleSave(event)} className="space-y-6">
      <Tabs defaultValue="payment" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payment" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Payment Gateway
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-2">
            <Smartphone className="h-4 w-4" />
            SMS & OTP
          </TabsTrigger>
          <TabsTrigger value="abdm" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            ABDM
          </TabsTrigger>
          <TabsTrigger value="other" className="gap-2">
            <Settings className="h-4 w-4" />
            Branding & Reports
          </TabsTrigger>
        </TabsList>

        {/* Payment Settings */}
        <TabsContent value="payment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Gateway Configuration
              </CardTitle>
              <CardDescription>
                Configure Razorpay and PhonePe payment gateway credentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">What this lab needs</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>Razorpay Key ID and Key Secret from the lab's own Razorpay account</li>
                  <li>Webhook Secret after the webhook is created in Razorpay</li>
                  <li>Test mode first, then switch to live mode only after payment checks pass</li>
                </ul>
              </div>

              {getSettingsByCategory("payment").map(renderSettingField)}

              <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-green-900 dark:text-green-100 mb-1">
                      Automatic Integration
                    </p>
                    <p className="text-green-700 dark:text-green-300">
                      {useOrganizationScope
                        ? "Edge Functions automatically read these organization settings first, then fall back to platform defaults if an override is missing."
                        : "Edge Functions automatically read these settings from the database. No manual configuration needed!"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Settings */}
        <TabsContent value="email" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Configuration
              </CardTitle>
              <CardDescription>
                Configure sender identity and the provider this lab wants to use. Platform secrets remain only as a fallback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Recommended order</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                  <li>Set sender name, sender email, and optional reply-to email</li>
                  <li>Choose one provider the lab will actually use</li>
                  <li>Paste only that provider's API credentials here</li>
                </ol>
              </div>

              {getSettingsByCategory("email").map(renderSettingField)}

              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Mailjet, Resend, Mailgun, and SendGrid credentials can now be stored per organization in this form.
                  If you leave them blank, delivery falls back to platform Edge Function secrets. Update platform
                  secrets via:
                </p>
                <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground space-y-1">
                  <li>Supabase Dashboard → Settings → Edge Functions → Secrets</li>
                  <li>CLI: <code className="bg-background px-1 rounded">supabase secrets set KEY=value</code></li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp Settings */}
        <TabsContent value="whatsapp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                WhatsApp Configuration
              </CardTitle>
              <CardDescription>
                Configure WhatsApp Business Cloud API with simple fields for this lab. Platform secrets remain only as fallback values.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getSettingsByCategory("whatsapp").length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>No WhatsApp settings found in database.</p>
                  <p>
                    Run migration <code className="bg-background px-1 rounded">20260225120000_add_whatsapp_integration.sql</code> and refresh this page.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">What this lab needs from Meta</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>WhatsApp Access Token</li>
                      <li>Phone Number ID</li>
                      <li>Verify Token and App Secret for webhook setup</li>
                      <li>Approved template names for OTP and utility/report messages</li>
                    </ul>
                  </div>

                  {getSettingsByCategory("whatsapp").map(renderSettingField)}

                  <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                    These values can be stored per organization in this form. If left blank, the edge functions fall
                    back to platform secrets in Supabase:
                    <div className="mt-2 font-mono text-xs">
                      WHATSAPP_ACCESS_TOKEN<br />
                      WHATSAPP_PHONE_NUMBER_ID<br />
                      WHATSAPP_VERIFY_TOKEN<br />
                      WHATSAPP_APP_SECRET
                    </div>
                    <p className="mt-3 text-xs">
                      If Meta app is in Development mode, add recipient numbers to the WhatsApp API Setup
                      test recipient list before sends will work.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS Settings */}
        <TabsContent value="sms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                SMS & OTP Configuration
              </CardTitle>
              <CardDescription>
                Configure organization-specific OTP behavior and MSG91 fallback credentials.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getSettingsByCategory("sms").length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>No SMS settings found in database.</p>
                  <p>
                    Run migration <code className="bg-background px-1 rounded">20250208000001_add_sms_settings.sql</code> and refresh this page.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Keep OTP setup simple</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      <li>Use demo mode during internal testing</li>
                      <li>Set MSG91 auth key, template ID, and sender ID only when ready for live OTP SMS</li>
                      <li>WhatsApp OTP can still be used first if SMS is not ready yet</li>
                    </ul>
                  </div>

                  {getSettingsByCategory("sms").map(renderSettingField)}
                  <div className="p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                    If an organization-specific MSG91 auth key is not set, OTP SMS fallback still uses the platform secret
                    <code className="bg-background px-1 rounded ml-1">MSG91_AUTH_KEY</code>.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABDM Settings */}
        <TabsContent value="abdm" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                ABDM Integration
              </CardTitle>
              <CardDescription>
                {useOrganizationScope
                  ? "Connect your lab to ABDM. Enter your facility's HFR ID and HIP ID — the platform credentials are managed centrally."
                  : "Platform-level ABDM credentials (Bridge ID). These are shared across all tenants and set here once."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getSettingsByCategory("abdm").length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>No ABDM settings found in database.</p>
                  <p>
                    Run migration <code className="bg-background px-1 rounded">20260315170000_add_abdm_settings_category.sql</code> and refresh this page.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {useOrganizationScope ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm">
                      <p className="font-medium text-blue-900">How to connect your lab to ABDM</p>
                      <ol className="mt-2 list-decimal space-y-1 pl-5 text-blue-800">
                        <li>Register your facility on the <a href="https://facility.abdm.gov.in" target="_blank" rel="noopener noreferrer" className="underline">ABDM Health Facility Registry (HFR)</a> to get your Facility ID</li>
                        <li>Log in to HFR and link your facility to the software's Bridge ID</li>
                        <li>ABDM will assign your facility a HIP ID — enter both below</li>
                        <li>Enable ABDM and Scan &amp; Share to activate the features</li>
                      </ol>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">Platform Bridge ID credentials</p>
                      <p className="mt-1">These are your software's ABDM registration credentials. All tenant labs share these — they only need to provide their own Facility ID and HIP ID.</p>
                    </div>
                  )}

                  {getSettingsByCategory("abdm").map(renderSettingField)}

                  <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Test ABDM session token</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Validates that the Bridge ID credentials (Client ID + Secret) can obtain a gateway session token. Save settings first.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={testingAbdm}
                        onClick={() => void handleTestAbdmCredentials()}
                      >
                        {testingAbdm ? "Testing..." : "Test session token"}
                      </Button>
                      {abdmTestResult !== null && (
                        <Badge
                          variant={abdmTestResult.success ? "default" : "destructive"}
                          className="gap-1"
                        >
                          {abdmTestResult.success ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" />
                              Token obtained{abdmTestResult.tokenType ? ` (${abdmTestResult.tokenType})` : ""}
                            </>
                          ) : (
                            abdmTestResult.error ?? "Session token failed"
                          )}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Other Settings */}
        <TabsContent value="other" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Branding, Reports, and Reminder Copy
              </CardTitle>
              <CardDescription>
                Configure organization-specific branding, PDF report defaults, and reminder message presets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {getSettingsByCategory("other").length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No other settings configured</p>
              ) : (
                <div className="space-y-4">
                  {useOrganizationScope && organization ? (
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">Logo and favicon</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Upload brand assets for this workspace. The logo is used across the lab portal and the favicon updates the browser tab icon.
                        </p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-3 rounded-lg border bg-background p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                              {organization.logo_url ? (
                                <img src={organization.logo_url} alt={`${branding.displayName} logo`} className="h-full w-full object-contain" />
                              ) : (
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">Logo</p>
                              <p className="text-xs text-muted-foreground">JPG, PNG, WebP, or SVG up to 2 MB</p>
                            </div>
                          </div>
                          <Input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/svg+xml"
                            onChange={(event) => void handleBrandingAssetSelection(event, "logo")}
                            disabled={brandingUploadState.logo}
                          />
                          {brandingUploadState.logo ? <p className="text-xs text-muted-foreground">Uploading logo...</p> : null}
                          <p className="text-xs text-muted-foreground break-all">{organization.logo_url || "No logo uploaded yet"}</p>
                        </div>

                        <div className="space-y-3 rounded-lg border bg-background p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                              {organization.favicon_url ? (
                                <img src={organization.favicon_url} alt={`${branding.displayName} favicon`} className="h-8 w-8 object-contain" />
                              ) : (
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">Favicon</p>
                              <p className="text-xs text-muted-foreground">PNG, WebP, SVG, or ICO up to 512 KB</p>
                            </div>
                          </div>
                          <Input
                            type="file"
                            accept="image/png,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico"
                            onChange={(event) => void handleBrandingAssetSelection(event, "favicon")}
                            disabled={brandingUploadState.favicon}
                          />
                          {brandingUploadState.favicon ? <p className="text-xs text-muted-foreground">Uploading favicon...</p> : null}
                          <p className="text-xs text-muted-foreground break-all">{organization.favicon_url || "No favicon uploaded yet"}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {getSettingsByCategory("other").map((setting) => (
                    <div key={setting.id} className="space-y-2">
                      <Label htmlFor={setting.setting_key}>{setting.label}</Label>
                      {setting.description && (
                        <p className="text-xs text-muted-foreground">{setting.description}</p>
                      )}
                      {shouldUseTextarea(setting.setting_key) ? (
                        <Textarea
                          id={setting.setting_key}
                          value={formData[setting.setting_key] || ""}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, [setting.setting_key]: e.target.value }))
                          }
                          placeholder={`Enter ${setting.label.toLowerCase()}`}
                          rows={setting.setting_key.includes("_message") ? 5 : 3}
                        />
                      ) : (
                        <Input
                          id={setting.setting_key}
                          value={formData[setting.setting_key] || ""}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, [setting.setting_key]: e.target.value }))
                          }
                          placeholder={`Enter ${setting.label.toLowerCase()}`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
      </form>
    </div>
  );
};

export default SystemSettings;
