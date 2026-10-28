import {
  buildPatientSearch,
  getMeta,
  setMeta,
  type CatalogTest,
  type CenterRef,
  type Doctor,
  type LabDB,
  type LabRef,
  type LocalPatient,
  type TestCategory,
  type TestPackage,
} from "./db";
import type { SupabaseLike } from "./types";

const PATIENT_PAGE_SIZE = 1000;
const CATALOG_KEY = "catalog_synced_at";
const PATIENT_CURSOR_KEY = "patients_cursor";

/** Catalog data changes rarely; refresh at most this often unless forced. */
export const CATALOG_MAX_AGE_MS = 10 * 60 * 1000;

const orEmpty = <T>(res: { data: T[] | null; error: unknown }): T[] => {
  if (res.error) throw res.error;
  return res.data ?? [];
};

export async function refreshCatalog(
  db: LabDB,
  supabase: SupabaseLike,
  organizationId: string,
  options: { force?: boolean; now?: number } = {},
): Promise<boolean> {
  const now = options.now ?? Date.now();
  const last = await getMeta<number>(db, CATALOG_KEY);
  if (!options.force && last && now - last < CATALOG_MAX_AGE_MS) return false;

  const scoped = (table: string, columns: string) =>
    supabase.from(table).select(columns).eq("organization_id", organizationId);

  const [tests, categories, packages, packageTests, doctors, labs, centers] = await Promise.all([
    scoped("tests", "id, test_id, name, price, category_id").eq("is_active", true),
    scoped("test_categories", "id, name"),
    scoped("test_packages", "id, name, price, discount_percentage, is_active").eq("is_active", true),
    supabase.from("test_package_tests").select("package_id, test_id"),
    scoped("doctors", "id, name, specialization, commission_percentage").eq("is_active", true),
    scoped("labs", "id, name, lab_code").eq("is_active", true).order("name"),
    scoped("collection_centers", "id, name, code, lab_id").eq("is_active", true).order("name"),
  ]);

  // Throw before touching local data so a failed refresh never wipes a good cache.
  const testRows = orEmpty<CatalogTest>(tests);
  const categoryRows = orEmpty<TestCategory>(categories);
  const packageRows = orEmpty<TestPackage & { discount_percentage?: number | null }>(packages);
  const packageTestRows = orEmpty<{ package_id: string; test_id: string }>(packageTests);
  const doctorRows = orEmpty<Doctor>(doctors);
  const labRows = orEmpty<LabRef>(labs);
  const centerRows = orEmpty<CenterRef>(centers);

  const testsByPackage = new Map<string, string[]>();
  for (const row of packageTestRows) {
    testsByPackage.set(row.package_id, [...(testsByPackage.get(row.package_id) ?? []), row.test_id]);
  }

  await db.transaction(
    "rw",
    [db.tests, db.categories, db.packages, db.doctors, db.labs, db.centers, db.meta],
    async () => {
      await Promise.all([
        db.tests.clear(),
        db.categories.clear(),
        db.packages.clear(),
        db.doctors.clear(),
        db.labs.clear(),
        db.centers.clear(),
      ]);
      await Promise.all([
        db.tests.bulkPut(testRows),
        db.categories.bulkPut(categoryRows),
        db.packages.bulkPut(
          packageRows.map((pkg) => ({
            id: pkg.id,
            name: pkg.name,
            price: pkg.price ?? null,
            tests: testsByPackage.get(pkg.id) ?? [],
          })),
        ),
        db.doctors.bulkPut(doctorRows),
        db.labs.bulkPut(labRows),
        db.centers.bulkPut(centerRows),
      ]);
      await setMeta(db, CATALOG_KEY, now);
    },
  );
  return true;
}

interface PatientRow {
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
}

export const toLocalPatient = (row: PatientRow, pending: 0 | 1 = 0): LocalPatient => ({
  id: row.id,
  patient_id: row.patient_id,
  full_name: row.full_name,
  phone: row.phone,
  gender: row.gender ?? null,
  date_of_birth: row.date_of_birth ?? null,
  lab_id: row.lab_id ?? null,
  collection_center_id: row.collection_center_id ?? null,
  is_active: row.is_active !== false,
  created_by: row.created_by ?? null,
  updated_at: row.updated_at,
  search: buildPatientSearch(row.full_name, row.phone, row.patient_id),
  pending,
});

interface KeysetCursor {
  updated_at: string;
  id: string;
}

const INVOICE_CURSOR_KEY = "invoices_cursor";
const INVOICE_PAGE_SIZE = 1000;
/** First sync only fetches this much invoice history; older data stays on the server. */
export const INVOICE_HISTORY_DAYS = 90;

/**
 * Pages through rows changed since the saved cursor. Uses a keyset cursor on
 * (updated_at, id) so rows sharing a timestamp are never skipped at a page
 * boundary. Returns the number of rows applied.
 */
