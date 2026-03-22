export type PlanTier = "starter" | "growth" | "premium";

export const PLAN_PRICES: Record<PlanTier, number> = {
  starter: 10000,
  growth: 20000,
  premium: 40000,
};

export const PLAN_LIMITS = {
  starter: {
    labs: 1,
    employees: 5,
    patients: 10000,
    collectionCenters: 1,
  },
  growth: {
    labs: 5,
    employees: 50,
    patients: 100000,
    collectionCenters: 10,
  },
  premium: {
    labs: Infinity,
    employees: Infinity,
    patients: Infinity,
    collectionCenters: Infinity,
  },
} as const;

export const NEXT_PLAN: Partial<Record<PlanTier, PlanTier>> = {
  starter: "growth",
  growth: "premium",
};

export const resolvePlanTier = (value?: string | null): PlanTier => {
  if (value === "growth" || value === "premium") {
    return value;
  }

  return "starter";
};

export const getUpgradeMessage = (
  currentPlan: PlanTier,
  metric: "labs" | "employees" | "patients" | "collectionCenters",
  limit: number
) => {
  const upgradeTo = NEXT_PLAN[currentPlan];
  if (!upgradeTo) {
    return "";
  }

  const currentLabel = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1);
  const upgradeLabel = upgradeTo.charAt(0).toUpperCase() + upgradeTo.slice(1);

  if (metric === "labs") {
    return `${currentLabel} package supports up to ${limit} labs. Upgrade to ${upgradeLabel} to add more labs.`;
  }

  if (metric === "employees") {
    return `${currentLabel} package supports up to ${limit} active employees. Upgrade to ${upgradeLabel} to add more staff.`;
  }

  if (metric === "collectionCenters") {
    return `${currentLabel} package supports up to ${limit} collection centers. Upgrade to ${upgradeLabel} to add more centers.`;
  }

  return `${currentLabel} package supports up to ${limit.toLocaleString("en-IN")} patients. Upgrade to ${upgradeLabel} to keep growing your customer base.`;
};
