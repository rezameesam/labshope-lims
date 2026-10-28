import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLabDb, type LabDB, type LocalPatient, type VisitPayload, type VisitResult } from "../db";
import { classifyError, discardFailed, enqueueVisit, flushOutbox, retryFailed } from "../outbox";
import { findPatientByPhone, refreshCatalog, searchPatients, syncPatients, toLocalPatient } from "../sync";
import { registerVisit } from "../visit";
import type { SupabaseLike } from "../types";

let orgCounter = 0;
const freshDb = (): LabDB => getLabDb(`test-org-${++orgCounter}`);

/** Chainable, awaitable stand-in for a PostgREST query. */
function query(resolve: (calls: Array<[string, unknown[]]>) => { data: unknown; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
            Promise.resolve(resolve(calls)).then(ok, bad);
        }
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

interface ServerPatient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  gender: string | null;
  date_of_birth: string | null;
  lab_id: string | null;
  collection_center_id: string | null;
  is_active: boolean;
  updated_at: string;
}

function fakeServer() {
  const state = {
    visits: new Map<string, VisitResult>(),
    patients: [] as ServerPatient[],
    rpcCalls: 0,
    rpcBehavior: null as null | (() => { data?: unknown; error?: unknown; status?: number } | Promise<never>),
    tables: {} as Record<string, { data: unknown[]; error?: unknown }>,
    invoiceSeq: 0,
  };

  const supabase: SupabaseLike = {
    rpc: vi.fn(async (_fn: string, args?: Record<string, unknown>) => {
      state.rpcCalls += 1;
      if (state.rpcBehavior) {
        const forced = await state.rpcBehavior();
        if (forced) return { data: (forced as any).data ?? null, error: (forced as any).error ?? null, status: (forced as any).status } as any;
      }
      const payload = args?.p_payload as VisitPayload;
      const existing = state.visits.get(payload.visit_id);
      if (existing) return { data: { ...existing, replayed: true }, error: null };

      let patientUuid: string;
      let patientCode: string | undefined;
      let created = false;
      let matched = false;
      if ("id" in payload.patient) {
        patientUuid = payload.patient.id;
        if (!state.patients.some((p) => p.id === patientUuid)) {
          return { data: null, error: { code: "P0002", message: "Patient not found" } };
        }
      } else {
        const fresh = payload.patient.new;
        const variants = fresh.phone_variants ?? [fresh.phone];
        const match = state.patients.find((p) => variants.includes(p.phone));
        if (match) {
          patientUuid = match.id;
          patientCode = match.patient_id;
          matched = true;
        } else if (state.patients.some((p) => p.id === fresh.id)) {
          patientUuid = fresh.id;
        } else {
          patientUuid = fresh.id;
          patientCode = `SRV${state.patients.length + 1}`;
          created = true;
          state.patients.push({
            id: fresh.id,
            patient_id: patientCode,
            full_name: fresh.full_name,
            phone: fresh.phone,
            gender: fresh.gender ?? null,
            date_of_birth: fresh.date_of_birth ?? null,
            lab_id: payload.lab_id,
            collection_center_id: payload.collection_center_id,
            is_active: true,
            updated_at: new Date().toISOString(),
          });
        }
      }
      const result: VisitResult = {
        visit_id: payload.visit_id,
        invoice_id: payload.visit_id,
        invoice_number: `INV${String(++state.invoiceSeq).padStart(5, "0")}`,
        patient_uuid: patientUuid,
        patient_code: patientCode,
        total_amount: payload.tests.reduce((sum, t) => sum + t.price, 0),
        patient_created: created,
        patient_matched: matched,
        replayed: false,
      };
      state.visits.set(payload.visit_id, result);
      return { data: result, error: null };
    }),

    from: vi.fn((table: string) => {
      if (table === "patients") {
        return query((calls) => {
          const orCall = calls.find(([name]) => name === "or");
          let rows = [...state.patients].sort((a, b) => a.updated_at.localeCompare(b.updated_at) || a.id.localeCompare(b.id));
          if (orCall) {
            const [, , ts, , id] = String(orCall[1][0]).match(/updated_at\.gt\.(.+?),and\(updated_at\.eq\.(.+?),id\.gt\.(.+?)\)$/) ?? [];
            const m = String(orCall[1][0]).match(/updated_at\.gt\.(.+?),and\(updated_at\.eq\.(.+?),id\.gt\.(.+?)\)$/)!;
            void ts; void id;
            rows = rows.filter((p) => p.updated_at > m[1] || (p.updated_at === m[2] && p.id > m[3]));
          }
          const limit = (calls.find(([name]) => name === "limit")?.[1][0] as number) ?? rows.length;
          return { data: rows.slice(0, limit), error: null };
        });
      }
      const fixture = state.tables[table];
      return query(() => ({ data: fixture?.data ?? [], error: fixture?.error ?? null }));
    }),
  };

  return { state, supabase };
}

