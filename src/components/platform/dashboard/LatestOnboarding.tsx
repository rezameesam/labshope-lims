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
  <Card className="rounded-[28px] border border-primary/20 bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--secondary)/0.28)_100%)] shadow-sm">
    <CardHeader className="border-b border-border pb-5">
      <div className="flex flex-col gap-4">
        <div>
          <CardTitle className="text-2xl text-foreground">Latest Onboarding</CardTitle>
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
        <div key={request.id} className="rounded-2xl border border-primary/15 bg-card/85 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{request.organization_name}</p>
                <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                  {request.selected_plan}
                </Badge>
                <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                  {request.setup_mode === "self_serve" ? "self-serve" : "assisted"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{request.owner_email}</p>
            </div>
            <Badge variant={request.status === "approved" ? "default" : "secondary"}>
              {request.status}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {request.custom_domain || request.resolved_slug || "No domain preference"}
            {` · ${formatAppDateTime(request.created_at)}`}
          </p>
        </div>
      ))}
    </CardContent>
  </Card>
);
