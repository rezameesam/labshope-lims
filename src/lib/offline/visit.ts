import {
  buildPatientSearch,
  type LabDB,
  type LocalPatient,
  type OutboxItem,
  type VisitPayload,
  type VisitResult,
} from "./db";
import { enqueueVisit, flushOutbox, newId } from "./outbox";
import { findPatientByPhone, syncPatients } from "./sync";
import type { SupabaseLike } from "./types";

export interface RegisterVisitInput {
  organizationId: string;
  labId: string | null;
  collectionCenterId?: string | null;
  testDate: string;
  notes?: string | null;
  createdBy?: string | null;
  patient:
    | { existing: LocalPatient }
    | {
        new: {
          full_name: string;
          /** Phone in storage format, e.g. +919876543210. */
          phone: string;
          phoneVariants: string[];
          gender?: string | null;
          date_of_birth?: string | null;
        };
      };
  tests: Array<{ test_name: string; price: number; in_package?: boolean }>;
  package?: { id: string; name: string; price: number } | null;
  referral?: { doctor_id: string; custom_name?: string | null } | null;
}

export type RegisterVisitOutcome =
  | { status: "synced"; item: OutboxItem; result: VisitResult; reusedPatient: boolean }
  | { status: "queued"; item: OutboxItem; reusedPatient: boolean }
  | { status: "failed"; item: OutboxItem; error: string; reusedPatient: boolean };

const provisionalPatientCode = () => {
  const year = new Date().getFullYear().toString().slice(-2);
  return `PAT${year}${Math.floor(1000 + Math.random() * 9000)}`;
};

const wait = (ms: number) => new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));

/**
 * Saves a visit locally first, then syncs it. The caller gets an answer
 * immediately: "synced" if the server confirmed within waitMs, otherwise
 * "queued" (it will sync in the background, even after a restart).
 */
export async function registerVisit(
  db: LabDB,
  supabase: SupabaseLike,
  input: RegisterVisitInput,
  options: { waitMs?: number } = {},
): Promise<RegisterVisitOutcome> {
  let reusedPatient = false;
  let patient: VisitPayload["patient"];
  let patientName: string;

  if ("existing" in input.patient) {
    const existing = input.patient.existing;
    patientName = existing.full_name;
    // A patient that only exists locally has to travel with the visit so the
    // server can create it; the client id keeps that idempotent.
    patient = existing.pending
      ? {
          new: {
            id: existing.id,
            patient_code: existing.patient_id,
            full_name: existing.full_name,
            phone: existing.phone,
            gender: existing.gender,
            date_of_birth: existing.date_of_birth,
            phone_variants: [existing.phone],
          },
        }
      : { id: existing.id };
  } else {
    const fresh = input.patient.new;
    patientName = fresh.full_name.trim();
    const match = await findPatientByPhone(db, fresh.phoneVariants);
    if (match) {
      reusedPatient = true;
      patientName = match.full_name;
      patient = match.pending
        ? {
            new: {
              id: match.id,
              patient_code: match.patient_id,
              full_name: match.full_name,
              phone: match.phone,
              gender: match.gender,
              date_of_birth: match.date_of_birth,
              phone_variants: [match.phone],
            },
          }
        : { id: match.id };
    } else {
      const id = newId();
      const code = provisionalPatientCode();
      const now = new Date().toISOString();
      await db.patients.put({
        id,
        patient_id: code,
        full_name: fresh.full_name.trim(),
        phone: fresh.phone,
        gender: fresh.gender ?? null,
        date_of_birth: fresh.date_of_birth ?? null,
        lab_id: input.labId,
        collection_center_id: input.collectionCenterId ?? null,
        is_active: true,
        created_by: input.createdBy ?? null,
        updated_at: now,
        search: buildPatientSearch(fresh.full_name.trim(), fresh.phone, code),
        pending: 1,
      });
      patient = {
        new: {
          id,
          patient_code: code,
          full_name: fresh.full_name.trim(),
          phone: fresh.phone,
          gender: fresh.gender ?? null,
          date_of_birth: fresh.date_of_birth ?? null,
          phone_variants: fresh.phoneVariants,
        },
      };
    }
  }

  const payload: VisitPayload = {
    visit_id: newId(),
    organization_id: input.organizationId,
    lab_id: input.labId,
    collection_center_id: input.collectionCenterId ?? null,
    test_date: input.testDate,
    notes: input.notes ?? null,
    collected_at: new Date().toISOString(),
    patient,
    tests: input.tests,
    package: input.package ?? null,
    referral: input.referral ?? null,
  };

  const queued = await enqueueVisit(db, payload, patientName);

  await Promise.race([flushOutbox(db, supabase), wait(options.waitMs ?? 2500)]);

  const item = (await db.outbox.get(queued.visit_id)) ?? queued;
  if (item.status === "done" && item.result) {
    // Pick up the server's version of the patient (code, matched record).
    void syncPatients(db, supabase, input.organizationId).catch(() => undefined);
    return { status: "synced", item, result: item.result, reusedPatient };
  }
  if (item.status === "failed") {
    return { status: "failed", item, error: item.last_error ?? "The server rejected this visit", reusedPatient };
  }
  return { status: "queued", item, reusedPatient };
}