const payloadFor = (overrides: Partial<VisitPayload> = {}): VisitPayload => ({
  visit_id: crypto.randomUUID(),
  organization_id: "org",
  lab_id: "lab",
  collection_center_id: null,
  test_date: "2026-10-29",
  notes: null,
  collected_at: new Date().toISOString(),
  patient: { id: "p1" },
  tests: [{ test_name: "CBC", price: 300 }],
  ...overrides,
});

const serverPatient = (n: number, updated_at = "2026-01-01T00:00:00.000Z"): ServerPatient => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  patient_id: `PAT${n}`,
  full_name: `Patient ${n}`,
  phone: `+9198${String(n).padStart(8, "0")}`,
  gender: null,
  date_of_birth: null,
  lab_id: null,
  collection_center_id: null,
  is_active: true,
  updated_at,
});

describe("classifyError", () => {
  it.each([
    [{ message: "TypeError: Failed to fetch" }, undefined, "network"],
    [{ message: "NetworkError when attempting to fetch resource." }, 0, "network"],
    [{ code: "PGRST301", message: "JWT expired" }, 401, "auth"],
    [{ message: "JWT expired" }, undefined, "auth"],
    [{ code: "28000", message: "Not authenticated" }, undefined, "auth"],
    [{ code: "40001", message: "could not serialize" }, undefined, "transient"],
    [{ code: "57014", message: "canceling statement due to statement timeout" }, undefined, "transient"],
    [{ code: "XX000", message: "boom" }, 503, "transient"],
    [{ code: "22023", message: "At least one test is required" }, 400, "permanent"],
    [{ code: "42501", message: "new row violates row-level security policy" }, 403, "permanent"],
    [{ code: "P0002", message: "Patient not found" }, undefined, "permanent"],
  ])("%j (status %s) is %s", (error, status, kind) => {
    expect(classifyError(error, status as number | undefined)).toBe(kind);
  });
});

