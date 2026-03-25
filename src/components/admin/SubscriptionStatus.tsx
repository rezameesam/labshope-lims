import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/hooks/useAuth";
import { PLAN_PRICES, PLAN_LIMITS, NEXT_PLAN, resolvePlanTier, type PlanTier } from "@/lib/planLimits";
import { initiateRazorpayPayment } from "@/services/razorpayService";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Zap,
  ArrowUpCircle,
  Users,
  FlaskConical,
  Building2,
  Loader2,
} from "lucide-react";

const PLAN_LABELS: Record<PlanTier, string> = {
  starter: "Starter",
  growth: "Growth",
  premium: "Premium",
};

const PLAN_FEATURES: Record<PlanTier, string[]> = {
  starter: ["1 lab branch", "Up to 5 staff", "Up to 10,000 patients", "1 collection center"],
  growth: ["Up to 5 lab branches", "Up to 50 staff", "Up to 1,00,000 patients", "Up to 10 collection centers"],
  premium: ["Unlimited branches", "Unlimited staff", "Unlimited patients", "Unlimited collection centers"],
};

function daysUntil(dateStr: string): number {
  const now = new Date();
  const end = new Date(dateStr);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active")
    return (
      <Badge className="gap-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5" /> Active
      </Badge>
    );
  if (status === "trial")
    return (
      <Badge className="gap-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
        <Clock className="h-3.5 w-3.5" /> Trial
      </Badge>
    );
  if (status === "suspended")
    return (
      <Badge className="gap-1.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
        <XCircle className="h-3.5 w-3.5" /> Suspended
      </Badge>
    );
  return (
    <Badge variant="secondary" className="gap-1.5">
      <AlertTriangle className="h-3.5 w-3.5" /> {status}
    </Badge>
  );
}

