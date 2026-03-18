import { Fragment } from "react";
import { AbdmCareContextButton } from "../AbdmCareContextButton";
import { Calendar, CheckCircle, Clock, ChevronDown, ChevronUp, History } from "lucide-react";
import { DataPagination } from "@/components/ui/data-pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { formatAppDate } from "@/lib/date";
import { PatientTest } from "./types";

type PagedRow =
  | { kind: "single"; test: PatientTest }
  | { kind: "package"; groupId: string };

interface TestTableProps {
  loading: boolean;
  filteredTests: PatientTest[];
  pagedRows: PagedRow[];
  groupedRows: {
    rows: PagedRow[];
    groupMap: Map<string, PatientTest[]>;
  };
  selectedTestIds: string[];
  expandedPackageGroups: Set<string>;
  organizationId: string | null;
  linkedTestIds: Set<string>;
  statusFilter: string;
  safePage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onTogglePrintSelection: (testId: string) => void;
  onToggleAllSelection: () => void;
  onTogglePackageSelection: (groupId: string) => void;
  onToggleExpandPackageGroup: (groupId: string) => void;
  onOpenResultDialog: (test: PatientTest) => void;
  onOpenAuditDialog: (test: PatientTest) => void;
  getStatusBadge: (status: string) => React.ReactNode;
}

