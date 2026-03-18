import { AlertCircle, CheckCircle, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatAppDate } from "@/lib/date";
import { PatientTest, Test, ResultDataState, ResultItemInput } from "./types";

interface TestResultEntryProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTest: PatientTest | null;
  resultData: ResultDataState;
  onResultDataChange: (data: ResultDataState) => void;
  usePanelResults: boolean;
  onUsePanelResultsChange: (value: boolean) => void;
  isSubmitting: boolean;
  testCatalog: Test[];
  onSubmit: (e: React.FormEvent) => void;
  onUpdatePanelItem: (index: number, field: keyof ResultItemInput, value: string) => void;
  onAddPanelItem: () => void;
  onRemovePanelItem: (index: number) => void;
  getDefaultPanelItems: (testName?: string | null) => ResultItemInput[];
  getPanelAbnormal: (items: ResultItemInput[]) => boolean;
  emptyResultItem: () => ResultItemInput;
}

export const TestResultEntry = ({
  isOpen,
  onOpenChange,
  selectedTest,
  resultData,
  onResultDataChange,
  usePanelResults,
  onUsePanelResultsChange,
  isSubmitting,
  testCatalog,
  onSubmit,
  onUpdatePanelItem,
  onAddPanelItem,
  onRemovePanelItem,
  getDefaultPanelItems,
  getPanelAbnormal,
  emptyResultItem,
}: TestResultEntryProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Test Result</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <Card className="border-0 bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{selectedTest?.test_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedTest?.patients?.full_name} • {selectedTest?.patients?.patient_id}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedTest && formatAppDate(selectedTest.test_date)}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={resultData.status}
              onValueChange={(value) => onResultDataChange({ ...resultData, status: value })}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    Pending
                  </div>
                </SelectItem>
                <SelectItem value="in_progress">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-500" />
                    In Progress
                  </div>
                </SelectItem>
                <SelectItem value="completed">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Completed
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Panel Results</p>
              <p className="text-xs text-muted-foreground">
                Use multiple result rows for tests like CBC.
              </p>
            </div>
            <Switch
              checked={usePanelResults}
              onCheckedChange={(checked) => {
                onUsePanelResultsChange(checked);
                if (checked && resultData.result_items.length === 0) {
                  onResultDataChange({
                    ...resultData,
                    result_items: (() => {
                      const defaults = getDefaultPanelItems(selectedTest?.test_name);
                      return defaults.length > 0 ? defaults : [emptyResultItem()];
                    })(),
                    is_abnormal: (() => {
                      const defaults = getDefaultPanelItems(selectedTest?.test_name);
                      return defaults.length > 0 ? getPanelAbnormal(defaults) : false;
                    })(),
                  });
                }
              }}
            />
          </div>

          {usePanelResults ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const defaults = getDefaultPanelItems(selectedTest?.test_name);
                    if (defaults.length === 0) {
                      toast.info("No default panel template available for this test.");
                      return;
                    }
                    onResultDataChange({
                      ...resultData,
                      result_items: defaults,
                      is_abnormal: getPanelAbnormal(defaults),
                    });
                  }}
                >
                  Load Panel Template
                </Button>
              </div>
              {resultData.result_items.map((item, index) => (
                <div key={`panel-item-${index}`} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Result Item {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemovePanelItem(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`panel_item_name_${index}`}>Item Name</Label>
                      <Input
                        id={`panel_item_name_${index}`}
                        name={`panel_item_name_${index}`}
                        value={item.name}
                        onChange={(e) => onUpdatePanelItem(index, "name", e.target.value)}
                        placeholder="e.g. WBC, HGB, PLT"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`panel_item_value_${index}`}>Value</Label>
                      <Input
                        id={`panel_item_value_${index}`}
                        name={`panel_item_value_${index}`}
                        value={item.value}
                        onChange={(e) => onUpdatePanelItem(index, "value", e.target.value)}
                        placeholder="e.g. 7.0"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor={`panel_item_unit_${index}`}>Unit</Label>
                      <Input
                        id={`panel_item_unit_${index}`}
                        name={`panel_item_unit_${index}`}
                        value={item.unit}
                        onChange={(e) => onUpdatePanelItem(index, "unit", e.target.value)}
                        placeholder="e.g. 10^9/L"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`panel_item_min_${index}`}>Normal Min</Label>
                      <Input
                        id={`panel_item_min_${index}`}
                        name={`panel_item_min_${index}`}
                        value={item.normal_range_min}
                        onChange={(e) =>
                          onUpdatePanelItem(index, "normal_range_min", e.target.value)
                        }
                        placeholder="Min"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`panel_item_max_${index}`}>Normal Max</Label>
                      <Input
                        id={`panel_item_max_${index}`}
                        name={`panel_item_max_${index}`}
                        value={item.normal_range_max}
                        onChange={(e) =>
                          onUpdatePanelItem(index, "normal_range_max", e.target.value)
                        }
                        placeholder="Max"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`panel_item_range_${index}`}>Normal Range (Text)</Label>
                    <Input
                      id={`panel_item_range_${index}`}
                      name={`panel_item_range_${index}`}
                      value={item.normal_range_text}
                      onChange={(e) =>
                        onUpdatePanelItem(index, "normal_range_text", e.target.value)
                      }
                      placeholder="Optional: e.g. 3.5 - 10.0"
                    />
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" onClick={onAddPanelItem}>
                Add Result Item
              </Button>
            </div>
          ) : (
            <>
              {/* Numeric Result Value and Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="result_value">Result Value</Label>
                  <div className="relative">
                    <Input
                      id="result_value"
                      type="number"
                      step="any"
                      value={resultData.result_value}
                      onChange={(e) => {
                        const value = e.target.value;
                        const catalogTest = testCatalog.find(
                          (t) => t.name === selectedTest?.test_name
                        );

                        // Auto-detect abnormal based on normal range
                        let isAbnormal = resultData.is_abnormal;
                        if (value && catalogTest) {
                          const numValue = parseFloat(value);
                          if (!isNaN(numValue)) {
                            const min = catalogTest.normal_range_min;
                            const max = catalogTest.normal_range_max;

                            if (min !== null && max !== null) {
                              isAbnormal = numValue < min || numValue > max;
                            } else if (min !== null) {
                              isAbnormal = numValue < min;
                            } else if (max !== null) {
                              isAbnormal = numValue > max;
                            }
                          }
                        }

                        onResultDataChange({
                          ...resultData,
                          result_value: value,
                          is_abnormal: isAbnormal,
                        });
                      }}
                      placeholder="e.g. 12.5"
                      className={(() => {
                        const catalogTest = testCatalog.find(
                          (t) => t.name === selectedTest?.test_name
                        );
                        if (resultData.result_value && catalogTest) {
                          const numValue = parseFloat(resultData.result_value);
                          if (!isNaN(numValue)) {
                            const min = catalogTest.normal_range_min;
                            const max = catalogTest.normal_range_max;
                            let isOutOfRange = false;
                            if (min !== null && max !== null) {
                              isOutOfRange = numValue < min || numValue > max;
                            } else if (min !== null) {
                              isOutOfRange = numValue < min;
                            } else if (max !== null) {
                              isOutOfRange = numValue > max;
                            }
                            if (isOutOfRange) {
                              return "border-red-500 focus-visible:ring-red-500";
                            }
                          }
                        }
                        return "";
                      })()}
                    />
                    {(() => {
                      const catalogTest = testCatalog.find(
                        (t) => t.name === selectedTest?.test_name
                      );
                      if (resultData.result_value && catalogTest) {
                        const numValue = parseFloat(resultData.result_value);
                        if (!isNaN(numValue)) {
                          const min = catalogTest.normal_range_min;
                          const max = catalogTest.normal_range_max;
                          let isOutOfRange = false;
                          if (min !== null && max !== null) {
                            isOutOfRange = numValue < min || numValue > max;
                          } else if (min !== null) {
                            isOutOfRange = numValue < min;
                          } else if (max !== null) {
                            isOutOfRange = numValue > max;
                          }
                          if (isOutOfRange) {
                            return (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <AlertCircle className="h-4 w-4 text-red-500" />
                              </div>
                            );
                          }
                        }
                      }
                      return null;
                    })()}
                  </div>
                  {(() => {
                    const catalogTest = testCatalog.find(
                      (t) => t.name === selectedTest?.test_name
                    );
                    if (resultData.result_value && catalogTest) {
                      const numValue = parseFloat(resultData.result_value);
                      if (!isNaN(numValue)) {
                        const min = catalogTest.normal_range_min;
                        const max = catalogTest.normal_range_max;
                        let isOutOfRange = false;
                        let message = "";
                        if (min !== null && max !== null) {
                          isOutOfRange = numValue < min || numValue > max;
                          if (numValue < min) {
                            message = `Value is below normal range (min: ${min})`;
                          } else if (numValue > max) {
                            message = `Value is above normal range (max: ${max})`;
                          }
                        } else if (min !== null) {
                          isOutOfRange = numValue < min;
                          if (isOutOfRange) {
                            message = `Value is below normal range (min: ${min})`;
                          }
                        } else if (max !== null) {
                          isOutOfRange = numValue > max;
                          if (isOutOfRange) {
                            message = `Value is above normal range (max: ${max})`;
                          }
                        }
                        if (isOutOfRange) {
                          return (
                            <p className="text-xs text-red-600 font-medium mt-1">{message}</p>
                          );
                        } else if (min !== null || max !== null) {
                          return (
                            <p className="text-xs text-green-600 font-medium mt-1">
                              Value is within normal range
                            </p>
                          );
                        }
                      }
                    }
                    return null;
                  })()}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="result_unit">Unit</Label>
                  <Input
                    id="result_unit"
                    value={resultData.result_unit}
                    onChange={(e) =>
                      onResultDataChange({ ...resultData, result_unit: e.target.value })
                    }
                    placeholder="e.g. mg/dL, U/L"
                  />
                </div>
              </div>

              {/* Show Normal Range from Catalog if available */}
              {(() => {
                const catalogTest = testCatalog.find(
                  (t) => t.name === selectedTest?.test_name
                );
                if (
                  catalogTest &&
                  (catalogTest.normal_range_min !== null || catalogTest.normal_range_max !== null)
                ) {
                  const min = catalogTest.normal_range_min;
                  const max = catalogTest.normal_range_max;
                  const rangeText =
                    min !== null && max !== null
                      ? `${min} - ${max} ${catalogTest.unit || ""}`.trim()
                      : min !== null
                      ? `≥ ${min} ${catalogTest.unit || ""}`.trim()
                      : `≤ ${max} ${catalogTest.unit || ""}`.trim();

                  return (
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-sm font-medium text-blue-900">
                        Normal Range (from catalog):
                      </p>
                      <p className="text-sm text-blue-700">{rangeText}</p>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Normal Range */}
              <div className="space-y-2">
                <Label htmlFor="normal_range_text">Normal Range</Label>
                <Input
                  id="normal_range_text"
                  value={resultData.normal_range_text}
                  onChange={(e) =>
                    onResultDataChange({ ...resultData, normal_range_text: e.target.value })
                  }
                  placeholder="e.g. 70-100 mg/dL, < 40 U/L, Negative"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the reference range for this test result
                </p>
              </div>
            </>
          )}

          {/* Text Result (for qualitative results) */}
          <div className="space-y-2">
            <Label htmlFor="result">Result Notes / Qualitative Result</Label>
            <Textarea
              id="result"
              value={resultData.result}
              onChange={(e) => onResultDataChange({ ...resultData, result: e.target.value })}
              placeholder="Enter detailed results, observations, or qualitative findings..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="registry_serial">Registry Serial (optional)</Label>
            <Input
              id="registry_serial"
              value={resultData.registry_serial}
              onChange={(e) =>
                onResultDataChange({ ...resultData, registry_serial: e.target.value })
              }
              placeholder="e.g. REG-2024-1123"
            />
          </div>

          {/* Abnormal Flag */}
          <div
            className={`flex items-center gap-3 p-3 rounded-lg border ${
              resultData.is_abnormal ? "bg-red-50 border-red-200" : "bg-muted/30"
            }`}
          >
            <Checkbox
              id="is_abnormal"
              checked={resultData.is_abnormal}
              onCheckedChange={(checked) =>
                onResultDataChange({ ...resultData, is_abnormal: checked === true })
              }
            />
            <div className="flex-1">
              <Label htmlFor="is_abnormal" className="cursor-pointer font-medium text-foreground">
                Mark as Abnormal
              </Label>
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const catalogTest = testCatalog.find(
                    (t) => t.name === selectedTest?.test_name
                  );
                  if (usePanelResults && resultData.result_items.length > 0) {
                    return "Automatically detected from panel ranges. You can override if needed.";
                  }
                  if (
                    catalogTest &&
                    resultData.result_value &&
                    (catalogTest.normal_range_min !== null ||
                      catalogTest.normal_range_max !== null)
                  ) {
                    return "Automatically detected based on normal range. You can override if needed.";
                  }
                  return "Flag this result if it falls outside the normal range or is qualitatively abnormal";
                })()}
              </p>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Updating..." : "Update Result"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
