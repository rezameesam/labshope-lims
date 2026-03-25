import { format } from "date-fns";
import { ChevronDown, ChevronUp, Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatAppDate } from "@/lib/date";
import { type TestResult, type CompletedResultRow, getResultSummary } from "./types";
import { ResultsDetail } from "./ResultsDetail";

interface ResultsCardProps {
  row: CompletedResultRow;
  expandedRows: Set<string>;
  expandedPackageGroups: Set<string>;
  onToggleRow: (id: string) => void;
  onTogglePackageGroup: (groupId: string) => void;
  onDownloadSingle: (test: TestResult) => void;
  onDownloadPackage: (tests: TestResult[]) => void;
  hasOutstandingDues: boolean;
}

function SingleTestCard({
  test,
  expandedRows,
  onToggleRow,
  onDownloadSingle,
  hasOutstandingDues,
  nested = false,
}: {
  test: TestResult;
  expandedRows: Set<string>;
  onToggleRow: (id: string) => void;
  onDownloadSingle: (test: TestResult) => void;
  hasOutstandingDues: boolean;
  nested?: boolean;
}) {
  const isExpanded = expandedRows.has(test.id);

  return (
    <div className={nested ? "rounded-2xl border border-border/60 bg-muted/20 p-3" : undefined}>
      <Button
        variant="ghost"
        onClick={() => onToggleRow(test.id)}
        className={`${nested ? "-m-1 flex h-auto w-[calc(100%+0.5rem)] items-start justify-between gap-3 rounded-xl p-1 text-left" : "-m-1 flex h-auto w-[calc(100%+0.5rem)] items-start justify-between gap-3 rounded-xl p-1 text-left"}`}
      >
        <div className="flex min-w-0 items-start gap-2">
          {isExpanded ? (
            <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <p className={`${nested ? "font-medium" : "font-semibold"} text-foreground`}>{test.test_name}</p>
            <p className="text-sm text-muted-foreground">
              {formatAppDate(test.test_date)}
              {test.created_at && (
                <span className="ml-1 text-xs">{format(new Date(test.created_at), "HH:mm")}</span>
              )}
            </p>
          </div>
        </div>
        {test.is_abnormal ? (
          <Badge className="shrink-0 bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20">Abnormal</Badge>
        ) : (
          <Badge className="shrink-0 bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-500/20">Normal</Badge>
        )}
      </Button>

      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Result</span>
          <span className={`text-right font-medium ${test.is_abnormal ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
            {getResultSummary(test)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Unit</span>
          <span className="text-right text-muted-foreground">
            {test.result_items && test.result_items.length > 0 ? "-" : test.result_unit || "-"}
          </span>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={(e) => { e.stopPropagation(); onDownloadSingle(test); }}
        className="mt-3 w-full gap-2"
        disabled={hasOutstandingDues}
      >
        {hasOutstandingDues ? <Lock className="h-4 w-4" /> : <Download className="h-4 w-4" />}
        Download PDF
      </Button>

      {isExpanded && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <ResultsDetail test={test} compact />
        </div>
      )}
    </div>
  );
}

export function ResultsCard({
  row,
  expandedRows,
  expandedPackageGroups,
  onToggleRow,
  onTogglePackageGroup,
  onDownloadSingle,
  onDownloadPackage,
  hasOutstandingDues,
}: ResultsCardProps) {
  if (row.kind === "package") {
    const { groupId, tests } = row;
    const firstTest = tests[0];
    const isExpanded = expandedPackageGroups.has(groupId);
    const completedCount = tests.filter((t) => t.status === "completed").length;

    if (!firstTest) return null;

    return (
      <Card className="border-border/70">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onTogglePackageGroup(groupId)}
              className="-ml-2 h-auto min-h-0 flex-1 justify-start px-2 py-1 text-left"
            >
              <div className="flex items-start gap-2">
                {isExpanded ? (
                  <ChevronUp className="mt-0.5 h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <p className="font-semibold text-foreground">{firstTest.test_package_name || "Package"}</p>
                  <p className="text-sm text-muted-foreground">
                    {tests.length} tests • {completedCount}/{tests.length} results
                  </p>
                </div>
              </div>
            </Button>
            <Badge variant="secondary" className="shrink-0">Package</Badge>
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span>Date</span>
              <span className="text-right">
                {formatAppDate(firstTest.test_date)}
                {firstTest.created_at && (
                  <span className="ml-1 text-xs">{format(new Date(firstTest.created_at), "HH:mm")}</span>
                )}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDownloadPackage(tests); }}
            className="w-full gap-2"
            disabled={hasOutstandingDues}
          >
            {hasOutstandingDues ? <Lock className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            Download Package PDF
          </Button>

          {isExpanded && (
            <div className="space-y-3 border-t border-border/60 pt-3">
              {tests.map((test) => (
                <SingleTestCard
                  key={test.id}
                  test={test}
                  expandedRows={expandedRows}
                  onToggleRow={onToggleRow}
                  onDownloadSingle={onDownloadSingle}
                  hasOutstandingDues={hasOutstandingDues}
                  nested
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70">
      <CardContent className="space-y-4 p-4">
        <SingleTestCard
          test={row.test}
          expandedRows={expandedRows}
          onToggleRow={onToggleRow}
          onDownloadSingle={onDownloadSingle}
          hasOutstandingDues={hasOutstandingDues}
        />
      </CardContent>
    </Card>
  );
}
