import { buildPatientSearch, type LabDB, type OutboxItem, type VisitPayload, type VisitResult } from "./db";
import type { SupabaseLike } from "./types";

export type ErrorKind = "network" | "auth" | "transient" | "permanent";

const NETWORK_MESSAGE = /failed to fetch|fetch failed|network|load failed|offline|timed? ?out|econn|enotfound/i;
const TRANSIENT_CODES = new Set(["40001", "40P01", "57014", "57P03", "PGRST000", "PGRST001", "PGRST002", "PGRST003"]);
const AUTH_CODES = new Set(["PGRST301", "PGRST302", "28000", "28P01"]);

/**
 * Decides what to do with a failed sync. Network, auth and transient errors keep
 * the visit queued for another try; permanent errors (validation, permissions)
 * move it to "failed" so staff can review it instead of retrying forever.
 */
export function classifyError(error: unknown, status?: number): ErrorKind {
  const err = (error ?? {}) as { code?: string; message?: string; status?: number };
  const code = err.code ?? "";
  const message = err.message ?? String(error ?? "");
  const httpStatus = status ?? err.status ?? 0;

  if (AUTH_CODES.has(code) || httpStatus === 401 || /jwt (expired|invalid)|not authenticated/i.test(message)) {
    return "auth";
  }
  if (!code && (httpStatus === 0 || httpStatus >= 500) && NETWORK_MESSAGE.test(message)) return "network";
  if (typeof navigator !== "undefined" && navigator.onLine === false && !code) return "network";
  if (TRANSIENT_CODES.has(code) || code.startsWith("08") || code.startsWith("53") || httpStatus >= 500) {
    return "transient";
  }
  return "permanent";
}

export type FlushStop = "network" | "auth" | "transient" | null;

export interface FlushOutcome {
  synced: number;
  failed: number;
  stoppedBy: FlushStop;
}

const STUCK_SYNCING_MS = 2 * 60 * 1000;
const KEEP_DONE_MS = 3 * 24 * 60 * 60 * 1000;

const inFlight = new Map<string, Promise<FlushOutcome>>();

const emptyOutcome = (): FlushOutcome => ({ synced: 0, failed: 0, stoppedBy: null });

export const newId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const calculateVisitTotal = (payload: Pick<VisitPayload, "tests" | "package">) => {
  const hasPackage = Boolean(payload.package) && payload.tests.some((test) => test.in_package);
  const tests = payload.tests.reduce(
    (sum, test) => sum + (hasPackage && test.in_package ? 0 : Math.max(test.price || 0, 0)),
    0,
  );
  return tests + (hasPackage ? Math.max(payload.package?.price || 0, 0) : 0);
};

export async function enqueueVisit(db: LabDB, payload: VisitPayload, patientName: string): Promise<OutboxItem> {
  const now = Date.now();
  const item: OutboxItem = {
    visit_id: payload.visit_id,
    payload,
    status: "pending",
    attempts: 0,
    last_error: null,
    created_at: now,
    updated_at: now,
    patient_name: patientName,
    total_amount: calculateVisitTotal(payload),
    result: null,
  };
  await db.outbox.put(item);
  return item;
}

async function applyResult(db: LabDB, item: OutboxItem, result: VisitResult) {
  await db.outbox.update(item.visit_id, {
    status: "done",
    result,
    last_error: null,
    updated_at: Date.now(),
  });

  if ("new" in item.payload.patient) {
    const localId = item.payload.patient.new.id;
    if (result.patient_uuid !== localId) {
      // The server matched an existing patient by phone; drop our provisional copy.
      await db.patients.delete(localId);
    } else if (result.patient_code) {
      await db.patients.update(localId, {
        patient_id: result.patient_code,
        pending: 0,
      });
      const row = await db.patients.get(localId);
      if (row) {
        await db.patients.update(localId, {
          search: buildPatientSearch(row.full_name, row.phone, result.patient_code),
        });
      }
    }
  }
}

async function runFlush(db: LabDB, supabase: SupabaseLike): Promise<FlushOutcome> {
  const outcome = emptyOutcome();
  const now = Date.now();

  // A crash mid-sync leaves "syncing" rows behind; replaying is safe (idempotent).
  await db.outbox
    .where("status")
    .equals("syncing")
    .filter((item) => now - item.updated_at > STUCK_SYNCING_MS)
    .modify({ status: "pending" });

  await db.outbox
    .where("status")
    .equals("done")
    .filter((item) => now - item.updated_at > KEEP_DONE_MS)
    .delete();

  for (;;) {
    const pending = await db.outbox.where("status").equals("pending").sortBy("created_at");
    const item = pending[0];
    if (!item) return outcome;

    await db.outbox.update(item.visit_id, { status: "syncing", updated_at: Date.now() });

    let data: VisitResult | null = null;
    let error: unknown = null;
    let status: number | undefined;
    try {
      const response = await supabase.rpc("register_visit", { p_payload: item.payload });
      data = response.data as VisitResult | null;
      error = response.error;
      status = (response as { status?: number }).status;
    } catch (thrown) {
      error = thrown;
    }

    if (!error && data) {
      await applyResult(db, item, data);
      outcome.synced += 1;
      continue;
    }

    const kind = classifyError(error, status);
    const message = (error as { message?: string } | null)?.message ?? "Sync failed";

    if (kind === "permanent") {
      await db.outbox.update(item.visit_id, {
        status: "failed",
        attempts: item.attempts + 1,
        last_error: message,
        updated_at: Date.now(),
      });
      outcome.failed += 1;
      continue;
    }

    await db.outbox.update(item.visit_id, {
      status: "pending",
      attempts: item.attempts + 1,
      last_error: message,
      updated_at: Date.now(),
    });
    outcome.stoppedBy = kind;
    return outcome;
  }
}

/**
 * Sends queued visits to the server one at a time, oldest first. Safe to call
 * from anywhere, any number of times: overlapping calls share one run, and
 * Web Locks keep separate windows from syncing at the same time.
 */
export function flushOutbox(db: LabDB, supabase: SupabaseLike): Promise<FlushOutcome> {
  const existing = inFlight.get(db.name);
  if (existing) return existing;

  const run = (async () => {
    const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
    if (locks?.request) {
      const result = await locks.request(`${db.name}:outbox`, { ifAvailable: true }, async (lock) =>
        lock ? runFlush(db, supabase) : emptyOutcome(),
      );
      return result as FlushOutcome;
    }
    return runFlush(db, supabase);
  })().finally(() => inFlight.delete(db.name));

  inFlight.set(db.name, run);
  return run;
}

export async function retryFailed(db: LabDB, visitId: string) {
  await db.outbox.update(visitId, { status: "pending", last_error: null, updated_at: Date.now() });
}

export async function discardFailed(db: LabDB, visitId: string) {
  const item = await db.outbox.get(visitId);
  if (item?.status !== "failed") return;
  await db.outbox.delete(visitId);
  if ("new" in item.payload.patient) {
    const stillUsed = await db.outbox
      .filter((other) => "new" in other.payload.patient && other.payload.patient.new.id === (item.payload.patient as { new: { id: string } }).new.id)
      .count();
    if (stillUsed === 0) await db.patients.where("id").equals(item.payload.patient.new.id).and((p) => p.pending === 1).delete();
  }
}
