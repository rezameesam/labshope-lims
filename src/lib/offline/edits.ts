import { buildPatientSearch, type LabDB, type PatientEdit, type PatientPatch } from "./db";
import { classifyError } from "./outbox";
import type { SupabaseLike } from "./types";
import { normalizePhoneNumber } from "@/lib/phone";

export class EditValidationError extends Error {}

const GENDERS = new Set(["male", "female", "other"]);

/** "29/10/2026", "29-10-2026" or "2026-10-29" -> "2026-10-29". */
export function parseDateInput(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dmy = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const [year, month, day] = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2].padStart(2, "0"), dmy[1].padStart(2, "0")] : [];
  if (!year) throw new EditValidationError("Enter the date as DD/MM/YYYY");
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== `${year}-${month}-${day}`) {
    throw new EditValidationError("That date doesn't exist");
  }
  if (date.getTime() > Date.now()) throw new EditValidationError("Date of birth can't be in the future");
  return `${year}-${month}-${day}`;
}

export function validatePatch(field: keyof PatientPatch, text: string): PatientPatch {
  const value = text.trim();
  switch (field) {
    case "full_name":
      if (!value) throw new EditValidationError("Name can't be empty");
      return { full_name: value };
    case "phone": {
      const phone = normalizePhoneNumber(value);
      if (!phone) throw new EditValidationError("Enter a valid phone number");
      return { phone };
    }
    case "gender": {
      if (!value) return { gender: null };
      const gender = value.toLowerCase();
      if (!GENDERS.has(gender)) throw new EditValidationError("Gender must be male, female or other");
      return { gender };
    }
    case "date_of_birth":
      return { date_of_birth: parseDateInput(value) };
    default:
      throw new EditValidationError("That column can't be edited");
  }
}

/**
 * Applies an edit to a patient immediately on this device and queues it for the
 * server. Patients that only exist locally are edited inside their queued visit
 * instead, so the server creates them with the corrected details.
 */
export async function editPatient(db: LabDB, patientId: string, patch: PatientPatch): Promise<void> {
  await db.transaction("rw", [db.patients, db.edits, db.outbox], async () => {
    const patient = await db.patients.get(patientId);
    if (!patient) throw new EditValidationError("That patient no longer exists");

    const previous: PatientPatch = {};
    for (const key of Object.keys(patch) as Array<keyof PatientPatch>) {
      (previous as Record<string, unknown>)[key] = patient[key];
    }

    const next = { ...patient, ...patch };
    await db.patients.put({
      ...next,
      search: buildPatientSearch(next.full_name, next.phone, next.patient_id),
    });

    if (patient.pending) {
      const queued = await db.outbox.filter((item) => "new" in item.payload.patient && item.payload.patient.new.id === patientId && item.status !== "done").toArray();
      for (const item of queued) {
        if (!("new" in item.payload.patient)) continue;
        const details = item.payload.patient.new;
        await db.outbox.update(item.visit_id, {
          payload: {
            ...item.payload,
            patient: {
              new: {
                ...details,
                full_name: next.full_name,
                phone: next.phone,
                gender: next.gender,
                date_of_birth: next.date_of_birth,
                phone_variants: patch.phone ? [next.phone] : details.phone_variants,
              },
            },
          },
          patient_name: next.full_name,
          status: item.status === "failed" ? "pending" : item.status,
        });
      }
      return;
    }

    const existing = await db.edits.get(patientId);
    // Keep the oldest known values so a refusal reverts to what the server has.
    const earlier = (existing?.previous ?? {}) as Record<string, unknown>;
    const mergedPrevious: Record<string, unknown> = { ...earlier };
    for (const key of Object.keys(patch)) {
      if (!(key in earlier)) mergedPrevious[key] = (previous as Record<string, unknown>)[key];
    }

    await db.edits.put({
      id: patientId,
      patch: { ...existing?.patch, ...patch },
      previous: mergedPrevious as PatientPatch,
      status: "pending",
      last_error: null,
      attempts: existing?.attempts ?? 0,
      updated_at: Date.now(),
    });
  });
}

export interface EditFlushOutcome {
  synced: number;
  failed: number;
  stoppedBy: "network" | "auth" | "transient" | null;
}

/** Sends unsent patient edits to the server, one patient at a time. */
export async function flushEdits(db: LabDB, supabase: SupabaseLike): Promise<EditFlushOutcome> {
  const outcome: EditFlushOutcome = { synced: 0, failed: 0, stoppedBy: null };
  const pending = await db.edits.where("status").equals("pending").toArray();

  for (const edit of pending) {
    await db.edits.update(edit.id, { status: "syncing", updated_at: Date.now() });

    let error: unknown = null;
    let status: number | undefined;
    let updatedRows = 0;
    try {
      const response = await supabase.from("patients").update(edit.patch).eq("id", edit.id).select("id");
      error = response.error;
      status = response.status;
      updatedRows = (response.data as unknown[] | null)?.length ?? 0;
    } catch (thrown) {
      error = thrown;
    }

    if (!error && updatedRows === 0) {
      // RLS filters rows silently: nothing updated means we weren't allowed to, or it's gone.
      error = { code: "42501", message: "The server did not accept this change (no permission, or the patient was removed)" };
    }

    if (!error) {
      // Only drop the edit if nothing newer was queued while this one was in flight.
      const current = await db.edits.get(edit.id);
      if (current && JSON.stringify(current.patch) === JSON.stringify(edit.patch)) {
        await db.edits.delete(edit.id);
      } else if (current) {
        await db.edits.update(edit.id, { status: "pending" });
      }
      outcome.synced += 1;
      continue;
    }

    const kind = classifyError(error, status);
    const message = (error as { message?: string }).message ?? "Sync failed";
    if (kind === "permanent") {
      await db.edits.update(edit.id, { status: "failed", last_error: message, attempts: edit.attempts + 1, updated_at: Date.now() });
      outcome.failed += 1;
      continue;
    }
    await db.edits.update(edit.id, { status: "pending", last_error: message, attempts: edit.attempts + 1, updated_at: Date.now() });
    outcome.stoppedBy = kind;
    return outcome;
  }
  return outcome;
}

/** Throws away a refused edit and puts the patient back to what the server has. */
export async function revertEdit(db: LabDB, patientId: string): Promise<void> {
  await db.transaction("rw", [db.patients, db.edits], async () => {
    const edit = await db.edits.get(patientId);
    const patient = await db.patients.get(patientId);
    if (patient && edit) {
      const restored = { ...patient, ...edit.previous };
      await db.patients.put({ ...restored, search: buildPatientSearch(restored.full_name, restored.phone, restored.patient_id) });
    }
    await db.edits.delete(patientId);
  });
}

export async function retryEdit(db: LabDB, patientId: string) {
  await db.edits.update(patientId, { status: "pending", last_error: null, updated_at: Date.now() });
}

export type { PatientEdit };
