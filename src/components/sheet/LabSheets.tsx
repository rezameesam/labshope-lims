import { useState } from "react";
import { Button } from "@/components/ui/button";
import PatientsSheet from "./PatientsSheet";
import VisitsSheet from "./VisitsSheet";

type SheetKey = "visits" | "patients";

const LabSheets = () => {
  const [sheet, setSheet] = useState<SheetKey>("visits");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Lab Sheets</h2>
          <p className="text-sm text-muted-foreground">
            Fast spreadsheet views of your data. Works offline; changes upload automatically.
          </p>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Sheet">
          <Button size="sm" role="tab" aria-selected={sheet === "visits"} variant={sheet === "visits" ? "default" : "outline"} onClick={() => setSheet("visits")}>
            Visit register
          </Button>
          <Button size="sm" role="tab" aria-selected={sheet === "patients"} variant={sheet === "patients" ? "default" : "outline"} onClick={() => setSheet("patients")}>
            Patients
          </Button>
        </div>
      </div>
      {sheet === "visits" ? <VisitsSheet /> : <PatientsSheet />}
    </div>
  );
};

export default LabSheets;
