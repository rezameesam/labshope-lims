import { Receipt, FileText, Download, CheckCircle, Clock, XCircle } from "lucide-react";
import { OnlinePaymentButton } from "@/components/payment/OnlinePaymentButton";
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

interface BillingHistoryProps {
  invoices: Invoice[];
  selectedInvoiceIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenDetails: (invoice: Invoice) => void;
  onDownloadSingle: (invoice: Invoice) => void;
  onDownloadSelected: () => void;
  getOutstandingAmount: (invoice: Invoice) => number;
  getDisplayPaymentStatus: (invoice: Invoice) => string;
  patientName?: string;
  patientPhone?: string;
  onPaymentSuccess: (invoice: Invoice) => void;
  onBulkPaymentSuccess: (totalOutstanding: number) => void;
}

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

export const BillingHistory = ({
  invoices,
  selectedInvoiceIds,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onOpenDetails,
  onDownloadSingle,
  onDownloadSelected,
  getOutstandingAmount,
  getDisplayPaymentStatus,
  patientName,
  patientPhone,
  onPaymentSuccess,
  onBulkPaymentSuccess,
}: BillingHistoryProps) => {
  const unpaidInvoices = invoices.filter((inv) => getOutstandingAmount(inv) > 0);
  const totalOutstanding = unpaidInvoices.reduce((sum, inv) => sum + getOutstandingAmount(inv), 0);

  return (
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
              {unpaidInvoices.length > 0 && (
                <OnlinePaymentButton
                  amount={totalOutstanding}
                  invoices={unpaidInvoices.map((inv) => ({
                    id: inv.id,
                    invoice_number: inv.invoice_number,
                    amount: getOutstandingAmount(inv),
                  }))}
                  patientName={patientName}
                  patientPhone={patientPhone}
                  onPaymentSuccess={async () => {
                    onBulkPaymentSuccess(totalOutstanding);
                  }}
                  label={`Pay All Outstanding (₹${totalOutstanding.toLocaleString()})`}
                  size="sm"
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={selectedInvoiceIds.size === invoices.length ? onClearSelection : onSelectAll}
              >
                {selectedInvoiceIds.size === invoices.length ? "Deselect All" : "Select All"}
              </Button>
              {selectedInvoiceIds.size > 0 && (
                <Button
                  size="sm"
                  onClick={onDownloadSelected}
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
                        onSelectAll();
                      } else {
                        onClearSelection();
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
                      onCheckedChange={() => onToggleSelection(invoice.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                  <TableCell className="text-right font-medium">₹{invoice.final_amount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">₹{invoice.paid_amount.toLocaleString()}</TableCell>
                  <TableCell className="text-center">{getStatusBadge(getDisplayPaymentStatus(invoice))}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatAppDate(invoice.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {getOutstandingAmount(invoice) > 0 && (
                        <OnlinePaymentButton
                          invoiceId={invoice.id}
                          invoiceNumber={invoice.invoice_number}
                          amount={getOutstandingAmount(invoice)}
                          patientName={patientName}
                          patientPhone={patientPhone}
                          onPaymentSuccess={async () => {
                            onPaymentSuccess(invoice);
                          }}
                          variant="default"
                          size="sm"
                          className="gap-1"
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownloadSingle(invoice)}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOpenDetails(invoice)}
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
  );
};
