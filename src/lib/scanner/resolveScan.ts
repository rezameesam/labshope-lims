import type { LabDB, LocalInvoice, LocalPatient } from "@/lib/offline/db";

export type ScanMatch =
  | { kind: "patient"; patient: LocalPatient }
  | { kind: "invoice"; invoice: LocalInvoice; patient: LocalPatient | null }
  | { kind: "none"; code: string };

/** Scanners sometimes add a prefix/suffix or change case; keep only what identifies the code. */
export const cleanScan = (raw: string) => raw.trim().replace(/[\r\n\t]/g, "");

/**
 * Looks a scanned code up in the local copy of the data, so it works offline.
 * Matches a patient ID first, then an invoice number (the number printed on the bill/label).
 */
export async function resolveScan(db: LabDB, raw: string): Promise<ScanMatch> {
  const code = cleanScan(raw);
  if (!code) return { kind: "none", code };

  const patient =
    (await db.patients.where("patient_id").equals(code).first()) ??
    (await db.patients.where("patient_id").equalsIgnoreCase(code).first());
  if (patient) return { kind: "patient", patient };

  const invoice = (await db.invoices.toArray()).find(
    (row) => row.invoice_number.toLowerCase() === code.toLowerCase(),
  );
  if (invoice) {
    const owner = (await db.patients.get(invoice.patient_id)) ?? null;
    return { kind: "invoice", invoice, patient: owner };
  }
  return { kind: "none", code };
}
