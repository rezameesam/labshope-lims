import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOffline } from "@/contexts/OfflineContext";
import { useLive } from "@/lib/offline/useLive";
import SheetGrid, { type SheetColumn } from "./SheetGrid";

interface VisitRow {
  id: string;
  invoice: string;
  date: string;
  patient: string;
  patientCode: string;
  phone: string;
  amount: number;
  paid: number;
  due: number;
  status: string;
  method: string;
  waiting: boolean;
}

type RangeKey = "today" | "yesterday" | "7" | "30" | "90";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const resolveRange = (key: RangeKey, now = new Date()) => {
  const today = startOfDay(now);
  const day = 24 * 60 * 60 * 1000;
  switch (key) {
    case "today":
      return { from: today, to: new Date(today.getTime() + day - 1) };
    case "yesterday":
      return { from: new Date(today.getTime() - day), to: new Date(today.getTime() - 1) };
    default:
      return { from: new Date(today.getTime() - (Number(key) - 1) * day), to: new Date(today.getTime() + day - 1) };
  }
};

const money = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const titleCase = (value: string | null) => (value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ") : "");

const VisitsSheet = () => {
  const { db } = useOffline();
  const [rangeKey, setRangeKey] = useState<RangeKey>("today");
  const { from, to } = useMemo(() => resolveRange(rangeKey), [rangeKey]);

  const rows = useLive(
    db
      ? async () => {
          const invoices = await db.invoices.where("created_at").between(from.toISOString(), to.toISOString(), true, true).toArray();
          const patients = await db.patients.bulkGet([...new Set(invoices.map((invoice) => invoice.patient_id))]);
          const byId = new Map(patients.filter(Boolean).map((patient) => [patient!.id, patient!]));

          const synced: VisitRow[] = invoices.map((invoice) => {
            const patient = byId.get(invoice.patient_id);
            const amount = invoice.final_amount || invoice.total_amount;
            return {
              id: invoice.id,
              invoice: invoice.invoice_number,
              date: invoice.created_at,
              patient: patient?.full_name ?? "Unknown patient",
              patientCode: patient?.patient_id ?? "",
              phone: patient?.phone ?? "",
              amount,
              paid: invoice.paid_amount,
              due: Math.max(amount - invoice.paid_amount, 0),
              status: titleCase(invoice.payment_status),
              method: titleCase(invoice.payment_method),
              waiting: false,
            };
          });

          // Visits saved on this device that the server has not confirmed yet.
          const queued = await db.outbox
            .filter((item) => item.status !== "done" && item.created_at >= from.getTime() && item.created_at <= to.getTime())
            .toArray();
          const waiting: VisitRow[] = queued.map((item) => ({
            id: item.visit_id,
            invoice: item.status === "failed" ? "Needs attention" : "Waiting to upload",
            date: new Date(item.created_at).toISOString(),
            patient: item.patient_name,
            patientCode: "",
            phone: "new" in item.payload.patient ? item.payload.patient.new.phone : "",
            amount: item.total_amount,
            paid: 0,
            due: item.total_amount,
            status: item.status === "failed" ? "Failed" : "Pending",
            method: "",
            waiting: true,
          }));

          return [...waiting, ...synced].sort((a, b) => b.date.localeCompare(a.date));
        }
      : null,
    [db, from.getTime(), to.getTime()],
    [] as VisitRow[],
  );

  const columns = useMemo<SheetColumn<VisitRow>[]>(
    () => [
      {
        id: "invoice",
        header: "Invoice",
        width: 150,
        value: (r) => r.invoice,
        display: (r) =>
          r.waiting ? (
            <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
              {r.invoice}
            </Badge>
          ) : (
            r.invoice
          ),
      },
      {
        id: "date",
        header: "Time",
        width: 150,
        value: (r) => r.date,
        display: (r) => new Date(r.date).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      },
      { id: "patient", header: "Patient", width: 220, value: (r) => r.patient },
      { id: "patientCode", header: "Patient ID", width: 120, value: (r) => r.patientCode },
      { id: "phone", header: "Phone", width: 140, value: (r) => r.phone },
      { id: "amount", header: "Amount", width: 110, align: "right", value: (r) => r.amount, display: (r) => money(r.amount) },
      { id: "paid", header: "Paid", width: 110, align: "right", value: (r) => r.paid, display: (r) => money(r.paid) },
      { id: "due", header: "Due", width: 110, align: "right", value: (r) => r.due, display: (r) => money(r.due) },
      { id: "status", header: "Status", width: 110, value: (r) => r.status },
      { id: "method", header: "Method", width: 110, value: (r) => r.method },
    ],
    [],
  );

  return (
    <SheetGrid<VisitRow>
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      exportName={`visit-register-${rangeKey}`}
      emptyMessage="No visits in this period."
      rowClassName={(row) => (row.waiting ? "bg-amber-50/60 dark:bg-amber-950/20" : undefined)}
      toolbar={
        <div className="flex items-center gap-1" role="group" aria-label="Period">
          {RANGES.map((range) => (
            <Button
              key={range.key}
              size="sm"
              variant={rangeKey === range.key ? "default" : "outline"}
              className="h-8"
              onClick={() => setRangeKey(range.key)}
            >
              {range.label}
            </Button>
          ))}
        </div>
      }
      footer={(visible) => {
        const total = visible.reduce((sum, row) => sum + row.amount, 0);
        const paid = visible.reduce((sum, row) => sum + row.paid, 0);
        return (
          <span className="font-medium text-foreground">
            Total ₹{money(total)} · Paid ₹{money(paid)} · Due ₹{money(Math.max(total - paid, 0))}
          </span>
        );
      }}
    />
  );
};

export default VisitsSheet;
