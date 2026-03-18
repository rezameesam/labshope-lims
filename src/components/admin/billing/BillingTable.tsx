import { Eye, CreditCard, Edit2, CheckCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataPagination } from "@/components/ui/data-pagination";
import { formatAppDate } from "@/lib/date";
import { AbdmCareContextButton } from "@/components/admin/AbdmCareContextButton";

interface Invoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  total_amount: number;
  discount_amount: number;
  discount_entered_by?: string | null;
  discount_entered_by_name?: string | null;
  tax_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  updated_by?: string | null;
  lab_id?: string | null;
  collection_center_id?: string | null;
  patient?: {
    full_name: string;
    patient_id: string;
    phone: string;
    abha_address?: string | null;
  };
  labs?: {
    id: string;
    name: string;
    lab_code: string;
  } | null;
  collection_centers?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

interface BillingTableProps {
  loading: boolean;
  pagedInvoices: Invoice[];
  filteredInvoices: Invoice[];
  isAdmin: boolean;
  organizationId: string | null;
  linkedInvoiceIds: Set<string>;
  safePage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onOpenPaymentDialog: (invoice: Invoice) => void;
  onOpenEditDialog: (invoice: Invoice) => void;
  onViewDetails: (invoice: Invoice) => void;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "paid":
      return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle className="h-3 w-3 mr-1" />Paid</Badge>;
    case "partial":
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100"><Clock className="h-3 w-3 mr-1" />Partial</Badge>;
    case "pending":
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100"><XCircle className="h-3 w-3 mr-1" />Pending</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const BillingTable = ({
  loading,
  pagedInvoices,
  filteredInvoices,
  isAdmin,
  organizationId,
  linkedInvoiceIds,
  safePage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onOpenPaymentDialog,
  onOpenEditDialog,
  onViewDetails,
}: BillingTableProps) => {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Invoice #</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">Loading...</TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No invoices found
                  </TableCell>
                </TableRow>
              ) : (
                pagedInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{invoice.patient?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{invoice.patient?.patient_id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">₹{invoice.final_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">₹{invoice.paid_amount.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{getStatusBadge(invoice.payment_status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatAppDate(invoice.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {invoice.patient?.abha_address && organizationId && (
                          <AbdmCareContextButton
                            organizationId={organizationId}
                            patientId={invoice.patient_id}
                            invoiceId={invoice.id}
                            careContextReference={invoice.invoice_number || invoice.id}
                            careContextDisplay={`Invoice ${invoice.invoice_number} — ${invoice.patient?.full_name}`}
                            abhaAddress={invoice.patient?.abha_address ?? null}
                            initialLinked={linkedInvoiceIds.has(invoice.id)}
                          />
                        )}
                        {invoice.payment_status !== "paid" && (
                          <Button
                            size="sm"
                            onClick={() => onOpenPaymentDialog(invoice)}
                            className="gap-1"
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Pay
                          </Button>
                        )}
                        {(isAdmin || invoice.payment_status !== "paid") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenEditDialog(invoice)}
                            title={invoice.payment_status === "paid" ? "Edit Invoice (Admin Only)" : "Edit Invoice"}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onViewDetails(invoice)}
                          title="View Details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <DataPagination
          total={filteredInvoices.length}
          page={safePage}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </CardContent>
    </Card>
  );
};

export default BillingTable;