describe("refreshCatalog", () => {
  it("stores the catalog, links package tests and honours the max age", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.tables.tests = { data: [{ id: "t1", test_id: "T1", name: "CBC", price: 300, category_id: "c1" }] };
    state.tables.test_categories = { data: [{ id: "c1", name: "Blood" }] };
    state.tables.test_packages = { data: [{ id: "pk1", name: "Basic", price: 500 }] };
    state.tables.test_package_tests = { data: [{ package_id: "pk1", test_id: "t1" }] };
    state.tables.doctors = { data: [{ id: "d1", name: "Dr A", specialization: null, commission_percentage: 10 }] };
    state.tables.labs = { data: [{ id: "l1", name: "Main", lab_code: "M" }] };
    state.tables.collection_centers = { data: [{ id: "cc1", name: "Centre", code: "C", lab_id: "l1" }] };

    expect(await refreshCatalog(db, supabase, "org", { now: 1000 })).toBe(true);
    expect(await db.tests.count()).toBe(1);
    expect((await db.packages.get("pk1"))?.tests).toEqual(["t1"]);
    expect((await db.doctors.get("d1"))?.commission_percentage).toBe(10);

    expect(await refreshCatalog(db, supabase, "org", { now: 2000 })).toBe(false);
    expect(await refreshCatalog(db, supabase, "org", { now: 2000, force: true })).toBe(true);
  });

  it("keeps the existing cache when a refresh fails", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.tables.tests = { data: [{ id: "t1", test_id: null, name: "CBC", price: 1, category_id: null }] };
    await refreshCatalog(db, supabase, "org", { force: true });

    state.tables.doctors = { data: [], error: { message: "Failed to fetch" } };
    await expect(refreshCatalog(db, supabase, "org", { force: true })).rejects.toBeTruthy();
    expect(await db.tests.count()).toBe(1);
  });
});

describe("syncPatients", () => {
  it("pages through rows that share a timestamp without skipping or duplicating", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.patients = Array.from({ length: 2500 }, (_, i) => serverPatient(i + 1));

    expect(await syncPatients(db, supabase, "org")).toBe(2500);
    expect(await db.patients.count()).toBe(2500);

    // Nothing new: the cursor makes the next pull empty.
    expect(await syncPatients(db, supabase, "org")).toBe(0);

    state.patients.push(serverPatient(9999, "2026-02-01T00:00:00.000Z"));
    expect(await syncPatients(db, supabase, "org")).toBe(1);
    expect(await db.patients.count()).toBe(2501);
  });
});

describe("local patient search", () => {
  let db: LabDB;
  beforeEach(async () => {
    db = freshDb();
    const rows: ServerPatient[] = [
      { ...serverPatient(1), full_name: "Asha Rao", phone: "+919876543210" },
      { ...serverPatient(2), full_name: "Ravi Kumar", phone: "+919000000002" },
      { ...serverPatient(3), full_name: "Ashok Rao", phone: "+919000000003", is_active: false },
    ];
    await db.patients.bulkPut(rows.map((row) => toLocalPatient(row)));
  });

  it("finds by name, phone digits and code, skipping inactive patients", async () => {
    expect((await searchPatients(db, "asha")).map((p) => p.full_name)).toEqual(["Asha Rao"]);
    expect((await searchPatients(db, "rao")).map((p) => p.full_name)).toEqual(["Asha Rao"]);
    expect((await searchPatients(db, "98765")).map((p) => p.full_name)).toEqual(["Asha Rao"]);
    expect((await searchPatients(db, "PAT2")).map((p) => p.full_name)).toEqual(["Ravi Kumar"]);
    expect(await searchPatients(db, "a")).toEqual([]);
  });

  it("respects the limit and looks up by phone variants", async () => {
    expect(await searchPatients(db, "pat", 1)).toHaveLength(1);
    expect((await findPatientByPhone(db, ["9876543210", "+919876543210"]))?.full_name).toBe("Asha Rao");
    expect(await findPatientByPhone(db, [])).toBeUndefined();
  });
});

