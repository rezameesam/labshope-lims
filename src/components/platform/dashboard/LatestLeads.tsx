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
  <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <CardHeader className="border-b border-slate-200 pb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <CardTitle className="text-2xl text-slate-950">Latest Leads</CardTitle>
          <CardDescription>Most recent inbound product interest.</CardDescription>
        </div>
        <Button variant="ghost" className="text-slate-600" onClick={() => onNavigate("/platform/leads")}>
          View all
        </Button>
      </div>
    </CardHeader>
    <CardContent className="space-y-3 p-6">
      {leads.length === 0 ? (
        <p className="text-sm text-slate-500">No active leads right now.</p>
      ) : (
        leads.map((lead) => (
          <div key={lead.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-950">{lead.lab_name}</p>
                <p className="text-sm text-slate-500">{lead.full_name}</p>
              </div>
              <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                {lead.status}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-slate-500">
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
