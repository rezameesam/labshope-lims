import { Building2, Globe2, Rocket, Users } from "lucide-react";

type PlatformCounts = {
  organizations: number;
  activeLeads: number;
  onboardingRequests: number;
  pendingDns: number;
  provisionedTenants: number;
  selfServeRequests: number;
};

interface Props {
  counts: PlatformCounts;
}

const METRIC_CARDS = [
  {
    title: "Organizations",
    key: "organizations" as const,
    icon: Building2,
    toneClass: "bg-slate-100 text-slate-700",
  },
  {
    title: "Lead Pipeline",
    key: "activeLeads" as const,
    icon: Users,
    toneClass: "bg-emerald-50 text-emerald-700",
  },
  {
    title: "Onboarding Flow",
    key: "onboardingRequests" as const,
    icon: Rocket,
    toneClass: "bg-blue-50 text-blue-700",
  },
  {
    title: "Pending DNS",
    key: "pendingDns" as const,
    icon: Globe2,
    toneClass: "bg-amber-50 text-amber-700",
  },
];

export const KpiStrip = ({ counts }: Props) => (
  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
    {METRIC_CARDS.map((card) => {
      const Icon = card.icon;
      return (
        <div key={card.title} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className={`inline-flex rounded-xl p-2 ${card.toneClass}`}>
            <Icon className="h-4 w-4" />
          </div>
          <p className="mt-3 font-heading text-3xl font-bold text-slate-950">{counts[card.key]}</p>
          <p className="mt-1 text-sm font-medium text-slate-700">{card.title}</p>
        </div>
      );
    })}
  </div>
);
