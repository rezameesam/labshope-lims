import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { LabDB } from "@/lib/offline/db";
import { resolveScan } from "../resolveScan";

let db: LabDB;

beforeEach(async () => {
  db = new LabDB(`scan-${Math.random()}`);
  await db.patients.put({
    id: "p1", patient_id: "IRM-0007", full_name: "Asha Rao", phone: "9999999999", gender: null,
    date_of_birth: null, lab_id: null, collection_center_id: null, is_active: true,
    updated_at: "2026-10-29T00:00:00Z", search: "asha rao", pending: 0,
  });
  await db.invoices.put({
    id: "i1", invoice_number: "INV-2026-0042", patient_id: "p1", total_amount: 500, final_amount: 500,
    paid_amount: 0, payment_status: "pending", payment_method: null, lab_id: null,
    created_at: "2026-10-29T00:00:00Z", updated_at: "2026-10-29T00:00:00Z",
  });
});

describe("resolveScan", () => {
  it("finds a patient by ID", async () => {
    const match = await resolveScan(db, "IRM-0007");
    expect(match.kind).toBe("patient");
  });

  it("is not case sensitive and trims the scan", async () => {
    expect((await resolveScan(db, " irm-0007\r")).kind).toBe("patient");
  });

  it("finds an invoice and its patient", async () => {
    const match = await resolveScan(db, "inv-2026-0042");
    expect(match.kind).toBe("invoice");
    if (match.kind === "invoice") expect(match.patient?.full_name).toBe("Asha Rao");
  });

  it("reports an unknown code", async () => {
    expect(await resolveScan(db, "NOPE-1")).toEqual({ kind: "none", code: "NOPE-1" });
  });
});
