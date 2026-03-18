import { Fragment } from "react";
import { format } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronUp, Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAppDate } from "@/lib/date";
import { type TestResult, type CompletedResultRow, getResultSummary } from "./types";
import { ResultsDetail } from "./ResultsDetail";

interface ResultsTableProps {
  completedRows: CompletedResultRow[];
  expandedRows: Set<string>;
  expandedPackageGroups: Set<string>;
  onToggleRow: (id: string) => void;
  onTogglePackageGroup: (groupId: string) => void;
  onDownloadSingle: (test: TestResult) => void;
  onDownloadPackage: (tests: TestResult[]) => void;
  hasOutstandingDues: boolean;
}

function DownloadButton({
  hasOutstandingDues,
  onClick,
}: {
  hasOutstandingDues: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1" disabled={hasOutstandingDues}>
      {hasOutstandingDues ? <Lock className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
      PDF
    </Button>
  );
}

function TestNameCell({ test, indent = false }: { test: TestResult; indent?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${indent ? "pl-6" : ""}`}>
      {test.is_abnormal ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      )}
      {test.test_name}
      {test.is_abnormal && <AlertTriangle className="h-4 w-4 text-red-500" />}
    </div>
  );
}

function DateCell({ test }: { test: TestResult }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span>{formatAppDate(test.test_date)}</span>
      {test.created_at && (
        <span className="text-xs">{format(new Date(test.created_at), "HH:mm")}</span>
      )}
    </div>
  );
}

export function ResultsTable({
  completedRows,
  expandedRows,
  expandedPackageGroups,
  onToggleRow,
  onTogglePackageGroup,
  onDownloadSingle,
  onDownloadPackage,
  hasOutstandingDues,
}: ResultsTableProps) {
  return (
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow className="bg-muted/50">
          <TableHead className="font-semibold">Test Name</TableHead>
          <TableHead className="font-semibold text-center">Result</TableHead>
          <TableHead className="font-semibold text-center">Unit</TableHead>
          <TableHead className="font-semibold text-center">Status</TableHead>
          <TableHead className="font-semibold">Date</TableHead>
          <TableHead className="font-semibold text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {completedRows.map((row) => {
          if (row.kind === "package") {
            const { groupId, tests: testsInGroup } = row;
            const firstTest = testsInGroup[0];
            if (!firstTest) return null;
            const isExpanded = expandedPackageGroups.has(groupId);
            const completedCount = testsInGroup.filter((t) => t.status === "completed").length;

            return (
              <Fragment key={`pkg-${groupId}`}>
                <TableRow className="bg-muted/20">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onTogglePackageGroup(groupId)}
                        className="h-7 w-7 p-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <span>{firstTest.test_package_name || "Package"} ({testsInGroup.length} tests)</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {completedCount}/{testsInGroup.length} results
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">-</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">Package</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <DateCell test={firstTest} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DownloadButton
                      hasOutstandingDues={hasOutstandingDues}
                      onClick={(e) => { e.stopPropagation(); onDownloadPackage(testsInGroup); }}
                    />
                  </TableCell>
                </TableRow>
                {isExpanded &&
                  testsInGroup.map((test) => (
                    <Fragment key={test.id}>
                      <TableRow
                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => onToggleRow(test.id)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2 pl-6">
                            {expandedRows.has(test.id) ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                            {test.test_name}
                            {test.is_abnormal && <AlertTriangle className="h-4 w-4 text-red-500" />}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={test.is_abnormal ? "text-red-600 font-semibold" : "text-green-700 font-medium"}>
                            {getResultSummary(test)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {test.result_items && test.result_items.length > 0 ? "-" : test.result_unit || "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          {test.is_abnormal ? (
                            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Abnormal</Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Normal</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <DateCell test={test} />
                        </TableCell>
                        <TableCell className="text-right">
                          <DownloadButton
                            hasOutstandingDues={hasOutstandingDues}
                            onClick={(e) => { e.stopPropagation(); onDownloadSingle(test); }}
                          />
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(test.id) && (
                        <TableRow key={`${test.id}-details`}>
                          <TableCell colSpan={6} className="bg-muted/20 p-4">
                            <ResultsDetail test={test} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
              </Fragment>
            );
          }

          const { test } = row;
          return (
            <Fragment key={test.id}>
              <TableRow
                className="hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onToggleRow(test.id)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {expandedRows.has(test.id) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    {test.test_name}
                    {test.is_abnormal && <AlertTriangle className="h-4 w-4 text-red-500" />}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span className={test.is_abnormal ? "text-red-600 font-semibold" : "text-green-700 font-medium"}>
                    {getResultSummary(test)}
                  </span>
                </TableCell>
                <TableCell className="text-center text-muted-foreground">
                  {test.result_items && test.result_items.length > 0 ? "-" : test.result_unit || "-"}
                </TableCell>
                <TableCell className="text-center">
                  {test.is_abnormal ? (
                    <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Abnormal</Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Normal</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <DateCell test={test} />
                </TableCell>
                <TableCell className="text-right">
                  <DownloadButton
                    hasOutstandingDues={hasOutstandingDues}
                    onClick={(e) => { e.stopPropagation(); onDownloadSingle(test); }}
                  />
                </TableCell>
              </TableRow>
              {expandedRows.has(test.id) && (
                <TableRow key={`${test.id}-details`}>
                  <TableCell colSpan={6} className="bg-muted/20 p-4">
                    <ResultsDetail test={test} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
