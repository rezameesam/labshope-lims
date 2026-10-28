import { useMemo } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useOffline } from "@/contexts/OfflineContext";
import type { LocalPatient } from "@/lib/offline/db";
import { validatePatch } from "@/lib/offline/edits";
import { useLive } from "@/lib/offline/useLive";
import SheetGrid, { type SheetColumn } from "./SheetGrid";

const formatDob = (iso: string | null) => {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso;
};

const PatientsSheet = () => {
  const { db, editPatient } = useOffline();
  const { user, isCollector } = useAuth();

  const patients = useLive(
    db ? () => db.patients.filter((patient) => patient.is_active).toArray() : null,
    [db],
    [] as LocalPatient[],
  );
  const unsent = useLive(
    db ? async () => new Set((await db.edits.toCollection().primaryKeys()) as string[]) : null,
    [db],
    new Set<string>(),
  );

  // Collectors only see the patients they registered themselves.
  const rows = useMemo(
    () => (isCollector && user?.id ? patients.filter((patient) => patient.created_by === user.id) : patients),
    [patients, isCollector, user?.id],
  );

  const columns = useMemo<SheetColumn<LocalPatient>[]>(
    () => [
      {
        id: "patient_id",
        header: "Patient ID",
        width: 130,
        value: (p) => p.patient_id,
        display: (p) => (
          <span className="flex items-center gap-1.5">
            {p.patient_id}
            {p.pending === 1 && (
              <Badge variant="outline" className="h-4 border-amber-500 px-1 text-[10px] text-amber-700 dark:text-amber-400">
                new
              </Badge>
            )}
          </span>
        ),
      },
      { id: "full_name", header: "Name", width: 220, value: (p) => p.full_name, editable: true },
      { id: "phone", header: "Phone", width: 150, value: (p) => p.phone, editable: true },
      { id: "gender", header: "Gender", width: 100, value: (p) => p.gender, editable: true },
      {
        id: "date_of_birth",
        header: "Date of birth",
        width: 130,
        value: (p) => p.date_of_birth,
        display: (p) => formatDob(p.date_of_birth),
        editable: true,
      },
      {
        id: "sync",
        header: "Status",
        width: 130,
        value: (p) => (p.pending === 1 ? "Waiting to upload" : unsent.has(p.id) ? "Edit pending" : "Saved"),
      },
    ],
    [unsent],
  );

  return (
    <SheetGrid<LocalPatient>
      rows={rows}
      columns={columns}
      getRowId={(patient) => patient.id}
      exportName="patients"
      emptyMessage="No patients yet. Register one from the dashboard and it will appear here."
      rowClassName={(patient) => (patient.pending === 1 ? "bg-amber-50/60 dark:bg-amber-950/20" : undefined)}
      onError={(message) => toast.error(message)}
      onEdit={async (patient, columnId, text) => {
        await editPatient(patient.id, validatePatch(columnId as "full_name" | "phone" | "gender" | "date_of_birth", text));
      }}
    />
  );
};

export default PatientsSheet;
