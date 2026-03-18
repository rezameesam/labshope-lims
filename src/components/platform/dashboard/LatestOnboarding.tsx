import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/date";

type PlatformOnboardingRequest = {
  id: string;
  created_at: string;
  status: string;
  selected_plan: "starter" | "growth" | "premium";
  setup_mode: "self_serve" | "assisted";
  organization_name: string;
  owner_email: string;
  custom_domain: string | null;
  resolved_slug: string | null;
  provisioned_organization_id: string | null;
};

type FilterValue = "all" | "approved" | "self_serve" | "dns";

const FILTER_OPTIONS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "approved", label: "Approved" },
  { value: "self_serve", label: "Self-Serve" },
  { value: "dns", label: "DNS" },
];

interface Props {
  requests: PlatformOnboardingRequest[];
  filter: FilterValue;
  onFilterChange: (value: FilterValue) => void;
}

export const LatestOnboarding = ({ requests, filter, onFilterChange }: Props) => (
  <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <CardHeader className="border-b border-slate-200 pb-5">
      <div className="flex flex-col gap-4">
        <div>
          <CardTitle className="text-2xl text-slate-950">Latest Onboarding</CardTitle>
          <CardDescription>The newest customer setup requests in the queue.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={filter === option.value ? "clinical" : "outline"}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
    </CardHeader>
    <CardContent className="space-y-3 p-6">
      {requests.map((request) => (
        <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-950">{request.organization_name}</p>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  {request.selected_plan}
                </Badge>
                <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                  {request.setup_mode === "self_serve" ? "self-serve" : "assisted"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-slate-500">{request.owner_email}</p>
            </div>
            <Badge variant={request.status === "approved" ? "default" : "secondary"}>
              {request.status}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {request.custom_domain || request.resolved_slug || "No domain preference"}
            {` · ${formatAppDateTime(request.created_at)}`}
          </p>
        </div>
      ))}
    </CardContent>
  </Card>
);
