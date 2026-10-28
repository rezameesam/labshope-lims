import { useCallback, useEffect, useState } from "react";
import { Receipt, CheckCircle, Clock, IndianRupee } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { sendPaymentSuccessNotification } from "@/services/notificationService";
import { formatAppDate } from "@/lib/date";
import { loadPdfDependencies } from "@/lib/pdf/loadPdfDependencies";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BillingHistory } from "./billing/BillingHistory";
import { BillingDetail } from "./billing/BillingDetail";

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  discount_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string | null;
  created_at: string;
  paid_at: string | null;
  notes: string | null;
}

interface InvoiceItem {
  id: string;
  test_name: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  transaction_id: string | null;
  payment_date: string;
  notes: string | null;
}

interface BillingPortalProps {
  patientId: string;
  organizationId?: string | null;
  patientName?: string;
  patientPhone?: string;
  onPaymentStatusChange?: () => void;
}

const getPaymentMethodLabel = (method: string) => {
  const map: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card", bank_transfer: "Bank Transfer", online: "Online" };
  return map[method] || method;
};

const BillingPortal = ({ patientId, organizationId, patientName, patientPhone, onPaymentStatusChange }: BillingPortalProps) => {
  const { branding } = useOrganization();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  const fetchInvoices = useCallback(async () => {
    if (!organizationId) { setInvoices([]); setLoading(false); return; }
    try {
      const { data, error } = await supabase.from("invoices").select("*").eq("patient_id", patientId).eq("organization_id", organizationId).order("created_at", { ascending: false });
      if (error) throw error;
      setInvoices(data || []);
    } catch (error) { console.error("Error fetching invoices:", error); toast.error("Failed to load billing information"); }
    finally { setLoading(false); }
  }, [organizationId, patientId]);

  const fetchInvoiceDetails = async (invoiceId: string) => {
    if (!organizationId) { setSelectedInvoice(null); setInvoiceItems([]); setPayments([]); return; }
    try {
      const { data: inv, error: invErr } = await supabase.from("invoices").select("*").eq("id", invoiceId).eq("organization_id", organizationId).single();
      if (invErr) throw invErr;
      if (inv) setSelectedInvoice(inv);
      const { data: items, error: itemsErr } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).eq("organization_id", organizationId);
      if (itemsErr) throw itemsErr;
      setInvoiceItems(items || []);
      const { data: pData, error: pErr } = await supabase.from("payments").select("*").eq("invoice_id", invoiceId).eq("organization_id", organizationId).order("payment_date", { ascending: false });
      if (pErr) throw pErr;
      setPayments(pData || []);
    } catch (error) { console.error("Error fetching invoice details:", error); }
  };

  useEffect(() => {
    if (patientId && organizationId) void fetchInvoices();
    else { setInvoices([]); setLoading(false); }
  }, [fetchInvoices, organizationId, patientId]);

  const getOutstandingAmount = (invoice: Invoice) => Math.max(0, (Number(invoice.final_amount) || 0) - (Number(invoice.paid_amount) || 0));

  const getDisplayPaymentStatus = (invoice: Invoice) => {
    const outstanding = getOutstandingAmount(invoice);
    const paid = Number(invoice.paid_amount) || 0;
    if (outstanding <= 0) return "paid";
    if (paid > 0) return "partial";
    return "pending";
  };

  const handlePaymentNotification = async (invoice: Invoice) => {
    const amount = getOutstandingAmount(invoice);
    if (amount <= 0) return;
    const results = await sendPaymentSuccessNotification(patientId, amount, invoice.invoice_number, branding.displayName, `${window.location.origin}/auth/patient`);
    if (!results.some(r => r.success)) console.warn("Payment notification failed:", results);
  };

  const handleBulkPaymentNotification = async (amount: number) => {
    if (amount <= 0) return;
    const results = await sendPaymentSuccessNotification(patientId, amount, undefined, branding.displayName, `${window.location.origin}/auth/patient`);
    if (!results.some(r => r.success)) console.warn("Bulk payment notification failed:", results);
  };

  const generateInvoicePDF = async (invoicesToDownload: Invoice[]) => {
    if (invoicesToDownload.length === 0) { toast.error("No invoices selected"); return; }
    try {
      const { jsPDF, autoTable } = await loadPdfDependencies();
      const doc = new jsPDF();
      let yOffset = 20;
      for (let i = 0; i < invoicesToDownload.length; i++) {
        const invoice = invoicesToDownload[i];
        if (i > 0) { doc.addPage(); yOffset = 20; }
        const { data: items } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoice.id).eq("organization_id", organizationId);
        const { data: paymentData } = await supabase.from("payments").select("amount, payment_method, payment_date, transaction_id").eq("invoice_id", invoice.id).eq("organization_id", organizationId).order("payment_date", { ascending: false });
        doc.setFontSize(20); doc.setTextColor(26, 54, 93); doc.text(branding.displayName, 105, yOffset, { align: "center" });
        yOffset += 8; doc.setFontSize(10); doc.setTextColor(100, 100, 100); doc.text(`${branding.addressLines.join(", ")} | Phone: ${branding.primaryPhone}`, 105, yOffset, { align: "center" });
        yOffset += 15; doc.setFontSize(16); doc.setTextColor(0, 0, 0); doc.text("INVOICE", 105, yOffset, { align: "center" });
        yOffset += 15; doc.setFontSize(10); doc.text(`Invoice No: ${invoice.invoice_number}`, 20, yOffset); doc.text(`Date: ${formatAppDate(invoice.created_at)}`, 140, yOffset);
        yOffset += 8; doc.text(`Status: ${getDisplayPaymentStatus(invoice).toUpperCase()}`, 20, yOffset);
        yOffset += 10;
        autoTable(doc, { startY: yOffset, head: [["Test Name", "Qty", "Unit Price", "Amount"]], body: (items || []).map(item => [item.test_name, item.quantity.toString(), `₹${item.unit_price.toLocaleString()}`, `₹${item.amount.toLocaleString()}`]), theme: "striped", headStyles: { fillColor: [26, 54, 93] }, margin: { left: 20, right: 24 }, styles: { fontSize: 9, cellPadding: 2, overflow: "linebreak", cellWidth: "wrap" }, columnStyles: { 0: { cellWidth: 84 }, 1: { cellWidth: 16, halign: "center" }, 2: { cellWidth: 34, halign: "center" }, 3: { cellWidth: 34, halign: "center" } } });
        yOffset = ((doc as any).lastAutoTable.finalY || yOffset + 30) + 10;
        const amountX = 182, rightX = 140;
        doc.setFontSize(10); doc.text("Subtotal:", rightX, yOffset); doc.text(`₹${invoice.total_amount.toLocaleString()}`, amountX, yOffset, { align: "right" });
        if (invoice.discount_amount > 0) { yOffset += 7; doc.setTextColor(34, 139, 34); doc.text("Discount:", rightX, yOffset); doc.text(`-₹${invoice.discount_amount.toLocaleString()}`, amountX, yOffset, { align: "right" }); doc.setTextColor(0, 0, 0); }
        yOffset += 7; doc.setFontSize(12); doc.setFont(undefined as unknown as string, "bold"); doc.text("Total:", rightX, yOffset); doc.text(`₹${invoice.final_amount.toLocaleString()}`, amountX, yOffset, { align: "right" });
        yOffset += 7; doc.setFontSize(10); doc.setFont(undefined as unknown as string, "normal"); doc.setTextColor(34, 139, 34); doc.text("Paid:", rightX, yOffset); doc.text(`₹${invoice.paid_amount.toLocaleString()}`, amountX, yOffset, { align: "right" });
        if (invoice.final_amount - invoice.paid_amount > 0) { yOffset += 7; doc.setTextColor(255, 140, 0); doc.text("Outstanding:", rightX, yOffset); doc.text(`₹${(invoice.final_amount - invoice.paid_amount).toLocaleString()}`, amountX, yOffset, { align: "right" }); }
        doc.setTextColor(0, 0, 0);
        const paymentsForInvoice = paymentData || [];
        if (paymentsForInvoice.length > 0) {
          yOffset += 10; doc.setFontSize(11); doc.text("Payments", 20, yOffset); yOffset += 6; doc.setFontSize(9); doc.setTextColor(80, 80, 80);
          paymentsForInvoice.forEach(payment => {
            const lines = [`₹${Number(payment.amount).toLocaleString()}`, `${getPaymentMethodLabel(payment.payment_method)} • ${formatAppDate(payment.payment_date)}`, payment.transaction_id ? `Txn: ${payment.transaction_id}` : null].filter(Boolean) as string[];
            lines.forEach(line => { const wrapped = doc.splitTextToSize(line, 170); doc.text(wrapped, 20, yOffset); yOffset += wrapped.length * 5; }); yOffset += 1;
          });
        }
      }
      doc.save(invoicesToDownload.length === 1 ? `Invoice_${invoicesToDownload[0].invoice_number}.pdf` : `Invoices_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`);
      toast.success(`${invoicesToDownload.length} invoice(s) downloaded`);
    } catch (error) { console.error("Error generating PDF:", error); toast.error("Failed to generate invoice PDF"); }
  };

  const totalBilled = invoices.reduce((sum, inv) => sum + (Number(inv.final_amount) || 0), 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + (Number(inv.paid_amount) || 0), 0);
  const totalPending = Math.max(0, totalBilled - totalPaid);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Billed</p><p className="text-2xl font-bold">₹{totalBilled.toLocaleString()}</p></div><Receipt className="h-8 w-8 text-blue-500/50" /></div></CardContent></Card>
        <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Total Paid</p><p className="text-2xl font-bold">₹{totalPaid.toLocaleString()}</p></div><CheckCircle className="h-8 w-8 text-emerald-500/50" /></div></CardContent></Card>
        <Card className="border-l-4 border-l-amber-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Outstanding</p><p className="text-2xl font-bold">₹{totalPending.toLocaleString()}</p></div><Clock className="h-8 w-8 text-amber-500/50" /></div></CardContent></Card>
      </div>

      <BillingHistory
        invoices={invoices}
        selectedInvoiceIds={selectedInvoiceIds}
        onToggleSelection={(id) => {
          const s = new Set(selectedInvoiceIds);
          if (s.has(id)) {
            s.delete(id);
          } else {
            s.add(id);
          }
          setSelectedInvoiceIds(s);
        }}
        onSelectAll={() => setSelectedInvoiceIds(new Set(invoices.map(i => i.id)))}
        onClearSelection={() => setSelectedInvoiceIds(new Set())}
        onOpenDetails={async (invoice) => { setSelectedInvoice(invoice); await fetchInvoiceDetails(invoice.id); setIsDetailsOpen(true); }}
        onDownloadSingle={(invoice) => generateInvoicePDF([invoice])}
        onDownloadSelected={() => generateInvoicePDF(invoices.filter(i => selectedInvoiceIds.has(i.id)))}
        getOutstandingAmount={getOutstandingAmount}
        getDisplayPaymentStatus={getDisplayPaymentStatus}
        patientName={patientName}
        patientPhone={patientPhone}
        onPaymentSuccess={async (invoice) => { await fetchInvoices(); onPaymentStatusChange?.(); await handlePaymentNotification(invoice); }}
        onBulkPaymentSuccess={async (total) => { await fetchInvoices(); onPaymentStatusChange?.(); await handleBulkPaymentNotification(total); }}
      />

      <BillingDetail
        isOpen={isDetailsOpen}
        onOpenChange={setIsDetailsOpen}
        selectedInvoice={selectedInvoice}
        invoiceItems={invoiceItems}
        payments={payments}
        getOutstandingAmount={getOutstandingAmount}
        getDisplayPaymentStatus={getDisplayPaymentStatus}
        onDownloadSingle={(invoice) => generateInvoicePDF([invoice])}
        patientName={patientName}
        patientPhone={patientPhone}
        onPaymentSuccess={async (invoice) => { await fetchInvoices(); await fetchInvoiceDetails(invoice.id); onPaymentStatusChange?.(); await handlePaymentNotification(invoice); }}
      />
    </div>
  );
};

export default BillingPortal;
