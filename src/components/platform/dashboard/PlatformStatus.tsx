import { BadgeCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PlatformCounts = {
  pendingDns: number;
  activeLeads: number;
  onboardingRequests: number;
};

interface Props {
  counts: PlatformCounts;
}

export const PlatformStatus = ({ counts }: Props) => (
  <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <CardHeader className="border-b border-slate-200 pb-5">
      <CardTitle className="text-2xl text-slate-950">Platform Status</CardTitle>
      <CardDescription>Short operational readout for the software owner.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4 p-6">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Posture</p>
        <p className="mt-3 text-base font-semibold text-slate-950">
          {counts.pendingDns > 0
            ? "Provisioning is moving, but domain activation still blocks at least one tenant."
            : "No current DNS blockers are visible in the live launch queue."}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Customer Motion</p>
        <p className="mt-3 text-base font-semibold text-slate-950">
          {counts.activeLeads > 0
            ? `${counts.activeLeads} lead${counts.activeLeads === 1 ? "" : "s"} and ${counts.onboardingRequests} onboarding request${counts.onboardingRequests === 1 ? "" : "s"} are active.`
            : "Sales is quiet right now; onboarding and launch quality are the main operational focus."}
        </p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-center gap-3">
          <BadgeCheck className="h-4.5 w-4.5 text-slate-700" />
          <p className="text-sm font-semibold text-slate-950">Next best action</p>
        </div>
        <p className="mt-3 text-sm leading-7 text-slate-600">
          {counts.pendingDns > 0
            ? "Go to onboarding and close the DNS handoff for any provisioned tenant that still shows pending."
            : "Review the newest onboarding requests and convert any ready customer into a live tenant quickly."}
        </p>
      </div>
    </CardContent>
  </Card>
);
