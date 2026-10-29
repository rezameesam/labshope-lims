import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import { visibleInterval } from "@/lib/visibleInterval";
import { getLabDb, type LabDB } from "@/lib/offline/db";
import { flushOutbox } from "@/lib/offline/outbox";
import { editPatient as queuePatientEdit, flushEdits } from "@/lib/offline/edits";
import { refreshCatalog, syncInvoices, syncPatients } from "@/lib/offline/sync";
import type { PatientPatch } from "@/lib/offline/db";
import { registerVisit, type RegisterVisitInput, type RegisterVisitOutcome } from "@/lib/offline/visit";
import { useLive } from "@/lib/offline/useLive";
import type { SupabaseLike } from "@/lib/offline/types";

const client = supabase as unknown as SupabaseLike;
const PULL_INTERVAL_MS = 60 * 1000;

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  /** Visits saved on this device and not yet confirmed by the server. */
  waiting: number;
  /** Visits the server rejected; they need a person to look at them. */
  failed: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

interface OfflineContextValue {
  db: LabDB | null;
  organizationId: string | null;
  status: SyncStatus;
  syncNow: () => Promise<void>;
  /** Saves a patient change on this device immediately and uploads it in the background. */
  editPatient: (patientId: string, patch: PatientPatch) => Promise<void>;
  registerVisit: (input: Omit<RegisterVisitInput, "organizationId">) => Promise<RegisterVisitOutcome>;
}

const idleStatus: SyncStatus = {
  online: true,
  syncing: false,
  waiting: 0,
  failed: 0,
  lastSyncedAt: null,
  lastError: null,
};

const OfflineContext = createContext<OfflineContextValue>({
  db: null,
  organizationId: null,
  status: idleStatus,
  syncNow: async () => undefined,
  editPatient: async () => {
    throw new Error("Offline data is not available yet");
  },
  registerVisit: async () => {
    throw new Error("Offline data is not available yet");
  },
});

export const useOffline = () => useContext(OfflineContext);

export const OfflineProvider = ({ children }: { children: ReactNode }) => {
  const { user, isStaff, isCollector } = useAuth();
  const { organization } = useOrganization();
  const organizationId = organization?.id ?? null;
  const active = Boolean(user && organizationId && (isStaff || isCollector));

  const db = useMemo(() => (active && organizationId ? getLabDb(organizationId) : null), [active, organizationId]);

  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const running = useRef(false);

  const outbox = useLive(db ? () => db.outbox.toArray() : null, [db], []);
  const edits = useLive(db ? () => db.edits.toArray() : null, [db], []);
  const waiting =
    outbox.filter((item) => item.status === "pending" || item.status === "syncing").length +
    edits.filter((edit) => edit.status !== "failed").length;
  const failed =
    outbox.filter((item) => item.status === "failed").length + edits.filter((edit) => edit.status === "failed").length;

  const syncNow = useCallback(async () => {
    if (!db || !organizationId || running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      // Send our own changes first so the pull below already includes them.
      const flushed = await flushOutbox(db, client);
      const edited = flushed.stoppedBy ? null : await flushEdits(db, client);
      await Promise.all([
        refreshCatalog(db, client, organizationId),
        syncPatients(db, client, organizationId),
        syncInvoices(db, client, organizationId),
      ]);
      if (flushed.stoppedBy === "network" || edited?.stoppedBy === "network") {
        setOnline(false);
      } else {
        setOnline(true);
        setLastSyncedAt(Date.now());
        setLastError(null);
      }
    } catch (error) {
      const message = (error as { message?: string })?.message ?? "Sync failed";
      setLastError(message);
      if (/failed to fetch|network|load failed/i.test(message)) setOnline(false);
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [db, organizationId]);

  useEffect(() => {
    if (!db) return undefined;
    void syncNow();

    const onOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const stopTimer = visibleInterval(() => void syncNow(), PULL_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      stopTimer();
    };
  }, [db, syncNow]);

  const register = useCallback(
    async (input: Omit<RegisterVisitInput, "organizationId">) => {
      if (!db || !organizationId) throw new Error("Offline data is not available yet");
      const outcome = await registerVisit(db, client, { ...input, organizationId });
      if (outcome.status === "queued") setOnline(false);
      return outcome;
    },
    [db, organizationId],
  );

  const editPatient = useCallback(
    async (patientId: string, patch: PatientPatch) => {
      if (!db) throw new Error("Offline data is not available yet");
      await queuePatientEdit(db, patientId, patch);
      void flushEdits(db, client).then((outcome) => {
        if (outcome.stoppedBy === "network") setOnline(false);
      });
    },
    [db],
  );

  const value = useMemo<OfflineContextValue>(
    () => ({
      db,
      organizationId,
      status: { online, syncing, waiting, failed, lastSyncedAt, lastError },
      syncNow,
      editPatient,
      registerVisit: register,
    }),
    [db, organizationId, online, syncing, waiting, failed, lastSyncedAt, lastError, syncNow, editPatient, register],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
};
