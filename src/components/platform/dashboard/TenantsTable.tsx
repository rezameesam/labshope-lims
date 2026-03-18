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
  <Card className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
    <CardHeader className="border-b border-slate-200 pb-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="text-2xl text-slate-950">Customers</CardTitle>
          <CardDescription>Search the tenant base and inspect public-domain state.</CardDescription>
        </div>
        <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-700">
          {organizationCount} organizations
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="p-6">
      <div className="relative mb-5 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="border-slate-200 bg-slate-50 pl-10"
          placeholder="Search tenant, slug, or domain"
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <Table>
          <TableHeader className="bg-slate-50">
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
                    <p className="font-semibold text-slate-950">{tenant.displayName}</p>
                    <p className="text-xs text-slate-500">{tenant.slug}</p>
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px] truncate">{tenant.primaryDomain || "-"}</TableCell>
                <TableCell className="max-w-[220px] truncate">{tenant.fallbackDomain || "-"}</TableCell>
                <TableCell>
                  <Badge variant={tenant.connected ? "default" : "secondary"}>
                    {tenant.connected ? "connected" : "needs DNS"}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-500">{formatAppDateTime(tenant.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
);
