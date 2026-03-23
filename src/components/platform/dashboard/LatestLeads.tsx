import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAppDateTime } from "@/lib/date";

type PlatformLead = {
  id: string;
  created_at: string;
  status: string;
  full_name: string;
  lab_name: string;
  city: string | null;
  utm_source: string | null;
};

interface Props {
  leads: PlatformLead[];
  onNavigate: (href: string) => void;
}

export const LatestLeads = ({ leads, onNavigate }: Props) => (
  <Card className="rounded-[28px] border border-primary/20 bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--secondary)/0.28)_100%)] shadow-sm">
    <CardHeader className="border-b border-border pb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <CardTitle className="text-2xl text-foreground">Latest Leads</CardTitle>
          <CardDescription>Most recent inbound product interest.</CardDescription>
        </div>
        <Button variant="ghost" className="text-muted-foreground" onClick={() => onNavigate("/platform/leads")}>
          View all
        </Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-3 p-6">
      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active leads right now.</p>
      ) : (
        leads.map((lead) => (
          <div key={lead.id} tabIndex={0} className="rounded-2xl border border-primary/15 bg-card/85 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:-translate-y-0.5 focus-visible:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">{lead.lab_name}</p>
                <p className="text-sm text-muted-foreground">{lead.full_name}</p>
              </div>
              <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                {lead.status}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {lead.city || "City not provided"}
              {lead.utm_source ? ` · ${lead.utm_source}` : ""}
              {` · ${formatAppDateTime(lead.created_at)}`}
            </p>
          </div>
        ))
      )}
    </CardContent>
  </Card>
);