export default function SubscriptionStatus() {
  const { organization } = useOrganization();
  const { user } = useAuth();

  const [planTier, setPlanTier] = useState<PlanTier>("starter");
  const [orgStatus, setOrgStatus] = useState<string>("active");
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  const load = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const [settingsRes, orgRes] = await Promise.all([
        supabase
          .from("organization_settings")
          .select("setting_value")
          .eq("organization_id", organization.id)
          .eq("setting_key", "plan_tier")
          .maybeSingle(),
        supabase
          .from("organizations")
          .select("status, trial_ends_at")
          .eq("id", organization.id)
          .maybeSingle(),
      ]);
      setPlanTier(resolvePlanTier(settingsRes.data?.setting_value));
      setOrgStatus((orgRes.data as any)?.status ?? "active");
      setTrialEndsAt((orgRes.data as any)?.trial_ends_at ?? null);
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => { void load(); }, [load]);

  const handleUpgrade = useCallback(async () => {
    const upgradeTo = NEXT_PLAN[planTier];
    if (!upgradeTo || !organization?.id || !user) return;
    setUpgrading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`${supabaseUrl}/functions/v1/create-plan-upgrade-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({ organization_id: organization.id, to_plan: upgradeTo }),
      });
      const orderData = await res.json();
      if (!res.ok) throw new Error(orderData.error || "Failed to create order");

      await initiateRazorpayPayment(
        orderData.razorpay_order_id,
        orderData.upgrade_amount,
        `PLAN-UPGRADE-${upgradeTo.toUpperCase()}`,
        user.email ?? "",
        async (paymentId, orderId, signature) => {
          const confirmRes = await fetch(`${supabaseUrl}/functions/v1/confirm-plan-upgrade`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
              apikey: supabaseAnonKey,
            },
            body: JSON.stringify({
              organization_id: organization.id,
              to_plan: upgradeTo,
              razorpay_payment_id: paymentId,
              razorpay_order_id: orderId,
              razorpay_signature: signature,
            }),
          });
          const confirmData = await confirmRes.json();
          if (!confirmRes.ok) throw new Error(confirmData.error || "Failed to confirm payment");
          toast.success(`Upgraded to ${PLAN_LABELS[upgradeTo]}! Welcome aboard.`);
          void load();
        },
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upgrade failed");
    } finally {
      setUpgrading(false);
    }
  }, [planTier, organization?.id, user, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const nextPlan = NEXT_PLAN[planTier];
  const trialDays = trialEndsAt ? daysUntil(trialEndsAt) : null;
  const limits = PLAN_LIMITS[planTier];
  const isTrialUrgent = orgStatus === "trial" && trialDays !== null && trialDays <= 3;
  const isSuspended = orgStatus === "suspended";

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">

      {/* Suspended banner */}
      {isSuspended && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">Account suspended</p>
            <p className="mt-0.5 text-sm text-red-600/80 dark:text-red-400/70">
              Your account has been suspended. Please contact support or upgrade your plan to restore access.
            </p>
          </div>
        </div>
      )}

      {/* Trial countdown banner */}
      {orgStatus === "trial" && trialDays !== null && (
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${
          isTrialUrgent
            ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
            : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
        }`}>
          <Clock className={`mt-0.5 h-5 w-5 shrink-0 ${isTrialUrgent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
          <div className="flex-1">
            <p className={`font-semibold ${isTrialUrgent ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
              {trialDays === 0 ? "Trial expires today" : `${trialDays} day${trialDays === 1 ? "" : "s"} left in trial`}
            </p>
            <p className={`mt-0.5 text-sm ${isTrialUrgent ? "text-red-600/80 dark:text-red-400/70" : "text-amber-600/80 dark:text-amber-400/70"}`}>
              Trial ends {formatDate(trialEndsAt!)}. Upgrade now to keep uninterrupted access.
            </p>
          </div>
          {nextPlan && (
            <Button size="sm" onClick={() => void handleUpgrade()} disabled={upgrading} className="shrink-0">
              {upgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade now"}
            </Button>
          )}
        </div>
      )}

      {/* Current plan card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Current plan</p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-2xl font-bold text-foreground">{PLAN_LABELS[planTier]}</h2>
              <StatusBadge status={orgStatus} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              ₹{(PLAN_PRICES[planTier] / 100).toLocaleString("en-IN")} / year
            </p>
          </div>
          {nextPlan && (
            <Button onClick={() => void handleUpgrade()} disabled={upgrading} className="gap-2 shrink-0">
              {upgrading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
                : <><ArrowUpCircle className="h-4 w-4" /> Upgrade to {PLAN_LABELS[nextPlan]}</>
              }
            </Button>
          )}
          {!nextPlan && (
            <Badge className="gap-1.5 bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-3 py-1.5 text-sm">
              <Zap className="h-3.5 w-3.5" /> Highest plan
            </Badge>
          )}
        </div>

        <Separator className="my-5" />

        {/* Feature list */}
        <ul className="grid gap-2 sm:grid-cols-2">
          {PLAN_FEATURES[planTier].map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-foreground/80">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Usage summary */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground">Plan limits</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <LimitCard
            icon={Building2}
            label="Lab branches"
            limit={limits.labs === Infinity ? "Unlimited" : String(limits.labs)}
          />
          <LimitCard
            icon={Users}
            label="Staff accounts"
            limit={limits.employees === Infinity ? "Unlimited" : String(limits.employees)}
          />
          <LimitCard
            icon={FlaskConical}
            label="Patients"
            limit={limits.patients === Infinity ? "Unlimited" : limits.patients.toLocaleString("en-IN")}
          />
        </div>
      </div>

      {/* Next plan teaser */}
      {nextPlan && (
        <div className="rounded-2xl border border-border bg-muted/40 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Upgrade to {PLAN_LABELS[nextPlan]}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                ₹{(PLAN_PRICES[nextPlan] / 100).toLocaleString("en-IN")} / year &mdash;{" "}
                {PLAN_FEATURES[nextPlan].join(", ")}
              </p>
            </div>
            <Button variant="outline" onClick={() => void handleUpgrade()} disabled={upgrading} className="shrink-0 gap-2">
              {upgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
              Upgrade
            </Button>
          </div>
        </div>
      )}

      {/* Support link */}
      <p className="text-center text-xs text-muted-foreground">
        Questions about your plan?{" "}
        <a href="mailto:support@labshope.com" className="underline underline-offset-2 hover:text-foreground">
          Contact support
        </a>
      </p>
    </div>
  );
}

function LimitCard({ icon: Icon, label, limit }: { icon: React.ElementType; label: string; limit: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="rounded-lg bg-primary/10 p-2">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground">{limit}</p>
      </div>
    </div>
  );
}
