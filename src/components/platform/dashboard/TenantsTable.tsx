import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAppDateTime } from "@/lib/date";

type TenantCard = {
  id: string;
  slug: string;
  displayName: string;
  createdAt: string;
  primaryDomain: string | null;
  fallbackDomain: string | null;
  connected: boolean;
};

interface Props {
  tenants: TenantCard[];
  search: string;
  onSearchChange: (value: string) => void;
  organizationCount: number;
}

export const TenantsTable = ({ tenants, search, onSearchChange, organizationCount }: Props) => (
  <Card className="rounded-[28px] border border-primary/20 bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--secondary)/0.28)_100%)] shadow-sm">
    <CardHeader className="border-b border-border pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="text-2xl text-foreground">Customers</CardTitle>
          <CardDescription>Search the tenant base and inspect public-domain state.</CardDescription>
        </div>
        <Badge variant="outline" className="w-fit border-primary/25 bg-primary/10 text-primary">
          {organizationCount} organizations
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="p-6">
      <div className="relative mb-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="border-primary/20 bg-card/80 pl-10"
          placeholder="Search tenant, slug, or domain"
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-primary/15 bg-card/90">
        <Table>
          <TableHeader className="bg-primary/5">
            <TableRow>
              <TableHead>Organization</TableHead>
              <TableHead>Primary Domain</TableHead>
              <TableHead>Fallback</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell>
                  <div>
                    <p className="font-semibold text-foreground">{tenant.displayName}</p>
                    <p className="text-xs text-muted-foreground">{tenant.slug}</p>
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px] truncate">{tenant.primaryDomain || "-"}</TableCell>
                <TableCell className="max-w-[220px] truncate">{tenant.fallbackDomain || "-"}</TableCell>
                <TableCell>
                  <Badge variant={tenant.connected ? "default" : "secondary"}>
                    {tenant.connected ? "connected" : "needs DNS"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{formatAppDateTime(tenant.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
);