async function pullKeyset<Row extends { id: string; updated_at: string }>(
  db: LabDB,
  cursorKey: string,
  pageSize: number,
  maxPages: number | undefined,
  fetchPage: (cursor: KeysetCursor | undefined) => PromiseLike<{ data: unknown; error: unknown }>,
  apply: (rows: Row[]) => Promise<void>,
): Promise<number> {
  let cursor = await getMeta<KeysetCursor>(db, cursorKey);
  let applied = 0;

  for (let page = 0; page < (maxPages ?? Infinity); page += 1) {
    const { data, error } = await fetchPage(cursor);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;

    await apply(rows);
    const last = rows[rows.length - 1];
    cursor = { updated_at: last.updated_at, id: last.id };
    await setMeta(db, cursorKey, cursor);
    applied += rows.length;

    if (rows.length < pageSize) break;
  }
  return applied;
}

const afterCursor = (cursor: KeysetCursor) =>
  `updated_at.gt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.gt.${cursor.id})`;

/** Incrementally pulls patients changed since the last run. */
export async function syncPatients(
  db: LabDB,
  supabase: SupabaseLike,
  organizationId: string,
  options: { maxPages?: number } = {},
): Promise<number> {
  return pullKeyset<PatientRow>(
    db,
    PATIENT_CURSOR_KEY,
    PATIENT_PAGE_SIZE,
    options.maxPages,
    (cursor) => {
      let query = supabase
        .from("patients")
        .select(
          "id, patient_id, full_name, phone, gender, date_of_birth, lab_id, collection_center_id, is_active, created_by, updated_at",
        )
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(PATIENT_PAGE_SIZE);
      if (cursor) query = query.or(afterCursor(cursor));
      return query;
    },
    async (rows) => {
      // Never overwrite a local change that has not reached the server yet.
      const unsent = new Set((await db.edits.toCollection().primaryKeys()) as string[]);
      await db.patients.bulkPut(rows.filter((row) => !unsent.has(row.id)).map((row) => toLocalPatient(row)));
    },
  );
}

interface InvoiceRow {
  id: string;
  invoice_number: string;
  patient_id: string;
  total_amount: number | null;
  final_amount: number | null;
  paid_amount: number | null;
  payment_status: string | null;
  payment_method: string | null;
  lab_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Pulls recent invoices (last 90 days on first run, then only changes). */
export async function syncInvoices(
  db: LabDB,
  supabase: SupabaseLike,
  organizationId: string,
  options: { maxPages?: number; now?: number } = {},
): Promise<number> {
  const floor = new Date((options.now ?? Date.now()) - INVOICE_HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return pullKeyset<InvoiceRow>(
    db,
    INVOICE_CURSOR_KEY,
    INVOICE_PAGE_SIZE,
    options.maxPages,
    (cursor) => {
      let query = supabase
        .from("invoices")
        .select(
          "id, invoice_number, patient_id, total_amount, final_amount, paid_amount, payment_status, payment_method, lab_id, created_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .order("updated_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(INVOICE_PAGE_SIZE);
      query = cursor ? query.or(afterCursor(cursor)) : query.gte("created_at", floor);
      return query;
    },
    async (rows) => {
      await db.invoices.bulkPut(
        rows.map((row) => ({
          id: row.id,
          invoice_number: row.invoice_number,
          patient_id: row.patient_id,
          total_amount: Number(row.total_amount ?? 0),
          final_amount: Number(row.final_amount ?? row.total_amount ?? 0),
          paid_amount: Number(row.paid_amount ?? 0),
          payment_status: row.payment_status,
          payment_method: row.payment_method,
          lab_id: row.lab_id,
          // Normalized so local date-range queries compare reliably; updated_at stays exact for the cursor.
          created_at: new Date(row.created_at).toISOString(),
          updated_at: row.updated_at,
        })),
      );
    },
  );
}

/** Fast local patient search by name, phone or patient code. */
export async function searchPatients(db: LabDB, term: string, limit = 20): Promise<LocalPatient[]> {
  const needle = term.trim().toLowerCase();
  if (needle.length < 2) return [];
  const digits = needle.replace(/\D/g, "");
  const results: LocalPatient[] = [];

  await db.patients
    .filter((patient) => {
      if (!patient.is_active) return false;
      if (digits.length >= 3 && digits.length === needle.replace(/[\s+-]/g, "").length) {
        return patient.phone.replace(/\D/g, "").includes(digits);
      }
      return patient.search.includes(needle);
    })
    .until(() => results.length >= limit)
    .each((patient) => {
      results.push(patient);
    });

  return results;
}

export async function findPatientByPhone(db: LabDB, variants: string[]): Promise<LocalPatient | undefined> {
  if (variants.length === 0) return undefined;
  const matches = await db.patients.where("phone").anyOf(variants).toArray();
  return matches
    .filter((patient) => patient.is_active)
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))[0];
}
