import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { getLabDb, type LocalPatient, type VisitPayload } from "../db";
import { EditValidationError, editPatient, flushEdits, parseDateInput, retryEdit, revertEdit, validatePatch } from "../edits";
import { enqueueVisit } from "../outbox";
import { INVOICE_HISTORY_DAYS, syncInvoices, syncPatients, toLocalPatient } from "../sync";
import type { SupabaseLike } from "../types";

let counter = 0;
const freshDb = () => getLabDb(`edits-org-${++counter}`);

const patient = (overrides: Partial<LocalPatient> = {}): LocalPatient => ({
  ...toLocalPatient({
    id: "p1",
    patient_id: "PAT1",
    full_name: "Asha Rao",
    phone: "+919876543210",
    gender: "female",
    date_of_birth: "1990-05-01",
    lab_id: null,
    collection_center_id: null,
    is_active: true,
    updated_at: "2026-01-01T00:00:00.000Z",
  }),
  ...overrides,
});

/** Records patients.update(...).eq(...).select(...) calls and answers with a canned response. */
type UpdateResponse = { data: unknown; error: unknown; status?: number };

function updateClient(respond: () => UpdateResponse | Promise<UpdateResponse>) {
  const calls: Array<{ patch: unknown; id: unknown }> = [];
  const supabase = {
    rpc: vi.fn(),
    from: () => ({
      update: (patch: unknown) => ({
        eq: (_col: string, id: unknown) => ({
          select: async () => {
            calls.push({ patch, id });
            return respond();
          },
        }),
      }),
    }),
  } as unknown as SupabaseLike;
  return { supabase, calls };
}

