import { useState, useEffect } from "react";
import { 
  Receipt, IndianRupee, CheckCircle, Clock, XCircle, 
  Calendar, FileText, CreditCard, Download
} from "lucide-react";
import { RazorpayButton } from "@/components/payment/RazorpayButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
}

interface BillingPortalProps {
  patientId: string;
  patientName?: string;
  patientPhone?: string;
  onPaymentStatusChange?: () => void;
}

const BillingPortal = ({ patientId, patientName, patientPhone, onPaymentStatusChange }: BillingPortalProps) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

  const fetchInvoices = async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to load billing information");
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoiceDetails = async (invoiceId: string) => {
    try {
      // Fetch items
      const { data: items, error: itemsError } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId);

      if (itemsError) throw itemsError;
      setInvoiceItems(items || []);

      // Fetch payments
      const { data: paymentData, error: paymentsError } = await supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("payment_date", { ascending: false });

      if (paymentsError) throw paymentsError;
      setPayments(paymentData || []);
    } catch (error) {
      console.error("Error fetching invoice details:", error);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchInvoices();
    }
  }, [patientId]);

  const openInvoiceDetails = async (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    await fetchInvoiceDetails(invoice.id);
    setIsDetailsOpen(true);
  };

  const toggleInvoiceSelection = (invoiceId: string) => {
    const newSelected = new Set(selectedInvoiceIds);
    if (newSelected.has(invoiceId)) {
      newSelected.delete(invoiceId);
    } else {
      newSelected.add(invoiceId);
    }
    setSelectedInvoiceIds(newSelected);
  };

  const selectAllInvoices = () => {
    setSelectedInvoiceIds(new Set(invoices.map(inv => inv.id)));
  };

  const clearSelection = () => {
    setSelectedInvoiceIds(new Set());
  };

  const generateInvoicePDF = async (invoicesToDownload: Invoice[]) => {
    if (invoicesToDownload.length === 0) {
      toast.error("No invoices selected");
      return;
    }

    try {
      const doc = new jsPDF();
      let yOffset = 20;

      for (let i = 0; i < invoicesToDownload.length; i++) {
        const invoice = invoicesToDownload[i];
        
        // Add new page for each invoice after the first
        if (i > 0) {
          doc.addPage();
          yOffset = 20;
        }

        // Fetch items for this invoice
        const { data: items } = await supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", invoice.id);

        // Header
        doc.setFontSize(20);
        doc.setTextColor(26, 54, 93);
        doc.text("IRM Clinical Laboratory", 105, yOffset, { align: "center" });
        
        yOffset += 8;
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text("Pampore, Pulwama, J&K | Phone: +91 9419034607", 105, yOffset, { align: "center" });
        
        yOffset += 15;
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text("INVOICE", 105, yOffset, { align: "center" });
        
        // Invoice details
        yOffset += 15;
        doc.setFontSize(10);
        doc.text(`Invoice No: ${invoice.invoice_number}`, 20, yOffset);
        doc.text(`Date: ${format(new Date(invoice.created_at), "dd MMM yyyy")}`, 140, yOffset);
        
        yOffset += 8;
        doc.text(`Status: ${invoice.payment_status.toUpperCase()}`, 20, yOffset);
        
        // Items table
        yOffset += 10;
        autoTable(doc, {
          startY: yOffset,
          head: [["Test Name", "Qty", "Unit Price", "Amount"]],
          body: (items || []).map(item => [
            item.test_name,
            item.quantity.toString(),
            `₹${item.unit_price.toLocaleString()}`,
            `₹${item.amount.toLocaleString()}`
          ]),
          theme: "striped",
          headStyles: { fillColor: [26, 54, 93] },
          margin: { left: 20, right: 20 },
        });

        // Get the final Y position after table
        const tableEndY = (doc as any).lastAutoTable.finalY || yOffset + 30;
        yOffset = tableEndY + 10;

        // Summary
        doc.setFontSize(10);
        const rightX = 150;
        doc.text("Subtotal:", rightX, yOffset);
        doc.text(`₹${invoice.total_amount.toLocaleString()}`, 190, yOffset, { align: "right" });
        
        if (invoice.discount_amount > 0) {
          yOffset += 7;
          doc.setTextColor(34, 139, 34);
          doc.text("Discount:", rightX, yOffset);
          doc.text(`-₹${invoice.discount_amount.toLocaleString()}`, 190, yOffset, { align: "right" });
          doc.setTextColor(0, 0, 0);
        }
        
        yOffset += 7;
        doc.setFontSize(12);
        doc.setFont(undefined as unknown as string, "bold");
        doc.text("Total:", rightX, yOffset);
        doc.text(`₹${invoice.final_amount.toLocaleString()}`, 190, yOffset, { align: "right" });
        
        yOffset += 7;
        doc.setFontSize(10);
        doc.setFont(undefined as unknown as string, "normal");
        doc.setTextColor(34, 139, 34);
        doc.text("Paid:", rightX, yOffset);
        doc.text(`₹${invoice.paid_amount.toLocaleString()}`, 190, yOffset, { align: "right" });
        
        if (invoice.final_amount - invoice.paid_amount > 0) {
          yOffset += 7;
          doc.setTextColor(255, 140, 0);
          doc.text("Outstanding:", rightX, yOffset);
          doc.text(`₹${(invoice.final_amount - invoice.paid_amount).toLocaleString()}`, 190, yOffset, { align: "right" });
        }
        
        doc.setTextColor(0, 0, 0);
      }

      // Save the PDF
      const fileName = invoicesToDownload.length === 1 
        ? `Invoice_${invoicesToDownload[0].invoice_number}.pdf`
        : `Invoices_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`;
      
      doc.save(fileName);
      toast.success(`${invoicesToDownload.length} invoice(s) downloaded successfully`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate invoice PDF");
    }
  };

  const handleDownloadSelected = () => {
    const selectedInvoices = invoices.filter(inv => selectedInvoiceIds.has(inv.id));
    generateInvoicePDF(selectedInvoices);
  };

  const handleDownloadSingle = (invoice: Invoice) => {
    generateInvoicePDF([invoice]);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
      case "partial":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
      case "pending":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "cash": return "Cash";
      case "upi": return "UPI";
      case "card": return "Card";
      case "bank_transfer": return "Bank Transfer";
      case "online": return "Online";
      default: return method;
    }
  };

  // Stats - calculate with proper null handling
  const totalBilled = invoices.reduce((sum, inv) => {
    const finalAmount = Number(inv.final_amount) || 0;
    return sum + finalAmount;
  }, 0);
  
  const totalPaid = invoices.reduce((sum, inv) => {
    const paidAmount = Number(inv.paid_amount) || 0;
    return sum + paidAmount;
  }, 0);
  
  const totalPending = Math.max(0, totalBilled - totalPaid);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Billed</p>
                <p className="text-2xl font-bold text-foreground">₹{totalBilled.toLocaleString()}</p>
              </div>
              <Receipt className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold text-foreground">₹{totalPaid.toLocaleString()}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-emerald-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-bold text-foreground">₹{totalPending.toLocaleString()}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Your Invoices
              </CardTitle>
              <CardDescription>View and download your lab bills</CardDescription>
            </div>
            {invoices.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {selectedInvoiceIds.size > 0 && (
                  <Badge variant="secondary">
                    {selectedInvoiceIds.size} selected
                  </Badge>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={selectedInvoiceIds.size === invoices.length ? clearSelection : selectAllInvoices}
                >
                  {selectedInvoiceIds.size === invoices.length ? "Deselect All" : "Select All"}
                </Button>
                {selectedInvoiceIds.size > 0 && (
                  <Button 
                    size="sm"
                    onClick={handleDownloadSelected}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download ({selectedInvoiceIds.size})
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No Invoices</h3>
              <p className="text-muted-foreground">Your billing history will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedInvoiceIds.size === invoices.length && invoices.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          selectAllInvoices();
                        } else {
                          clearSelection();
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/30">
                    <TableCell>
                      <Checkbox
                        checked={selectedInvoiceIds.has(invoice.id)}
                        onCheckedChange={() => toggleInvoiceSelection(invoice.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell className="text-right font-medium">₹{invoice.final_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{invoice.paid_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{getStatusBadge(invoice.payment_status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(invoice.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {invoice.payment_status !== "paid" && (invoice.final_amount - invoice.paid_amount) > 0 && (
                          <>
                            <RazorpayButton
                              invoiceId={invoice.id}
                              invoiceNumber={invoice.invoice_number}
                              amount={invoice.final_amount - invoice.paid_amount}
                              patientName={patientName}
                              patientPhone={patientPhone}
                              onPaymentSuccess={() => {
                                fetchInvoices();
                                onPaymentStatusChange?.();
                              }}
                              variant="default"
                              size="sm"
                              className="gap-1"
                            />
                          </>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDownloadSingle(invoice)}
                          className="h-8 w-8 p-0"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openInvoiceDetails(invoice)}
                        >
                          View
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invoice Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Invoice {selectedInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">
                  {format(new Date(selectedInvoice.created_at), "dd MMMM yyyy")}
                </p>
                {getStatusBadge(selectedInvoice.payment_status)}
              </div>

              {/* Items */}
              <div className="space-y-2">
                <h4 className="font-semibold">Items</h4>
                <div className="border rounded-lg divide-y">
                  {invoiceItems.map((item) => (
                    <div key={item.id} className="p-3 flex justify-between">
                      <span>{item.test_name}</span>
                      <span className="font-medium">₹{item.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₹{selectedInvoice.total_amount.toLocaleString()}</span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-₹{selectedInvoice.discount_amount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>₹{selectedInvoice.final_amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Paid</span>
                  <span>₹{selectedInvoice.paid_amount.toLocaleString()}</span>
                </div>
                {selectedInvoice.final_amount - selectedInvoice.paid_amount > 0 && (
                  <div className="flex justify-between text-amber-600 font-medium border-t pt-2">
                    <span>Outstanding</span>
                    <span>₹{(selectedInvoice.final_amount - selectedInvoice.paid_amount).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Payments */}
              {payments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold">Payment History</h4>
                  <div className="border rounded-lg divide-y">
                    {payments.map((payment) => (
                      <div key={payment.id} className="p-3 flex justify-between items-center">
                        <div>
                          <p className="font-medium">₹{payment.amount.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {getPaymentMethodLabel(payment.payment_method)} • {format(new Date(payment.payment_date), "dd MMM yyyy")}
                          </p>
                        </div>
                        {payment.transaction_id && (
                          <span className="text-xs font-mono text-muted-foreground">{payment.transaction_id}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Download Button */}
              <Button 
                className="w-full gap-2"
                onClick={() => handleDownloadSingle(selectedInvoice)}
              >
                <Download className="h-4 w-4" />
                Download Invoice PDF
              </Button>

              {/* Outstanding Payment Notice */}
              {selectedInvoice.payment_status !== "paid" && (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-3">
                      <IndianRupee className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-amber-900 dark:text-amber-100">Payment Pending</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          Pay online securely or visit the lab to complete your payment.
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Razorpay Payment Button */}
                  <RazorpayButton
                    invoiceId={selectedInvoice.id}
                    invoiceNumber={selectedInvoice.invoice_number}
                    amount={selectedInvoice.final_amount - selectedInvoice.paid_amount}
                    patientName={patientName}
                    patientPhone={patientPhone}
                    onPaymentSuccess={() => {
                      fetchInvoices();
                      fetchInvoiceDetails(selectedInvoice.id);
                      onPaymentStatusChange?.();
                    }}
                    className="w-full"
                    variant="default"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BillingPortal;
