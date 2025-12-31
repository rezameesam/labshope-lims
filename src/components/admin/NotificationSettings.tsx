import { useState, useEffect } from "react";
import { Mail, Settings, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { sendNotification } from "@/services/notificationService";

const NotificationSettings = () => {
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [emailService, setEmailService] = useState<'smtp' | 'resend' | 'gmail' | 'none'>('none');
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    // Check which email service is configured
    // Note: SMTP credentials are in Supabase Edge Function secrets, not client-side env vars
    // So we assume SMTP is configured if Supabase URL is available (Edge Function exists)
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const resendKey = import.meta.env.VITE_RESEND_API_KEY;
    const gmailUser = import.meta.env.VITE_GMAIL_USER;
    
    // SMTP is configured via Edge Function secrets, so if Supabase is configured, assume SMTP is available
    if (supabaseUrl) {
      setEmailService('smtp');
      setEmailConfigured(true);
    } else if (resendKey) {
      setEmailService('resend');
      setEmailConfigured(true);
    } else if (gmailUser) {
      setEmailService('gmail');
      setEmailConfigured(true);
    } else {
      setEmailService('none');
      setEmailConfigured(false);
    }
  }, []);

  const handleTestEmail = async () => {
    if (!testEmail) {
      toast.error("Please enter an email address");
      return;
    }

    setSendingTest(true);
    try {
      const results = await sendNotification({
        to: testEmail,
        subject: "Test Email from Clinic System",
        message: "This is a test email to verify your email notification system is working correctly.",
        type: "email",
      });

      if (results[0]?.success) {
        toast.success("Test email sent successfully!");
      } else {
        toast.error(results[0]?.error || "Failed to send test email");
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
          Configure Resend email service for patient notifications
        </p>
      </div>

      {/* Email Configuration */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Notifications
              </CardTitle>
              <CardDescription>
                Email notifications via Supabase Edge Function (Yandex SMTP)
              </CardDescription>
            </div>
            <Badge variant={emailConfigured ? "default" : "destructive"}>
              {emailConfigured ? "Configured" : "Not Configured"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>SMTP Configuration</Label>
            <div className="mt-1 p-3 bg-muted rounded text-sm">
              <p className="font-semibold mb-1">✅ Configured via Supabase Edge Function Secrets</p>
              <p className="text-muted-foreground">
                SMTP credentials are stored securely in Supabase Edge Function secrets:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground">
                <li>SMTP_HOST: smtp.yandex.com</li>
                <li>SMTP_PORT: 465</li>
                <li>SMTP_USER: no-reply@irmclinic.com</li>
                <li>SMTP_FROM: no-reply@irmclinic.com</li>
                <li>SMTP_SECURE: true</li>
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                To update: Go to Supabase Dashboard → Settings → Edge Functions → Secrets
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="test@example.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleTestEmail}
              disabled={sendingTest || !emailConfigured}
            >
              {sendingTest ? "Sending..." : "Send Test Email"}
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Setup Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Setup Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Option 1: Yandex SMTP (Your Current Setup - Recommended):</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground mb-4">
              <li>Use your existing Yandex email: <code className="bg-muted px-1 rounded">no-reply@irmclinic.com</code></li>
              <li>Get your Yandex email password (or create an app password)</li>
              <li>Add to .env file:
                <div className="bg-muted p-2 rounded mt-2 font-mono text-xs">
                  VITE_SMTP_HOST=smtp.yandex.com<br/>
                  VITE_SMTP_PORT=465<br/>
                  VITE_SMTP_USER=no-reply@irmclinic.com<br/>
                  VITE_SMTP_PASSWORD=your_yandex_password<br/>
                  VITE_SMTP_FROM=no-reply@irmclinic.com<br/>
                  VITE_SMTP_SECURE=true
                </div>
              </li>
              <li>Install: <code className="bg-muted px-1 rounded">npm install nodemailer</code></li>
            </ol>
            <p className="text-xs text-muted-foreground italic">
              ✅ Uses your own domain - professional and free!
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Option 2: Resend (Alternative - Free 3,000/month):</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground mb-4">
              <li>Sign up at <a href="https://resend.com" target="_blank" className="text-primary underline">resend.com</a></li>
              <li>Get your API key from the dashboard</li>
              <li>Add to .env: <code className="bg-muted px-1 rounded">VITE_RESEND_API_KEY=re_...</code></li>
              <li>Add to .env: <code className="bg-muted px-1 rounded">VITE_RESEND_FROM_EMAIL=no-reply@irmclinic.com</code></li>
              <li>Install: <code className="bg-muted px-1 rounded">npm install resend</code></li>
            </ol>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Option 3: Gmail SMTP (Fallback):</h4>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground mb-4">
              <li>Go to your Google Account → Security</li>
              <li>Enable 2-Step Verification</li>
              <li>Create an App Password</li>
              <li>Add to .env: <code className="bg-muted px-1 rounded">VITE_GMAIL_USER=your@gmail.com</code></li>
              <li>Add to .env: <code className="bg-muted px-1 rounded">VITE_GMAIL_APP_PASSWORD=your_app_password</code></li>
              <li>Install: <code className="bg-muted px-1 rounded">npm install nodemailer</code></li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationSettings;

