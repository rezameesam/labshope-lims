import { useCallback, useEffect, useState } from "react";
import { NEXT_PLAN, PLAN_LIMITS, PLAN_PRICES, resolvePlanTier } from "@/lib/planLimits";
import { supabase } from "@/integrations/supabase/client";
import { initiateRazorpayPayment } from "@/services/razorpayService";
import { toast } from "sonner";

export type PlanLimitInfo = {
  currentPlan: string;
  exceededMetric: string;
  currentValue: number;
  limit: number;
  upgradeTo: string;
  upgradePrice: number;
};

type UseAdminPlanLimitOptions = {
  organizationId?: string;
  organizationLoading: boolean;
  organizationSlug?: string;
  userEmail?: string;
};

const getDismissKey = (organizationId: string) => `plan_limit_dismissed_${organizationId}`;

export const useAdminPlanLimit = ({
  organizationId,
  organizationLoading,
  organizationSlug,
  userEmail,
}: UseAdminPlanLimitOptions) => {
  const [planLimitOpen, setPlanLimitOpen] = useState(false);
  const [planLimitInfo, setPlanLimitInfo] = useState<PlanLimitInfo | null>(null);
  const [upgradingPlan, setUpgradingPlan] = useState(false);

  useEffect(() => {
    if (!organizationId || organizationLoading) {
      return;
    }

    const dismissKey = getDismissKey(organizationId);
    if (sessionStorage.getItem(dismissKey)) {
      return;
    }

    const checkPlanLimits = async () => {
      const [settingsResult, patientsResult, labsResult, employeesResult] = await Promise.all([
        (supabase as any)
          .from("organization_settings")
          .select("setting_value")
          .eq("organization_id", organizationId)
          .eq("setting_key", "plan_tier")
          .maybeSingle(),
        (supabase as any)
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        (supabase as any)
          .from("labs")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        (supabase as any)
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("is_active", true),
      ]);

      const currentPlan = resolvePlanTier(settingsResult.data?.setting_value);
      const patientCount: number = patientsResult.count ?? 0;
      const labCount: number = labsResult.count ?? 0;
      const employeeCount: number = employeesResult.count ?? 0;
      const limits = PLAN_LIMITS[currentPlan];
      const upgradeTo = NEXT_PLAN[currentPlan];

      const exceeded =
        (Number.isFinite(limits.labs) && labCount > limits.labs && {
          exceededMetric: "labs",
          currentValue: labCount,
          limit: limits.labs,
        }) ||
        (Number.isFinite(limits.employees) && employeeCount > limits.employees && {
          exceededMetric: "active employees",
          currentValue: employeeCount,
          limit: limits.employees,
        }) ||
        (Number.isFinite(limits.patients) && patientCount > limits.patients && {
          exceededMetric: "active patients",
          currentValue: patientCount,
          limit: limits.patients,
        });

      if (exceeded && upgradeTo) {
        setPlanLimitInfo({
          currentPlan,
          exceededMetric: exceeded.exceededMetric,
          currentValue: exceeded.currentValue,
          limit: exceeded.limit,
          upgradeTo,
          upgradePrice: (PLAN_PRICES[upgradeTo] ?? 0) - (PLAN_PRICES[currentPlan] ?? 0),
        });
        setPlanLimitOpen(true);
      }
    };

    void checkPlanLimits();
  }, [organizationId, organizationLoading]);

  const dismissPlanLimit = useCallback(() => {
    if (organizationId) {
      sessionStorage.setItem(getDismissKey(organizationId), "1");
    }

    setPlanLimitOpen(false);
  }, [organizationId]);

  const handlePlanLimitOpenChange = useCallback((open: boolean) => {
    if (!open && organizationId) {
      sessionStorage.setItem(getDismissKey(organizationId), "1");
    }

    setPlanLimitOpen(open);
  }, [organizationId]);

  const handleUpgradeNow = useCallback(async () => {
    if (!planLimitInfo || !organizationId || !organizationSlug) {
      return;
    }

    setUpgradingPlan(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-plan-upgrade-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            organization_id: organizationId,
            to_plan: planLimitInfo.upgradeTo,
          }),
        },
      );
      const orderData = await resp.json();

      if (!resp.ok) {
        throw new Error(orderData.error || "Failed to create order");
      }

      await initiateRazorpayPayment(
        orderData.key_id,
        orderData.order_id,
        orderData.upgrade_amount,
        `PLAN-UPGRADE-${planLimitInfo.upgradeTo.toUpperCase()}`,
        organizationSlug,
        userEmail ?? "",
        userEmail ?? "",
        "",
        async (razorpayResponse) => {
          try {
            const confirmResp = await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-plan-upgrade`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                  organization_id: organizationId,
                  to_plan: planLimitInfo.upgradeTo,
                  razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                  razorpay_order_id: razorpayResponse.razorpay_order_id,
                  razorpay_signature: razorpayResponse.razorpay_signature,
                }),
              },
            );
            const confirmData = await confirmResp.json();

            if (!confirmResp.ok) {
              throw new Error(confirmData.error || "Plan activation failed");
            }

            toast.success(`Plan upgraded to ${planLimitInfo.upgradeTo}! Thank you.`);
            setPlanLimitOpen(false);
            sessionStorage.removeItem(getDismissKey(organizationId));
          } catch (confirmErr: any) {
            toast.error(confirmErr.message || "Plan activation failed. Contact support with your payment ID.");
          } finally {
            setUpgradingPlan(false);
          }
        },
        (errMsg) => {
          if (errMsg !== "Payment cancelled by user") {
            toast.error(errMsg);
          }

          setUpgradingPlan(false);
        },
      );
    } catch (error: any) {
      toast.error(error.message || "Upgrade failed. Please try again.");
    } finally {
      setUpgradingPlan(false);
    }
  }, [organizationId, organizationSlug, planLimitInfo, userEmail]);

  return {
    planLimitInfo,
    planLimitOpen,
    upgradingPlan,
    dismissPlanLimit,
    handlePlanLimitOpenChange,
    handleUpgradeNow,
  };
};
