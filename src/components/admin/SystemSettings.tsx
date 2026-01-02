import { useState, useEffect } from "react";
import { Settings, CreditCard, Mail, Save, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SystemSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
  setting_type: string;
  category: string;
  label: string;
  description: string | null;
  is_encrypted: boolean;
}

const SystemSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("system_settings" as any)
        .select("*")
        .order("category")
        .order("label");

      if (error) throw error;

      setSettings((data || []) as unknown as SystemSetting[]);
      
      // Initialize form data
      const initialData: Record<string, string> = {};
      ((data || []) as unknown as SystemSetting[]).forEach((setting) => {
        initialData[setting.setting_key] = setting.setting_value || "";
      });
      setFormData(initialData);
    } catch (error: any) {
      console.error("Error fetching settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Update each setting
      const updates = settings.map(async (setting) => {
        const newValue = formData[setting.setting_key] || "";
        const oldValue = setting.setting_value || "";

        // Only update if value changed
        if (newValue !== oldValue) {
          const { error } = await supabase
            .from("system_settings" as any)
            .update({
              setting_value: newValue,
              updated_by: user?.id,
            })
            .eq("id", setting.id);

          if (error) throw error;
        }
      });

      await Promise.all(updates);

      toast.success("Settings saved successfully! Edge Functions will automatically use these values from the database.");

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

  const getSettingsByCategory = (category: string) => {
    return settings.filter((s) => s.category === category);
  };

  const isConfigured = (setting: SystemSetting) => {
    return setting.setting_value && setting.setting_value.trim() !== "";
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
        <h2 className="text-2xl font-heading font-bold text-clinical-navy">System Settings</h2>
        <p className="text-muted-foreground">Manage API keys and system configuration</p>
      </div>

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
          <TabsTrigger value="other" className="gap-2">
            <Settings className="h-4 w-4" />
            Other
          </TabsTrigger>
        </TabsList>

        {/* Payment Settings */}
        <TabsContent value="payment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Razorpay Configuration
              </CardTitle>
              <CardDescription>
                Configure Razorpay payment gateway credentials. Get your keys from{" "}
                <a
                  href="https://dashboard.razorpay.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Razorpay Dashboard
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {getSettingsByCategory("payment").map((setting) => (
                <div key={setting.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={setting.setting_key}>
                      {setting.label}
                      {setting.is_encrypted && (
                        <Badge variant="outline" className="ml-2 text-xs">Encrypted</Badge>
                      )}
                    </Label>
                    {isConfigured(setting) && (
                      <Badge variant="outline" className="text-xs text-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    )}
                  </div>
                  {setting.description && (
                    <p className="text-xs text-muted-foreground">{setting.description}</p>
                  )}
                  {setting.setting_key === "razorpay_mode" ? (
                    <Select
                      value={formData[setting.setting_key] || "test"}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, [setting.setting_key]: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="test">Test Mode</SelectItem>
                        <SelectItem value="live">Live Mode</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
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
                  )}
                </div>
              ))}

              <div className="p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-green-900 dark:text-green-100 mb-1">
                      Automatic Integration
                    </p>
                    <p className="text-green-700 dark:text-green-300">
                      Edge Functions automatically read these settings from the database. No manual configuration needed!
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
                Email settings are configured via Supabase Edge Function secrets. Use the Supabase Dashboard or CLI to update them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Email service credentials (Mailjet, Resend, SMTP) are stored as Supabase secrets for security.
                  Update them via:
                </p>
                <ul className="list-disc list-inside mt-2 text-sm text-muted-foreground space-y-1">
                  <li>Supabase Dashboard → Settings → Edge Functions → Secrets</li>
                  <li>Or CLI: <code className="bg-background px-1 rounded">supabase secrets set KEY=value</code></li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Other Settings */}
        <TabsContent value="other" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Other Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {getSettingsByCategory("other").length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No other settings configured</p>
              ) : (
                <div className="space-y-4">
                  {getSettingsByCategory("other").map((setting) => (
                    <div key={setting.id} className="space-y-2">
                      <Label htmlFor={setting.setting_key}>{setting.label}</Label>
                      {setting.description && (
                        <p className="text-xs text-muted-foreground">{setting.description}</p>
                      )}
                      <Input
                        id={setting.setting_key}
                        value={formData[setting.setting_key] || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, [setting.setting_key]: e.target.value }))
                        }
                        placeholder={`Enter ${setting.label.toLowerCase()}`}
                      />
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
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
};

export default SystemSettings;
