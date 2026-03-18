import { format } from "date-fns";
import { formatAppDate } from "@/lib/date";
import { type TestResult, getDetailedResultText, getRangeText, isItemAbnormal } from "./types";

function PanelResults({ test, compact = false }: { test: TestResult; compact?: boolean }) {
  if (!test.result_items || test.result_items.length === 0) return null;

  if (compact) {
    return (
      <div className="space-y-2">
        {test.result_items.map((item, index) => {
          const abnormal = isItemAbnormal(item);
          return (
            <div
              key={`${test.id}-item-${index}`}
              className={`rounded-xl border p-3 ${
                abnormal
                  ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
                  : "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-foreground">{item.name || "-"}</span>
                <span className={`text-sm font-semibold ${abnormal ? "text-red-600" : "text-green-700"}`}>
                  {item.value ?? "-"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Unit</span>
                <span className="text-right">{item.unit || "-"}</span>
                <span>Range</span>
                <span className="text-right">{getRangeText(item)}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-2 grid gap-1">
      <div className="grid grid-cols-4 text-xs font-medium text-muted-foreground px-1">
        <span>Item</span>
        <span>Value</span>
        <span>Unit</span>
        <span>Range</span>
      </div>
      {test.result_items.map((item, index) => {
        const abnormal = isItemAbnormal(item);
        return (
          <div
            key={`${test.id}-item-${index}`}
            className={`grid grid-cols-4 text-sm rounded px-1 py-0.5 ${
              abnormal ? "bg-red-50 dark:bg-red-950/20" : "bg-green-50/50 dark:bg-green-950/10"
            }`}
          >
            <span className="font-medium">{item.name || "-"}</span>
            <span className={abnormal ? "text-red-600 font-semibold" : "text-green-700 font-medium"}>
              {item.value ?? "-"}
            </span>
            <span className="text-muted-foreground">{item.unit || "-"}</span>
            <span className="text-muted-foreground">{getRangeText(item)}</span>
          </div>
        );
      })}
    </div>
  );
}

interface ResultsDetailProps {
  test: TestResult;
  compact?: boolean;
}

export function ResultsDetail({ test, compact = false }: ResultsDetailProps) {
  const resultText = getDetailedResultText(test);
  const statusColor = test.is_abnormal ? "text-red-600" : "text-green-700";

  return (
    <div className={compact ? "grid gap-4 text-sm" : "grid grid-cols-2 gap-4 text-sm md:grid-cols-4"}>
      <div>
        <span className="text-muted-foreground">Test Date:</span>
        <p className="font-medium">
          {formatAppDate(test.test_date)}
          {test.created_at && (
            <span className="ml-2 text-sm text-muted-foreground">
              {format(new Date(test.created_at), "HH:mm")}
            </span>
          )}
        </p>
      </div>
      <div>
        <span className="text-muted-foreground">Result:</span>
        <p className={`font-medium ${statusColor}`}>{resultText}</p>
      </div>
      <div>
        <span className="text-muted-foreground">Status:</span>
        <p className={`font-medium ${statusColor}`}>{test.is_abnormal ? "Abnormal" : "Normal"}</p>
      </div>
      {test.result_items && test.result_items.length > 0 && (
        <div className={compact ? "space-y-2" : "col-span-2 space-y-2 md:col-span-4"}>
          <span className="text-muted-foreground">Panel Results:</span>
          <PanelResults test={test} compact={compact} />
        </div>
      )}
      {test.notes && (
        <div className={compact ? "" : "col-span-2 md:col-span-4"}>
          <span className="text-muted-foreground">Notes:</span>
          <p className="font-medium">{test.notes}</p>
        </div>
      )}
    </div>
  );
}
