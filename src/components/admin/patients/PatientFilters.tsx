import React from "react";
import { Search, FileSpreadsheet, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateInput } from "@/components/ui/date-input";

export interface PatientFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filterStatus: "all" | "active" | "inactive";
  onFilterStatusChange: (value: "all" | "active" | "inactive") => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onExport: () => void;
  abdmScanShareEnabled: boolean;
  onOpenAbdmDialog: () => void;
  onOpenAddPatientDialog: () => void;
  addDisabled?: boolean;
  addDisabledReason?: string;
}

const PatientFilters = ({
  search,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onExport,
  abdmScanShareEnabled,
  onOpenAbdmDialog,
  onOpenAddPatientDialog,
  addDisabled = false,
  addDisabledReason,
}: PatientFiltersProps) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative max-w-sm">
          <Label htmlFor="patient-search" className="sr-only">
            Search patients
          </Label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="patient-search"
            name="patient_search"
            placeholder="Search by name, phone, or ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 w-full sm:w-80"
            autoComplete="off"
          />
        </div>
        <Tabs value={filterStatus} onValueChange={(v) => onFilterStatusChange(v as "all" | "active" | "inactive")} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>
        <DateInput
          id="patients-date-from"
          value={dateFrom}
          onChange={onDateFromChange}
          placeholder="Registered from"
          className="w-[155px]"
          showFormatHint
        />
        <DateInput
          id="patients-date-to"
          value={dateTo}
          onChange={onDateToChange}
          placeholder="Registered to"
          className="w-[155px]"
          showFormatHint
        />
        {(dateFrom || dateTo) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { onDateFromChange(""); onDateToChange(""); }}
            className="text-muted-foreground"
          >
            Clear dates ×
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onExport}
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export
        </Button>
        {abdmScanShareEnabled && (
          <Button
            type="button"
            variant="outline"
            className="border-clinical-navy text-clinical-navy"
            onClick={onOpenAbdmDialog}
          >
            <ClipboardList className="h-4 w-4 mr-2" />
            Scan with ABDM
          </Button>
        )}
        <Button
          variant="clinical"
          onClick={onOpenAddPatientDialog}
          disabled={addDisabled}
          title={addDisabledReason}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Patient
        </Button>
      </div>
      {addDisabledReason ? (
        <p className="text-sm text-amber-700">{addDisabledReason}</p>
      ) : null}
    </div>
  );
};

export default PatientFilters;
