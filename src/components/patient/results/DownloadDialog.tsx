import { format } from "date-fns";
import { AlertTriangle, Calendar, CheckCircle, Download, Package, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatAppDate } from "@/lib/date";
import type { TestResult } from "./types";

interface DownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupBy: "date" | "category" | "status" | "package";
  onGroupByChange: (v: "date" | "category" | "status" | "package") => void;
  groupedTests: { grouped: Record<string, TestResult[]>; labels: Map<string, string> };
  selectedTestIds: Set<string>;
  dateFilteredTests: TestResult[];
  startDate: string;
  endDate: string;
  onStartDateChange: (d: string) => void;
  onEndDateChange: (d: string) => void;
  onClearDates: () => void;
  onToggleTest: (id: string) => void;
  onToggleAllInGroup: (tests: TestResult[]) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDownload: () => void;
  hasOutstandingDues: boolean;
}

export function DownloadDialog({
  open, onOpenChange, groupBy, onGroupByChange, groupedTests, selectedTestIds,
  dateFilteredTests, startDate, endDate, onStartDateChange, onEndDateChange, onClearDates,
  onToggleTest, onToggleAllInGroup, onSelectAll, onClearSelection, onDownload, hasOutstandingDues,
}: DownloadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Select Tests to Download
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="grid gap-3 border-b pb-4 sm:flex sm:flex-wrap sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs">From Date</Label>
              <DateInput value={startDate} onChange={onStartDateChange} className="w-full sm:w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To Date</Label>
              <DateInput value={endDate} onChange={onEndDateChange} className="w-full sm:w-40" />
            </div>
            {(startDate || endDate) && (
              <Button variant="ghost" size="sm" onClick={onClearDates} className="w-full sm:w-auto">Clear</Button>
            )}
          </div>
          <div className="flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={groupBy} onValueChange={(v) => onGroupByChange(v as any)}>
              <TabsList className="grid w-full grid-cols-2 sm:w-80 sm:grid-cols-4">
                <TabsTrigger value="date">By Date</TabsTrigger>
                <TabsTrigger value="category">Category</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
                <TabsTrigger value="package">Package</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onSelectAll} className="flex-1 sm:flex-none">Select All</Button>
              <Button variant="ghost" size="sm" onClick={onClearSelection} className="flex-1 sm:flex-none">Clear</Button>
            </div>
          </div>
          {selectedTestIds.size > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{selectedTestIds.size} selected</Badge>
              <span className="text-muted-foreground">of {dateFilteredTests.length} tests</span>
            </div>
          )}
          <ScrollArea className="flex-1 border rounded-lg">
            <div className="p-4 space-y-4">
              {Object.entries(groupedTests.grouped).map(([groupKey, groupTests]) => {
                const groupLabel = groupedTests.labels.get(groupKey) || groupKey;
                return (
                  <div key={groupKey} className="space-y-2">
                    <div className="flex items-center justify-between sticky top-0 bg-background py-1">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        {groupBy === "date" && <Calendar className="h-4 w-4" />}
                        {groupBy === "category" && <Tag className="h-4 w-4" />}
                        {groupBy === "status" && (groupLabel === "Abnormal Results"
                          ? <AlertTriangle className="h-4 w-4 text-red-500" />
                          : <CheckCircle className="h-4 w-4 text-green-500" />)}
                        {groupBy === "package" && <Package className="h-4 w-4" />}
                        {groupLabel}
                      </h4>
                      <Button variant="ghost" size="sm" onClick={() => onToggleAllInGroup(groupTests)} className="text-xs">
                        {groupTests.every(t => selectedTestIds.has(t.id)) ? "Deselect" : "Select All"}
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {groupTests.map((test) => (
                        <label key={test.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded-md cursor-pointer">
                          <Checkbox checked={selectedTestIds.has(test.id)} onCheckedChange={() => onToggleTest(test.id)} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{test.test_name}</span>
                              {test.is_abnormal && <Badge variant="destructive" className="text-xs">Abnormal</Badge>}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatAppDate(test.test_date)}
                              {test.created_at && <span className="ml-1">{format(new Date(test.created_at), "HH:mm")}</span>}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onDownload} disabled={selectedTestIds.size === 0 || hasOutstandingDues} className="gap-2">
            <Download className="h-4 w-4" />
            Download {selectedTestIds.size > 0 ? `(${selectedTestIds.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
