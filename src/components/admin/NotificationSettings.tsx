import { useMemo, useState } from "react";
import { Mail, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { getWebsiteHostname } from "@/lib/branding";

const EMAIL_PROVIDER_KEYS = [
  { key: "mailjet_api_key", label: "Mailjet" },
  { key: "resend_api_key", label: "Resend" },
  { key: "mailgun_api_key", label: "Mailgun" },
  { key: "sendgrid_api_key", label: "SendGrid" },
] as const;

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto (priority order)" },
  { value: "mailjet", label: "Mailjet" },
  { value: "resend", label: "Resend" },
  { value: "mailgun", label: "Mailgun" },
  { value: "sendgrid", label: "SendGrid" },
] as const;

const NotificationSettings = () => {
  const { branding, settings } = useOrganization();
  const [testEmail, setTestEmail] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [sendingTest, setSendingTest] = useState(false);
  const fromEmailExample = `no-reply@${getWebsiteHostname(branding.website)}`;
  const edgeFunctionAvailable = Boolean(import.meta.env.VITE_SUPABASE_URL);
  const senderName = settings.email_from_name?.trim() || branding.displayName;
  const senderEmail = settings.email_from_email?.trim() || branding.email || fromEmailExample;
  const replyToEmail = settings.email_reply_to?.trim() || "";

  const orgProviderStatuses = useMemo(
    () =>
      EMAIL_PROVIDER_KEYS.map(({ key, label }) => ({
        label,
        configured: Boolean(settings[key]?.trim()),
      })),
    [settings]
  );

  const hasOrgProviderOverride = orgProviderStatuses.some((provider) => provider.configured);
  const hasOrgSenderOverride = Boolean(
    settings.email_from_name?.trim() || settings.email_from_email?.trim() || settings.email_reply_to?.trim()
  );
  const emailStatus = !edgeFunctionAvailable
    ? { label: "Unavailable", variant: "destructive" as const }
    : hasOrgProviderOverride || hasOrgSenderOverride
      ? { label: "Org Overrides Active", variant: "default" as const }
      : { label: "Using Platform Fallback", variant: "secondary" as const };

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error("Please enter an email address");
      return;
    }

    setSendingTest(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

      const body: Record<string, string> = {
        to: testEmail,
        subject: "Test Email from Clinic System",
        htmlContent: "<p>This is a test email to verify your email notification system is working correctly.</p>",
        textContent: "This is a test email to verify your email notification system is working correctly.",
      };
      if (selectedProvider !== "auto") {
        body.force_provider = selectedProvider;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();
      if (result.success) {
        const providerLabel = result.service ? ` via ${result.service}` : "";
        toast.success(`Test email sent successfully${providerLabel}!`);
      } else {
        toast.error(result.error || "Failed to send test email");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to send test email");
    } finally {
      setSendingTest(false);
    }
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-clinical-navy">Email Notification Settings</h2>
        <p className="text-muted-foreground mt-1">
          Review tenant-specific sender identity and verify email delivery for this organization
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Email sending is handled by the `send-email` edge function with organization overrides first and
                platform-level fallback second
              </CardDescription>
            </div>
            <Badge variant={emailStatus.variant}>
              {emailStatus.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded border bg-muted/30 p-4 text-sm">
              <p className="font-medium">Resolved sender identity</p>
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>Name: {senderName}</p>
                <p>Email: {senderEmail}</p>
                <p>Reply-to: {replyToEmail || "Not set"}</p>
              </div>
            </div>
            <div className="rounded border bg-muted/30 p-4 text-sm">
              <p className="font-medium">Organization provider overrides</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {orgProviderStatuses.map((provider) => (
                  <Badge key={provider.label} variant={provider.configured ? "default" : "outline"}>
                    {provider.label}: {provider.configured ? "Configured" : "Fallback"}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                If all providers show fallback, this organization is still using platform-level edge-function secrets.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notification-test-email">Send test email</Label>
            <div className="flex items-center gap-2">
              <Input
                id="notification-test-email"
                name="test_email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1"
                autoComplete="email"
              />
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleTestEmail}
                disabled={sendingTest || !edgeFunctionAvailable}
              >
                {sendingTest ? "Sending..." : "Send Test"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Option 1: Organization-Specific Provider Credentials (Recommended)</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground mb-4">
              <li>Open `System Settings` and use the `Email Delivery` section for this organization.</li>
              <li>Set sender identity fields such as `email_from_name`, `email_from_email`, and `email_reply_to`.</li>
              <li>Add provider credentials for Mailjet, Resend, Mailgun, or SendGrid at the organization level.</li>
              <li>Use the test email action on this screen after saving the settings.</li>
            </ol>
            <p className="text-xs text-muted-foreground italic">
              This is the preferred sellable-app model because each lab can bring its own sender identity and provider account.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Option 2: Platform Fallback Secrets</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground mb-4">
              <li>Keep shared provider credentials in Supabase Edge Function secrets if you are not ready to let each lab bring its own account yet.</li>
              <li>The `send-email` function still supports Mailjet, Resend, Mailgun, SendGrid, and SMTP-style fallbacks through platform secrets.</li>
              <li>This path is useful for IRM and early staging, but it is less white-label than organization-owned credentials.</li>
            </ol>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Option 3: SMTP-Style Provider Secrets</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground mb-4">
              <li>Examples include Yandex SMTP or Gmail SMTP with an app password.</li>
              <li>Recommended sender domain example: <code className="bg-muted px-1 rounded">{fromEmailExample}</code></li>
              <li>Configure these only at the platform level unless you plan to extend the mailer for full per-organization SMTP credentials.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationSettings;
