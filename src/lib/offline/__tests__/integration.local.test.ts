import "fake-indexeddb/auto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getLabDb } from "../db";
import { flushOutbox } from "../outbox";
import { refreshCatalog, searchPatients, syncPatients } from "../sync";
import { registerVisit } from "../visit";
import type { SupabaseLike } from "../types";

/**
 * End-to-end check of the offline layer against a real local Supabase (real
 * auth, real RLS, the real register_visit function). Skipped unless configured:
 *
 *   LIMS_IT_URL=http://127.0.0.1:54321 LIMS_IT_ANON_KEY=... \
 *   LIMS_IT_EMAIL=... LIMS_IT_PASSWORD=... LIMS_IT_ORG=<org uuid> LIMS_IT_LAB=<lab uuid> \
 *   npx vitest run src/lib/offline/__tests__/integration.local.test.ts
 *
 * The user needs the admin role, membership of the organization, and the
 * organization needs a few active tests (CBC, LFT).
 */
const env = process.env;
const configured = Boolean(env.LIMS_IT_URL && env.LIMS_IT_ANON_KEY && env.LIMS_IT_EMAIL && env.LIMS_IT_PASSWORD);

describe.skipIf(!configured)("offline layer against a real database", () => {
  it("syncs the catalog, registers a visit in one call, and replays safely", async () => {
    const org = env.LIMS_IT_ORG!;
    const lab = env.LIMS_IT_LAB!;
    const raw = createClient(env.LIMS_IT_URL!, env.LIMS_IT_ANON_KEY!, { auth: { persistSession: false } });
    const { error: signInError } = await raw.auth.signInWithPassword({
      email: env.LIMS_IT_EMAIL!,
      password: env.LIMS_IT_PASSWORD!,
    });
    expect(signInError).toBeNull();

    let rpcCalls = 0;
    const supabase = {
      from: (table: string) => raw.from(table as never),
      rpc: (fn: string, args?: Record<string, unknown>) => {
        rpcCalls += 1;
        return raw.rpc(fn as never, args as never);
      },
    } as unknown as SupabaseLike;

    const db = getLabDb(`it-${Date.now()}`);
    expect(await refreshCatalog(db, supabase, org, { force: true })).toBe(true);
    const cbc = await db.tests.where("name").equals("CBC").first();
    const lft = await db.tests.where("name").equals("LFT").first();
    expect(cbc?.price).toBe(300);
    expect(lft?.price).toBe(450);

    const phone = `+9190${Math.floor(10000000 + Math.random() * 89999999)}`;
    const input = {
      organizationId: org,
      labId: lab,
      testDate: new Date().toISOString().slice(0, 10),
      patient: { new: { full_name: "Integration Patient", phone, phoneVariants: [phone, phone.slice(3)] } },
      tests: [
        { test_name: "CBC", price: cbc!.price!, in_package: false },
        { test_name: "LFT", price: lft!.price!, in_package: false },
      ],
    };

    rpcCalls = 0;
    const outcome = await registerVisit(db, supabase, input);
    expect(outcome.status).toBe("synced");
    if (outcome.status !== "synced") return;
    expect(rpcCalls).toBe(1);
    expect(outcome.result.total_amount).toBe(750);
    expect(outcome.result.patient_created).toBe(true);
    expect(outcome.result.invoice_number).toMatch(/^INV\d{2}\d{5}$/);

    // The invoice really exists, with its items and tests.
    const { data: items } = await raw.from("invoice_items").select("test_name, amount").eq("invoice_id", outcome.result.invoice_id);
    expect(items).toHaveLength(2);
    const { data: tests } = await raw.from("patient_tests").select("test_name, status").eq("patient_id", outcome.result.patient_uuid);
    expect(tests?.map((t) => t.status)).toEqual(["pending", "pending"]);

    // Pulling patients brings the new one in, searchable locally by phone.
    await syncPatients(db, supabase, org);
    const found = await searchPatients(db, phone.slice(5));
    expect(found.map((p) => p.id)).toContain(outcome.result.patient_uuid);

    // Replaying the same visit (e.g. after a crash) creates nothing new.
    await db.outbox.update(outcome.item.visit_id, { status: "pending", result: null });
    const replay = await flushOutbox(db, supabase);
    expect(replay.synced).toBe(1);
    const { count } = await raw.from("invoices").select("id", { count: "exact", head: true }).eq("patient_id", outcome.result.patient_uuid);
    expect(count).toBe(1);

    // A second visit for the same phone reuses the patient.
    const second = await registerVisit(db, supabase, input);
    expect(second.status).toBe("synced");
    expect(second.reusedPatient || (second.status === "synced" && second.result.patient_matched)).toBe(true);
    if (second.status === "synced") {
      expect(second.result.patient_uuid).toBe(outcome.result.patient_uuid);
      expect(second.result.invoice_number).not.toBe(outcome.result.invoice_number);
    }
  }, 30000);
});
