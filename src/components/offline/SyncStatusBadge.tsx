import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOffline } from "@/contexts/OfflineContext";
import { revertEdit, retryEdit } from "@/lib/offline/edits";
import { discardFailed, retryFailed } from "@/lib/offline/outbox";
import { useLive } from "@/lib/offline/useLive";

const formatTime = (value: number | null) =>
  value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "not yet";

const SyncStatusBadge = () => {
  const { db, status, syncNow } = useOffline();
  const items = useLive(db ? () => db.outbox.orderBy("created_at").reverse().limit(30).toArray() : null, [db], []);

  const edits = useLive(db ? () => db.edits.toArray() : null, [db], []);
  const patientNames = useLive(
    db ? async () => Object.fromEntries((await db.patients.bulkGet(edits.map((edit) => edit.id))).map((p) => [p?.id ?? "", p?.full_name ?? "Patient"])) : null,
    [db, edits],
    {} as Record<string, string>,
  );

  if (!db) return null;

  const { online, syncing, waiting, failed } = status;
  const open = items.filter((item) => item.status !== "done");

  let tone = "text-emerald-700 dark:text-emerald-400";
  let label = "Synced";
  let icon = <CheckCircle2 className="h-4 w-4" />;
  if (failed > 0) {
    tone = "text-destructive";
    label = `${failed} need${failed === 1 ? "s" : ""} attention`;
    icon = <AlertTriangle className="h-4 w-4" />;
  } else if (!online) {
    tone = "text-amber-700 dark:text-amber-400";
    label = waiting > 0 ? `Offline · ${waiting} waiting` : "Offline";
    icon = <CloudOff className="h-4 w-4" />;
  } else if (syncing || waiting > 0) {
    tone = "text-primary";
    label = waiting > 0 ? `Syncing · ${waiting}` : "Syncing";
    icon = <Loader2 className="h-4 w-4 animate-spin" />;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={`gap-1.5 ${tone}`} aria-label={`Sync status: ${label}`}>
          {icon}
          <span className="hidden text-xs font-medium sm:inline">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">{online ? "Connected" : "Working offline"}</p>
            <p className="text-xs text-muted-foreground">Last synced {formatTime(status.lastSyncedAt)}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void syncNow()} disabled={syncing}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        </div>

        {!online && (
          <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            You can keep registering patients. Everything is saved on this computer and will upload automatically.
          </p>
        )}

        {open.length === 0 && edits.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nothing waiting to upload.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {edits.map((edit) => (
              <li key={`edit-${edit.id}`} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{patientNames[edit.id] ?? "Patient"}</span>
                  <span className="text-muted-foreground">edit</span>
                </div>
                {edit.status === "failed" ? (
                  <>
                    <p className="mt-1 text-destructive">{edit.last_error}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => void retryEdit(db, edit.id).then(syncNow)}>
                        Retry
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => void revertEdit(db, edit.id)}>
                        Undo change
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    {edit.attempts > 0 && edit.last_error ? `Will retry · ${edit.last_error}` : "Waiting to upload"}
                  </p>
                )}
              </li>
            ))}
            {open.map((item) => (
              <li key={item.visit_id} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.patient_name}</span>
                  <span className="text-muted-foreground">₹{item.total_amount.toLocaleString()}</span>
                </div>
                {item.status === "failed" ? (
                  <>
                    <p className="mt-1 text-destructive">{item.last_error}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" className="h-7" onClick={() => void retryFailed(db, item.visit_id).then(syncNow)}>
                        Retry
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-destructive" onClick={() => void discardFailed(db, item.visit_id)}>
                        Discard
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    {item.attempts > 0 && item.last_error ? `Will retry · ${item.last_error}` : "Waiting to upload"}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default SyncStatusBadge;