describe("validation", () => {
  it("normalizes valid input and rejects bad input with a readable message", () => {
    expect(validatePatch("full_name", "  Asha  ")).toEqual({ full_name: "Asha" });
    expect(validatePatch("phone", "9876543210")).toEqual({ phone: "+919876543210" });
    expect(validatePatch("gender", "Female")).toEqual({ gender: "female" });
    expect(validatePatch("gender", "")).toEqual({ gender: null });
    expect(validatePatch("date_of_birth", "05/01/1990")).toEqual({ date_of_birth: "1990-01-05" });
    expect(() => validatePatch("full_name", " ")).toThrow(EditValidationError);
    expect(() => validatePatch("phone", "123")).toThrow(/valid phone/);
    expect(() => validatePatch("gender", "x")).toThrow(/male, female or other/);
  });

  it("parses dates in common formats and refuses impossible or future ones", () => {
    expect(parseDateInput("1990-05-01")).toBe("1990-05-01");
    expect(parseDateInput("1/5/1990")).toBe("1990-05-01");
    expect(parseDateInput("")).toBeNull();
    expect(() => parseDateInput("31/02/1990")).toThrow(/doesn't exist/);
    expect(() => parseDateInput("tomorrow")).toThrow(/DD\/MM\/YYYY/);
    expect(() => parseDateInput("01/01/2999")).toThrow(/future/);
  });
});

describe("editPatient + flushEdits", () => {
  it("updates locally at once, then sends one merged patch per patient", async () => {
    const db = freshDb();
    await db.patients.put(patient());

    await editPatient(db, "p1", { full_name: "Asha R" });
    await editPatient(db, "p1", { phone: "+919000000000" });
    expect((await db.patients.get("p1"))?.search).toContain("asha r");

    const edit = await db.edits.get("p1");
    expect(edit?.patch).toEqual({ full_name: "Asha R", phone: "+919000000000" });
    expect(edit?.previous).toEqual({ full_name: "Asha Rao", phone: "+919876543210" });

    const { supabase, calls } = updateClient(() => ({ data: [{ id: "p1" }], error: null }));
    expect(await flushEdits(db, supabase)).toEqual({ synced: 1, failed: 0, stoppedBy: null });
    expect(calls).toEqual([{ patch: { full_name: "Asha R", phone: "+919000000000" }, id: "p1" }]);
    expect(await db.edits.count()).toBe(0);
  });

  it("keeps the edit when offline and retries later", async () => {
    const db = freshDb();
    await db.patients.put(patient());
    await editPatient(db, "p1", { full_name: "New Name" });

    const offline = updateClient(() => Promise.reject(new TypeError("Failed to fetch")));
    expect((await flushEdits(db, offline.supabase)).stoppedBy).toBe("network");
    expect((await db.edits.get("p1"))?.status).toBe("pending");

    const online = updateClient(() => ({ data: [{ id: "p1" }], error: null }));
    expect((await flushEdits(db, online.supabase)).synced).toBe(1);
  });

  it("marks silently-filtered updates (RLS) as failed and can revert them", async () => {
    const db = freshDb();
    await db.patients.put(patient());
    await editPatient(db, "p1", { full_name: "Hacked" });

    const { supabase } = updateClient(() => ({ data: [], error: null }));
    expect(await flushEdits(db, supabase)).toMatchObject({ failed: 1 });
    const failed = await db.edits.get("p1");
    expect(failed?.status).toBe("failed");
    expect(failed?.last_error).toMatch(/did not accept/);

    await revertEdit(db, "p1");
    expect((await db.patients.get("p1"))?.full_name).toBe("Asha Rao");
    expect(await db.edits.count()).toBe(0);
  });

  it("reports server validation errors and allows a retry", async () => {
    const db = freshDb();
    await db.patients.put(patient());
    await editPatient(db, "p1", { phone: "+919111111111" });

    const refuse = updateClient(() => ({ data: null, error: { code: "23505", message: "duplicate phone" }, status: 409 }));
    expect((await flushEdits(db, refuse.supabase)).failed).toBe(1);
    await retryEdit(db, "p1");
    expect((await db.edits.get("p1"))?.status).toBe("pending");
  });

  it("does not drop an edit that was changed while the previous one was in flight", async () => {
    const db = freshDb();
    await db.patients.put(patient());
    await editPatient(db, "p1", { full_name: "First" });

    const { supabase } = updateClient(async () => {
      await editPatient(db, "p1", { full_name: "Second" }); // user keeps typing mid-sync
      return { data: [{ id: "p1" }], error: null };
    });
    await flushEdits(db, supabase);
    expect((await db.edits.get("p1"))?.patch).toEqual({ full_name: "Second" });
    expect((await db.edits.get("p1"))?.status).toBe("pending");
  });

  it("edits a never-synced patient inside its queued visit instead of queueing a patch", async () => {
    const db = freshDb();
    await db.patients.put(patient({ id: "local", pending: 1 }));
    const payload: VisitPayload = {
      visit_id: "v1",
      organization_id: "org",
      lab_id: "lab",
      collection_center_id: null,
      test_date: "2026-10-29",
      notes: null,
      collected_at: new Date().toISOString(),
      patient: { new: { id: "local", full_name: "Asha Rao", phone: "+919876543210", phone_variants: ["+919876543210"] } },
      tests: [{ test_name: "CBC", price: 300 }],
    };
    await enqueueVisit(db, payload, "Asha Rao");

    await editPatient(db, "local", { full_name: "Asha Rao-Iyer" });
    expect(await db.edits.count()).toBe(0);
    const item = await db.outbox.get("v1");
    expect("new" in item!.payload.patient && item!.payload.patient.new.full_name).toBe("Asha Rao-Iyer");
    expect(item?.patient_name).toBe("Asha Rao-Iyer");
  });

  it("does not let a patient pull overwrite an unsent local edit", async () => {
    const db = freshDb();
    await db.patients.put(patient());
    await editPatient(db, "p1", { full_name: "Local Change" });

    const serverRow = { ...patient(), full_name: "Server Value", updated_at: "2026-02-01T00:00:00.000Z" };
    const pull = {
      rpc: vi.fn(),
      from: () => {
        const q: any = new Proxy({}, { get: (_t, prop: string) => (prop === "then" ? (ok: any) => Promise.resolve({ data: [serverRow], error: null }).then(ok) : () => q) });
        return q;
      },
    } as unknown as SupabaseLike;

    await syncPatients(db, pull, "org");
    expect((await db.patients.get("p1"))?.full_name).toBe("Local Change");
  });
});

describe("syncInvoices", () => {
  it("stores invoices with numeric amounts and only asks for recent history on first run", async () => {
    const db = freshDb();
    const calls: Array<[string, unknown[]]> = [];
    const supabase = {
      rpc: vi.fn(),
      from: () => {
        const q: any = new Proxy(
          {},
          {
            get: (_t, prop: string) => {
              if (prop === "then") {
                return (ok: any) =>
                  Promise.resolve({
                    data: [{ id: "i1", invoice_number: "INV2600001", patient_id: "p1", total_amount: "750", final_amount: "700", paid_amount: null, payment_status: "pending", payment_method: null, lab_id: null, created_at: "2026-10-29T05:00:00Z", updated_at: "2026-10-29T05:00:00Z" }],
                    error: null,
                  }).then(ok);
              }
              return (...args: unknown[]) => {
                calls.push([prop, args]);
                return q;
              };
            },
          },
        );
        return q;
      },
    } as unknown as SupabaseLike;

    const now = Date.parse("2026-10-29T12:00:00Z");
    expect(await syncInvoices(db, supabase, "org", { now })).toBe(1);
    const row = await db.invoices.get("i1");
    expect(row).toMatchObject({ total_amount: 750, final_amount: 700, paid_amount: 0 });

    const gte = calls.find(([name]) => name === "gte");
    expect(gte?.[1][0]).toBe("created_at");
    expect(Date.parse(gte![1][1] as string)).toBe(now - INVOICE_HISTORY_DAYS * 86400000);

    // Second run resumes from the cursor instead of re-fetching history.
    calls.length = 0;
    await syncInvoices(db, supabase, "org", { now });
    expect(calls.some(([name]) => name === "gte")).toBe(false);
    expect(calls.some(([name]) => name === "or")).toBe(true);
  });
});
