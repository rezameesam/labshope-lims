import { ArrowRight, Globe2, Rocket, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PlatformCounts = {
  activeLeads: number;
  onboardingRequests: number;
  pendingDns: number;
  provisionedTenants: number;
  selfServeRequests: number;
};

interface Props {
  counts: PlatformCounts;
  onNavigate: (href: string) => void;
}

const QUEUE_CARDS = [
  {
    title: "Sales Queue",
    key: "activeLeads" as const,
    description: "Demo requests still in play.",
    helper: "Keep this lean. Every open lead should have a next action.",
    icon: Users,
    iconClass: "bg-emerald-50 text-emerald-700",
    actionLabel: "Open leads",
    href: "/platform/leads",
  },
  {
    title: "Launch Queue",
    key: "onboardingRequests" as const,
    description: "Customer setup requests still moving.",
    helper: "Provision fast and escalate only the complex installs.",
    icon: Rocket,
    iconClass: "bg-blue-50 text-blue-700",
    actionLabel: "Open onboarding",
    href: "/platform/onboarding",
  },
  {
    title: "Domain Watch",
    key: "pendingDns" as const,
    description: "Provisioned custom domains still pending.",
    helper: "Keep fallback domains active until DNS is confirmed live.",
    icon: Globe2,
    iconClass: "bg-amber-50 text-amber-700",
    actionLabel: "Review DNS",
    href: "/platform/onboarding",
  },
] as const;

export const WorkQueues = ({ counts, onNavigate }: Props) => (
  <Card className="rounded-[28px] border border-border bg-card shadow-sm">
    <CardHeader className="border-b border-border pb-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="text-2xl text-foreground">Work Queues</CardTitle>
          <CardDescription>The active operational buckets for the software team.</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="border-border bg-muted/40 text-foreground/80">
            {counts.provisionedTenants} provisioned
          </Badge>
          <Badge variant="outline" className="border-border bg-muted/40 text-foreground/80">
            {counts.selfServeRequests} self-serve
          </Badge>
        </div>
      </div>
    </CardHeader>
    <CardContent className="grid gap-4 p-6 lg:grid-cols-3">
      {QUEUE_CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.title} className="rounded-2xl border border-border bg-muted/40 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className={`rounded-xl p-2.5 ${card.iconClass}`}>
                <Icon className="h-4.5 w-4.5" />
              </div>
              <p className="font-heading text-4xl font-bold text-foreground">{counts[card.key]}</p>
            </div>
            <p className="mt-4 text-lg font-semibold text-foreground">{card.title}</p>
            <p className="mt-2 text-sm text-muted-foreground">{card.description}</p>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">{card.helper}</p>
            <Button
              variant="outline"
              className="mt-5 w-full justify-between border-border bg-card"
              onClick={() => onNavigate(card.href)}
            >
              {card.actionLabel}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </CardContent>
  </Card>
);
