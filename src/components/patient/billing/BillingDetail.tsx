import { Receipt, IndianRupee, Download, CheckCircle, Clock, XCircle } from "lucide-react";
import { OnlinePaymentButton } from "@/components/payment/OnlinePaymentButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatAppDate } from "@/lib/date";

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

interface BillingDetailProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedInvoice: Invoice | null;
  invoiceItems: InvoiceItem[];
  payments: Payment[];
  getOutstandingAmount: (invoice: Invoice) => number;
  getDisplayPaymentStatus: (invoice: Invoice) => string;
  onDownloadSingle: (invoice: Invoice) => void;
  patientName?: string;
  patientPhone?: string;
  onPaymentSuccess: (invoice: Invoice) => void;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "paid":
      return <Badge className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
    case "partial":
      return <Badge className="bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
    case "pending":
      return <Badge className="bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20"><XCircle className="h-3 w-3 mr-1" />Pending</Badge>;
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

export const BillingDetail = ({
  isOpen,
  onOpenChange,
  selectedInvoice,
  invoiceItems,
  payments,
  getOutstandingAmount,
  getDisplayPaymentStatus,
  onDownloadSingle,
  patientName,
  patientPhone,
  onPaymentSuccess,
}: BillingDetailProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Invoice {selectedInvoice?.invoice_number}
          </DialogTitle>
          <DialogDescription>
            Review invoice items, payments, and download a copy.
          </DialogDescription>
        </DialogHeader>

        {selectedInvoice && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                {formatAppDate(selectedInvoice.created_at)}
              </p>
              {getStatusBadge(getDisplayPaymentStatus(selectedInvoice))}
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
                <div className="flex justify-between text-green-600 dark:text-green-400">
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
              {getOutstandingAmount(selectedInvoice) > 0 && (
                <div className="flex justify-between text-amber-600 dark:text-amber-400 font-medium border-t pt-2">
                  <span>Outstanding</span>
                  <span>₹{getOutstandingAmount(selectedInvoice).toLocaleString()}</span>
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
                          {getPaymentMethodLabel(payment.payment_method)} • {formatAppDate(payment.payment_date)}
                        </p>
                      </div>
                      {payment.transaction_id && (
                        <div className="text-right text-xs font-mono text-muted-foreground">
                          <div>Txn: {payment.transaction_id}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Download Button */}
            <Button
              className="w-full gap-2"
              onClick={() => onDownloadSingle(selectedInvoice)}
            >
              <Download className="h-4 w-4" />
              Download Invoice PDF
            </Button>

            {/* Outstanding Payment Notice */}
            {getOutstandingAmount(selectedInvoice) > 0 && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <IndianRupee className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-900 dark:text-amber-100">Payment Pending</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        Pay online securely or visit the lab to complete your payment.
                      </p>
                    </div>
                  </div>
                </div>

                <OnlinePaymentButton
                  invoiceId={selectedInvoice.id}
                  invoiceNumber={selectedInvoice.invoice_number}
                  amount={getOutstandingAmount(selectedInvoice)}
                  patientName={patientName}
                  patientPhone={patientPhone}
                  onPaymentSuccess={async () => {
                    onPaymentSuccess(selectedInvoice);
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
  );
};