export const TestTable = ({
  loading,
  filteredTests,
  pagedRows,
  groupedRows,
  selectedTestIds,
  expandedPackageGroups,
  organizationId,
  linkedTestIds,
  statusFilter,
  safePage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onTogglePrintSelection,
  onToggleAllSelection,
  onTogglePackageSelection,
  onToggleExpandPackageGroup,
  onOpenResultDialog,
  onOpenAuditDialog,
  getStatusBadge,
}: TestTableProps) => {
  return (
    <Card className="border-0 shadow-md">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={
                    selectedTestIds.length > 0 &&
                    selectedTestIds.length ===
                      filteredTests.filter((t) => t.status === "completed").length
                  }
                  onCheckedChange={onToggleAllSelection}
                  aria-label="Select all completed tests"
                />
              </TableHead>
              <TableHead className="font-semibold">Patient</TableHead>
              <TableHead className="font-semibold">Test</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Lab</TableHead>
              <TableHead className="font-semibold">Collection Center</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Result</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    Loading tests...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredTests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  {statusFilter !== "all"
                    ? `No ${statusFilter.replace("_", " ")} tests found`
                    : "No tests found"}
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row) => {
                if (row.kind === "package") {
                  const testsInGroup = groupedRows.groupMap.get(row.groupId) || [];
                  if (testsInGroup.length === 0) {
                    return null;
                  }
                  const firstTest = testsInGroup[0];
                  const completedInGroup = testsInGroup.filter(
                    (t) => t.status === "completed"
                  ).length;
                  const totalInGroup = testsInGroup.length;
                  const hasCompleted = completedInGroup > 0;
                  const allCompleted = completedInGroup === totalInGroup;
                  const groupStatus = allCompleted
                    ? "completed"
                    : testsInGroup.some((t) => t.status === "in_progress")
                    ? "in_progress"
                    : "pending";
                  const isExpanded = expandedPackageGroups.has(row.groupId);

                  return (
                    <Fragment key={`package-${row.groupId}`}>
                      <TableRow className="bg-muted/30">
                        <TableCell>
                          <Checkbox
                            checked={
                              hasCompleted &&
                              testsInGroup
                                .filter((t) => t.status === "completed")
                                .every((t) => selectedTestIds.includes(t.id))
                            }
                            onCheckedChange={() => onTogglePackageSelection(row.groupId)}
                            disabled={!hasCompleted}
                            aria-label={`Select ${firstTest.test_package_name || "package"} tests`}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{firstTest.patients?.full_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {firstTest.patients?.patient_id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onToggleExpandPackageGroup(row.groupId)}
                              className="h-7 w-7 p-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <div>
                              <p className="font-medium">
                                {firstTest.test_package_name || "Package"} ({totalInGroup} tests)
                              </p>
                              <p className="text-xs text-muted-foreground">Package group</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{formatAppDate(firstTest.test_date)}</span>
                            </div>
                            {firstTest.created_at && (
                              <span className="text-xs text-muted-foreground ml-5">
                                {format(new Date(firstTest.created_at), "HH:mm")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {firstTest.labs?.lab_code ? (
                            <span className="text-sm font-mono font-medium">
                              {firstTest.labs.lab_code}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {firstTest.collection_centers?.code ? (
                            <span className="text-sm font-mono font-medium">
                              {firstTest.collection_centers.code}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(groupStatus)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {completedInGroup}/{totalInGroup} completed
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onToggleExpandPackageGroup(row.groupId)}
                            className="gap-1.5"
                          >
                            {isExpanded ? "Hide Tests" : "View Tests"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded &&
                        testsInGroup.map((test) => (
                          <TableRow
                            key={test.id}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedTestIds.includes(test.id)}
                                onCheckedChange={() => onTogglePrintSelection(test.id)}
                                disabled={test.status !== "completed"}
                                aria-label={`Select ${test.test_name}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{test.patients?.full_name}</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {test.patients?.patient_id}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{test.test_name}</p>
                              {test.notes && (
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {test.notes}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm">{formatAppDate(test.test_date)}</span>
                                </div>
                                {test.created_at && (
                                  <span className="text-xs text-muted-foreground ml-5">
                                    {format(new Date(test.created_at), "HH:mm")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {test.labs?.lab_code ? (
                                <span className="text-sm font-mono font-medium">
                                  {test.labs.lab_code}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {test.collection_centers?.code ? (
                                <span className="text-sm font-mono font-medium">
                                  {test.collection_centers.code}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>{getStatusBadge(test.status)}</TableCell>
                            <TableCell>
                              {test.result_items && test.result_items.length > 0 ? (
                                <span className="text-sm font-medium">
                                  Panel ({test.result_items.length})
                                </span>
                              ) : test.result_value !== null &&
                                test.result_value !== undefined ? (
                                <span className="text-sm font-medium">
                                  {test.result_value}
                                  {test.result_unit && ` ${test.result_unit}`}
                                </span>
                              ) : test.result ? (
                                <span className="text-sm truncate max-w-[150px] block">
                                  {test.result.substring(0, 50)}
                                  {test.result.length > 50 ? "..." : ""}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onOpenAuditDialog(test)}
                                  className="gap-1 text-muted-foreground hover:text-foreground"
                                  title="View audit history"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onOpenResultDialog(test)}
                                  className="gap-1.5"
                                >
                                  {test.status === "completed" ? (
                                    <>
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      View
                                    </>
                                  ) : (
                                    <>
                                      <Clock className="h-3.5 w-3.5" />
                                      Update
                                    </>
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </Fragment>
                  );
                }

                const test = row.test;
                return (
                  <TableRow key={test.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Checkbox
                        checked={selectedTestIds.includes(test.id)}
                        onCheckedChange={() => onTogglePrintSelection(test.id)}
                        disabled={test.status !== "completed"}
                        aria-label={`Select ${test.test_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{test.patients?.full_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {test.patients?.patient_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{test.test_name}</p>
                      {test.notes && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {test.notes}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{formatAppDate(test.test_date)}</span>
                        </div>
                        {test.created_at && (
                          <span className="text-xs text-muted-foreground ml-5">
                            {format(new Date(test.created_at), "HH:mm")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {test.labs?.lab_code ? (
                        <span className="text-sm font-mono font-medium">
                          {test.labs.lab_code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {test.collection_centers?.code ? (
                        <span className="text-sm font-mono font-medium">
                          {test.collection_centers.code}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(test.status)}</TableCell>
                    <TableCell>
                      {test.result_items && test.result_items.length > 0 ? (
                        <span className="text-sm font-medium">
                          Panel ({test.result_items.length})
                        </span>
                      ) : test.result_value !== null && test.result_value !== undefined ? (
                        <span className="text-sm font-medium">
                          {test.result_value}
                          {test.result_unit && ` ${test.result_unit}`}
                        </span>
                      ) : test.result ? (
                        <span className="text-sm truncate max-w-[150px] block">
                          {test.result.substring(0, 50)}
                          {test.result.length > 50 ? "..." : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {test.status === "completed" && organizationId && (
                          <AbdmCareContextButton
                            organizationId={organizationId}
                            patientId={test.patient_id}
                            patientTestId={test.id}
                            careContextReference={test.id}
                            careContextDisplay={`${test.test_name} — ${
                              test.test_date
                                ? new Date(test.test_date).toLocaleDateString("en-IN")
                                : "N/A"
                            }`}
                            abhaAddress={(test.patients as any)?.abha_address ?? null}
                            initialLinked={linkedTestIds.has(test.id)}
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onOpenAuditDialog(test)}
                          className="gap-1 text-muted-foreground hover:text-foreground"
                          title="View audit history"
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenResultDialog(test)}
                          className="gap-1.5"
                        >
                          {test.status === "completed" ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5" />
                              View
                            </>
                          ) : (
                            <>
                              <Clock className="h-3.5 w-3.5" />
                              Update
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <DataPagination
        total={groupedRows.rows.length}
        page={safePage}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </Card>
  );
};