describe("flushOutbox", () => {
  it("syncs queued visits oldest first and marks them done", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.patients.push(serverPatient(1, undefined as unknown as string));
    const a = await enqueueVisit(db, payloadFor({ patient: { id: state.patients[0].id } }), "A");
    await new Promise((r) => setTimeout(r, 2));
    const b = await enqueueVisit(db, payloadFor({ patient: { id: state.patients[0].id } }), "B");

    const outcome = await flushOutbox(db, supabase);
    expect(outcome).toEqual({ synced: 2, failed: 0, stoppedBy: null });
    expect((await db.outbox.get(a.visit_id))?.result?.invoice_number).toBe("INV00001");
    expect((await db.outbox.get(b.visit_id))?.result?.invoice_number).toBe("INV00002");
  });

  it("keeps visits queued when the network is down, then syncs once it is back", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.patients.push(serverPatient(1));
    const item = await enqueueVisit(db, payloadFor({ patient: { id: state.patients[0].id } }), "A");

    state.rpcBehavior = () => Promise.reject(new TypeError("Failed to fetch"));
    expect((await flushOutbox(db, supabase)).stoppedBy).toBe("network");
    const queued = await db.outbox.get(item.visit_id);
    expect(queued?.status).toBe("pending");
    expect(queued?.attempts).toBe(1);

    state.rpcBehavior = null;
    expect((await flushOutbox(db, supabase)).synced).toBe(1);
    expect((await db.outbox.get(item.visit_id))?.status).toBe("done");
  });

  it("moves permanently rejected visits to failed and keeps going", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.patients.push(serverPatient(1));
    const bad = await enqueueVisit(db, payloadFor({ patient: { id: "11111111-1111-1111-1111-111111111111" } }), "Bad");
    await new Promise((r) => setTimeout(r, 2));
    const good = await enqueueVisit(db, payloadFor({ patient: { id: state.patients[0].id } }), "Good");

    const outcome = await flushOutbox(db, supabase);
    expect(outcome).toEqual({ synced: 1, failed: 1, stoppedBy: null });
    const failed = await db.outbox.get(bad.visit_id);
    expect(failed?.status).toBe("failed");
    expect(failed?.last_error).toMatch(/not found/i);
    expect((await db.outbox.get(good.visit_id))?.status).toBe("done");

    await retryFailed(db, bad.visit_id);
    expect((await db.outbox.get(bad.visit_id))?.status).toBe("pending");
  });

  it("shares one run between overlapping calls", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.patients.push(serverPatient(1));
    await enqueueVisit(db, payloadFor({ patient: { id: state.patients[0].id } }), "A");

    const [first, second] = await Promise.all([flushOutbox(db, supabase), flushOutbox(db, supabase)]);
    expect(first).toBe(second);
    expect(state.rpcCalls).toBe(1);
  });

  it("never creates a duplicate when a visit is replayed", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.patients.push(serverPatient(1));
    const item = await enqueueVisit(db, payloadFor({ patient: { id: state.patients[0].id } }), "A");
    await flushOutbox(db, supabase);

    // Pretend the app crashed after the server saved but before we recorded it.
    await db.outbox.update(item.visit_id, { status: "pending", result: null });
    await flushOutbox(db, supabase);
    expect(state.visits.size).toBe(1);
    expect((await db.outbox.get(item.visit_id))?.result?.replayed).toBe(true);
  });

  it("recovers visits stuck in syncing after a crash", async () => {
    const db = freshDb();
    const { state, supabase } = fakeServer();
    state.patients.push(serverPatient(1));
    const item = await enqueueVisit(db, payloadFor({ patient: { id: state.patients[0].id } }), "A");
    await db.outbox.update(item.visit_id, { status: "syncing", updated_at: Date.now() - 10 * 60 * 1000 });

    expect((await flushOutbox(db, supabase)).synced).toBe(1);
  });

  it("discarding a failed visit also removes its never-synced patient", async () => {
    const db = freshDb();
    const { supabase, state } = fakeServer();
    state.rpcBehavior = () => ({ error: { code: "22023", message: "bad" } });
    const outcome = await registerVisit(db, supabase, {
      organizationId: "org",
      labId: "lab",
      testDate: "2026-10-29",
      patient: { new: { full_name: "Ghost", phone: "+919111111111", phoneVariants: ["+919111111111"] } },
      tests: [{ test_name: "CBC", price: 1 }],
    });
    expect(outcome.status).toBe("failed");
    expect(await db.patients.count()).toBe(1);
    await discardFailed(db, outcome.item.visit_id);
    expect(await db.outbox.count()).toBe(0);
    expect(await db.patients.count()).toBe(0);
  });
});

