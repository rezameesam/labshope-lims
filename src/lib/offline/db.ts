import Dexie, { type Table } from "dexie";

export interface CatalogTest {
  id: string;
  test_id: string | null;
  name: string;
  price: number | null;
  category_id: string | null;
}

export interface TestCategory {
  id: string;
  name: string;
}

export interface TestPackage {
  id: string;
  name: string;
  price: number | null;
  tests: string[];
}

export interface Doctor {
  id: string;
  name: string;
  specialization: string | null;
  commission_percentage: number | null;
}

export interface LabRef {
  id: string;
  name: string;
  lab_code: string;
}

export interface CenterRef {
  id: string;
  name: string;
  code: string;
  lab_id: string;
}

export interface LocalPatient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  gender: string | null;
  date_of_birth: string | null;
  lab_id: string | null;
  collection_center_id: string | null;
  is_active: boolean;
  created_by?: string | null;
  updated_at: string;
  /** Lower-cased "name phone code" used for fast local search. */
  search: string;
  /** 1 while the patient only exists locally (registered offline, not yet synced). */
  pending: 0 | 1;
}

export interface VisitPayload {
  visit_id: string;
  organization_id: string;
  lab_id: string | null;
  collection_center_id: string | null;
  test_date: string;
  notes: string | null;
  collected_at: string;
  patient:
    | { id: string }
    | {
        new: {
          id: string;
          patient_code?: string;
          full_name: string;
          phone: string;
          gender?: string | null;
          date_of_birth?: string | null;
          phone_variants?: string[];
        };
      };
  tests: Array<{ test_name: string; price: number; in_package?: boolean }>;
  package?: { id: string; name: string; price: number } | null;
  referral?: { doctor_id: string; custom_name?: string | null } | null;
}

export interface VisitResult {
  visit_id: string;
  invoice_id: string;
  invoice_number: string;
  patient_uuid: string;
  patient_code?: string;
  total_amount: number;
  patient_created: boolean;
  patient_matched: boolean;
  replayed: boolean;
}

export type OutboxStatus = "pending" | "syncing" | "failed" | "done";

export interface OutboxItem {
  visit_id: string;
  payload: VisitPayload;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: number;
  updated_at: number;
  /** Shown in the UI while the visit is waiting to sync. */
  patient_name: string;
  total_amount: number;
  result: VisitResult | null;
}

export interface LocalInvoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  total_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string | null;
  payment_method: string | null;
  lab_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientPatch = Partial<
  Pick<LocalPatient, "full_name" | "phone" | "gender" | "date_of_birth">
>;

/** An edit to an already-synced patient, waiting to be sent. One row per patient (last write wins). */
export interface PatientEdit {
  id: string;
  patch: PatientPatch;
  /** The values before the first unsent edit, used to revert if the server refuses. */
  previous: PatientPatch;
  status: "pending" | "syncing" | "failed";
  last_error: string | null;
  attempts: number;
  updated_at: number;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** One database per organization so tenants never share data on a shared PC. */
export class LabDB extends Dexie {
  tests!: Table<CatalogTest, string>;
  categories!: Table<TestCategory, string>;
  packages!: Table<TestPackage, string>;
  doctors!: Table<Doctor, string>;
  labs!: Table<LabRef, string>;
  centers!: Table<CenterRef, string>;
  patients!: Table<LocalPatient, string>;
  invoices!: Table<LocalInvoice, string>;
  edits!: Table<PatientEdit, string>;
  outbox!: Table<OutboxItem, string>;
  meta!: Table<MetaRow, string>;

  constructor(organizationId: string) {
    super(`labshope-lims-${organizationId}`);
    this.version(1).stores({
      tests: "id, name",
      categories: "id",
      packages: "id",
      doctors: "id",
      labs: "id",
      centers: "id, lab_id",
      patients: "id, patient_id, phone, updated_at, pending",
      outbox: "visit_id, status, created_at",
      meta: "key",
    });
    this.version(2).stores({
      invoices: "id, created_at, patient_id",
      edits: "id, status",
    });
  }
}

const open = new Map<string, LabDB>();

export const getLabDb = (organizationId: string) => {
  let db = open.get(organizationId);
  if (!db) {
    db = new LabDB(organizationId);
    open.set(organizationId, db);
  }
  return db;
};

export const getMeta = async <T>(db: LabDB, key: string): Promise<T | undefined> =>
  (await db.meta.get(key))?.value as T | undefined;

export const setMeta = (db: LabDB, key: string, value: unknown) => db.meta.put({ key, value });

export const buildPatientSearch = (name: string, phone: string, code: string) =>
  `${name} ${phone} ${code}`.toLowerCase();
