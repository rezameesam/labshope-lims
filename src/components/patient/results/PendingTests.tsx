import { format } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAppDate } from "@/lib/date";
import type { TestResult } from "./types";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed": return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
    case "pending": return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
    case "in_progress": return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Progress</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

interface PendingTestsProps {
  tests: TestResult[];
  isMobile: boolean;
}

export function PendingTests({ tests, isMobile }: PendingTestsProps) {
  if (tests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-yellow-700">
          <AlertTriangle className="h-5 w-5" />
          Pending Tests
        </CardTitle>
        <CardDescription>{tests.length} test{tests.length !== 1 ? "s" : ""} awaiting results</CardDescription>
      </CardHeader>
      <CardContent>
        {isMobile ? (
          <div className="space-y-3">
            {tests.map((test) => (
              <Card key={test.id} className="border-border/70">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{test.test_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatAppDate(test.test_date)}
                        {test.created_at && (
                          <span className="ml-1 text-xs">{format(new Date(test.created_at), "HH:mm")}</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0"><StatusBadge status={test.status} /></div>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                    {test.notes || "No notes added yet."}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Test Name</TableHead>
                <TableHead className="font-semibold text-center">Status</TableHead>
                <TableHead className="font-semibold">Date Ordered</TableHead>
                <TableHead className="font-semibold">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map((test) => (
                <TableRow key={test.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{test.test_name}</TableCell>
                  <TableCell className="text-center"><StatusBadge status={test.status} /></TableCell>
                  <TableCell className="text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <span>{formatAppDate(test.test_date)}</span>
                      {test.created_at && <span className="text-xs">{format(new Date(test.created_at), "HH:mm")}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{test.notes || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
