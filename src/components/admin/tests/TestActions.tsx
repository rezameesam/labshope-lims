import { Plus, Printer, FileSpreadsheet } from "lucide-react";
import { exportToExcel } from "@/lib/exportToExcel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PatientTest } from "./types";

interface TestActionsProps {
  selectedTestIds: string[];
  filteredTests: PatientTest[];
  isDialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onPrintClick: () => void;
  dialogContent: React.ReactNode;
}

export const TestActions = ({
  selectedTestIds,
  filteredTests,
  isDialogOpen,
  onDialogOpenChange,
  onPrintClick,
  dialogContent,
}: TestActionsProps) => {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          exportToExcel(
            "tests",
            [
              { key: "patient_name", label: "Patient" },
              { key: "patient_id_code", label: "Patient ID" },
              { key: "test_name", label: "Test" },
              { key: "test_date", label: "Test Date" },
              { key: "status", label: "Status" },
              { key: "result", label: "Result" },
              { key: "result_value", label: "Value" },
              { key: "result_unit", label: "Unit" },
              { key: "is_abnormal", label: "Abnormal" },
              { key: "lab_name", label: "Lab" },
            ],
            filteredTests.map((t) => ({
              ...t,
              patient_name: t.patients?.full_name ?? "",
              patient_id_code: t.patients?.patient_id ?? "",
              lab_name: t.labs?.name ?? "",
              test_date: t.test_date
                ? new Date(t.test_date).toLocaleDateString("en-IN")
                : "",
              is_abnormal: t.is_abnormal ? "Yes" : "No",
            }))
          )
        }
      >
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        Export
      </Button>
      {selectedTestIds.length > 0 && (
        <Button
          variant="outline"
          onClick={onPrintClick}
          className="gap-2"
        >
          <Printer className="h-4 w-4" />
          Print ({selectedTestIds.length})
        </Button>
      )}

      <Dialog open={isDialogOpen} onOpenChange={onDialogOpenChange}>
        <DialogTrigger asChild>
          <Button className="bg-clinical-navy hover:bg-clinical-navy/90">
            <Plus className="h-4 w-4 mr-2" />
            Add Test
          </Button>
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    </div>
  );
};