describe("registerVisit", () => {
  const base = {
    organizationId: "org",
    labId: "lab",
    testDate: "2026-10-29",
    tests: [{ test_name: "CBC", price: 300 }, { test_name: "LFT", price: 450 }],
  };
  const newPatient = (phone = "+919876543210") => ({
    new: {
      full_name: "Asha Rao",
      phone,
      // Same two spellings getPhoneLookupVariants() produces: with and without +91.
      phoneVariants: [phone, phone.startsWith("+91") ? phone.slice(3) : `+91${phone}`],
    },
  });

  it("registers a new patient online and returns the real invoice number", async () => {
    const db = freshDb();
    const { supabase, state } = fakeServer();
    const outcome = await registerVisit(db, supabase, { ...base, patient: newPatient() });

    expect(outcome.status).toBe("synced");
    if (outcome.status !== "synced") return;
    expect(outcome.result.invoice_number).toBe("INV00001");
    expect(outcome.result.total_amount).toBe(750);
    expect(state.rpcCalls).toBe(1); // one round trip for the whole visit
    // The provisional code is replaced by the server's.
    expect((await db.patients.toArray())[0]).toMatchObject({ patient_id: "SRV1", pending: 0 });
  });

  it("queues instantly while offline, keeps the patient searchable and syncs later", async () => {
    const db = freshDb();
    const { supabase, state } = fakeServer();
    state.rpcBehavior = () => Promise.reject(new TypeError("Failed to fetch"));

    const outcome = await registerVisit(db, supabase, { ...base, patient: newPatient() });
    expect(outcome.status).toBe("queued");
    expect(outcome.item.total_amount).toBe(750);
    expect((await searchPatients(db, "asha"))[0]).toMatchObject({ pending: 1 });

    // A second visit for the same (still local) patient reuses the record
    // and carries the patient details so the server can still create it.
    const second = await registerVisit(db, supabase, { ...base, patient: newPatient("9876543210") });
    expect(second.reusedPatient).toBe(true);
    expect(await db.patients.count()).toBe(1);
    expect("new" in second.item.payload.patient).toBe(true);

    state.rpcBehavior = null;
    const flushed = await flushOutbox(db, supabase);
    expect(flushed.synced).toBe(2);
    expect(state.patients).toHaveLength(1);
    expect((await db.patients.toArray())[0].pending).toBe(0);
  });

  it("drops the provisional patient when the server matched an existing one", async () => {
    const db = freshDb();
    const { supabase, state } = fakeServer();
    state.patients.push({ ...serverPatient(7), phone: "+919876543210" });

    // The local cache hasn't heard of the server's patient yet.
    const outcome = await registerVisit(db, supabase, { ...base, patient: newPatient() });
    expect(outcome.status).toBe("synced");
    if (outcome.status !== "synced") return;
    expect(outcome.result.patient_matched).toBe(true);
    expect(await db.patients.filter((p: LocalPatient) => p.pending === 1).count()).toBe(0);
  });

  it("reports server rejections instead of silently retrying", async () => {
    const db = freshDb();
    const { supabase, state } = fakeServer();
    state.rpcBehavior = () => ({ error: { code: "42501", message: "row-level security" }, status: 403 });
    const outcome = await registerVisit(db, supabase, { ...base, patient: newPatient() });
    expect(outcome.status).toBe("failed");
  });

  it("returns 'queued' without waiting when the server is slow", async () => {
    const db = freshDb();
    const { supabase, state } = fakeServer();
    state.rpcBehavior = () => new Promise(() => undefined) as Promise<never>;
    const started = Date.now();
    const outcome = await registerVisit(db, supabase, { ...base, patient: newPatient() }, { waitMs: 30 });
    expect(outcome.status).toBe("queued");
    expect(Date.now() - started).toBeLessThan(500);
  });
});
