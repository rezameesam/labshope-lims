import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Send,
  FlaskConical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLab } from "@/contexts/LabContext";
import { formatAppDate } from "@/lib/date";

interface PendingTest {
  id: string;
  patient_id: string;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  normal_range_text: string | null;
  is_abnormal: boolean | null;
  lab_id: string | null;
  patients: {
    patient_id: string;
    full_name: string;
    phone: string;
  };
}

interface CatalogTest {
  id: string;
  name: string;
  unit: string | null;
  normal_range_text: string | null;
  normal_range_min: number | null;
  normal_range_max: number | null;
}

type PendingResultsWidgetProps = {
  onNavigate?: (tabId: string) => void;
};

const PendingResultsWidget = ({ onNavigate }: PendingResultsWidgetProps) => {
  const { user, isCollector } = useAuth();
  const { organization } = useOrganization();
  const { currentLab } = useLab();
  const organizationId = organization?.id ?? null;

  const [pendingTests, setPendingTests] = useState<PendingTest[]>([]);
  const [testCatalog, setTestCatalog] = useState<CatalogTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  // Inline result state
  const [resultValue, setResultValue] = useState("");
  const [resultUnit, setResultUnit] = useState("");
  const [isAbnormal, setIsAbnormal] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const catalogByName = useMemo(
    () => new Map(testCatalog.map((t) => [t.name, t] as const)),
    [testCatalog],
  );

  const fetchPending = useCallback(async () => {
    if (!organizationId) return;

    try {
      let query = (supabase as any)
        .from("patient_tests")
        .select(`
          id, patient_id, test_name, test_date, status,
          result, result_value, result_unit, normal_range_text, is_abnormal,
          lab_id,
          patients (patient_id, full_name, phone)
        `)
        .in("status", ["pending", "in_progress"])
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (isCollector && user?.id) {
        query = query.eq("collected_by", user.id);
      }

      const [testsRes, catalogRes] = await Promise.all([
        query,
        (supabase as any)
          .from("tests")
          .select("id, name, unit, normal_range_text, normal_range_min, normal_range_max")
          .eq("is_active", true)
          .eq("organization_id", organizationId),
      ]);

      if (testsRes.error) throw testsRes.error;
      setPendingTests(testsRes.data || []);
      setTestCatalog((catalogRes.data || []) as CatalogTest[]);
    } catch (error) {
      console.error("Error fetching pending tests:", error);
    } finally {
      setLoading(false);
    }
  }, [organizationId, isCollector, user?.id]);

  useEffect(() => {
    void fetchPending();

    // Refresh every 30s so newly added tests show up
    const intervalId = window.setInterval(() => {
      void fetchPending();
    }, 30_000);

    // Also refresh when tab becomes visible or when QuickRegisterForm submits
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void fetchPending();
    };
    const handleTestsAdded = () => void fetchPending();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("quick-register-submitted", handleTestsAdded);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("quick-register-submitted", handleTestsAdded);
    };
  }, [fetchPending]);

  const handleExpand = (test: PendingTest) => {
    if (expandedTestId === test.id) {
      setExpandedTestId(null);
      return;
    }

    setExpandedTestId(test.id);
    setResultValue(test.result_value != null ? String(test.result_value) : "");
    setIsAbnormal(test.is_abnormal || false);

    // Pre-fill unit from catalog
    const catalogEntry = catalogByName.get(test.test_name);
    setResultUnit(test.result_unit || catalogEntry?.unit || "");
  };

  const handleQuickComplete = async (test: PendingTest) => {
    if (!organizationId) return;

    if (!resultValue.trim()) {
      toast.error("Please enter a result value");
      return;
    }

    setSubmittingId(test.id);

    try {
      const catalogEntry = catalogByName.get(test.test_name);
      const numericValue = parseFloat(resultValue);
      let autoAbnormal = isAbnormal;

      // Auto-detect abnormal from normal range
      if (
        !isNaN(numericValue) &&
        catalogEntry?.normal_range_min != null &&
        catalogEntry?.normal_range_max != null
      ) {
        autoAbnormal =
          numericValue < catalogEntry.normal_range_min ||
          numericValue > catalogEntry.normal_range_max;
      }

      const updateData: Record<string, unknown> = {
        result_value: isNaN(numericValue) ? null : numericValue,
        result_unit: resultUnit || null,
        is_abnormal: autoAbnormal,
        status: "completed",
        normal_range_text: catalogEntry?.normal_range_text || null,
        result_entered_by: user?.id,
        result_entered_at: new Date().toISOString(),
        updated_by: user?.id,
      };

      const { error } = await (supabase as any)
        .from("patient_tests")
        .update(updateData)
        .eq("id", test.id)
        .eq("organization_id", organizationId);

      if (error) throw error;

      // Send notification
      try {
        const { sendTestResultNotification } = await import(
          "@/services/notificationService"
        );
        await sendTestResultNotification(test.patient_id, test.test_name, test.id);
      } catch {
        // Non-critical
      }

      toast.success(`Result saved for ${test.test_name}`);
      setExpandedTestId(null);
      setResultValue("");
      setResultUnit("");
      setIsAbnormal(false);

      // Remove from list
      setPendingTests((prev) => prev.filter((t) => t.id !== test.id));
    } catch (error: any) {
      console.error("Error saving result:", error);
      toast.error(error.message || "Failed to save result");
    } finally {
      setSubmittingId(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "in_progress":
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  return (
    <Card className="shadow-md border-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              Pending Results
            </CardTitle>
            <CardDescription>
              Enter results quickly &mdash; {pendingTests.length} test(s) awaiting
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary"
            onClick={() => onNavigate?.("tests")}
          >
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : pendingTests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-400" />
            All caught up! No pending results.
          </div>
        ) : (
          <div className="space-y-1">
            {pendingTests.map((test) => {
              const isExpanded = expandedTestId === test.id;
              const catalogEntry = catalogByName.get(test.test_name);

              return (
                <div key={test.id} className="border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleExpand(test)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 text-left transition-colors"
                  >
                    {getStatusIcon(test.status)}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{test.test_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {test.patients?.full_name} &middot;{" "}
                        {formatAppDate(test.test_date)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${
                        test.status === "in_progress"
                          ? "border-blue-300 text-blue-600"
                          : "border-amber-300 text-amber-600"
                      }`}
                    >
                      {test.status === "in_progress" ? "In Progress" : "Pending"}
                    </Badge>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="p-3 pt-0 border-t bg-muted/20 space-y-3">
                      <div className="grid grid-cols-[1fr_80px] gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Result Value
                          </Label>
                          <Input
                            value={resultValue}
                            onChange={(e) => setResultValue(e.target.value)}
                            placeholder={
                              catalogEntry?.normal_range_text
                                ? `Normal: ${catalogEntry.normal_range_text}`
                                : "Enter result..."
                            }
                            className="h-9 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleQuickComplete(test);
                              }
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Unit</Label>
                          <Input
                            value={resultUnit}
                            onChange={(e) => setResultUnit(e.target.value)}
                            placeholder={catalogEntry?.unit || "Unit"}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>

                      {catalogEntry?.normal_range_text && (
                        <p className="text-xs text-muted-foreground">
                          Normal range: {catalogEntry.normal_range_text}
                        </p>
                      )}

                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor={`abnormal_${test.id}`}
                          className="flex items-center gap-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            id={`abnormal_${test.id}`}
                            checked={isAbnormal}
                            onCheckedChange={(v) => setIsAbnormal(!!v)}
                          />
                          Abnormal
                        </Label>
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 h-8"
                          disabled={submittingId === test.id || !resultValue.trim()}
                          onClick={() => void handleQuickComplete(test)}
                        >
                          {submittingId === test.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Send className="h-3.5 w-3.5 mr-1" />
                              Complete
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PendingResultsWidget;
