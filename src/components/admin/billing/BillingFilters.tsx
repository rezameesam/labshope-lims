import { Search, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DateInput } from "@/components/ui/date-input";
import { exportToExcel } from "@/lib/exportToExcel";
import { Plus } from "lucide-react";

interface Invoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  total_amount: number;
  discount_amount: number;
  tax_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
  paid_at: string | null;
  patient?: {
    full_name: string;
    patient_id: string;
    phone: string;
    abha_address?: string | null;
  };
}

interface BillingFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filterStatus: "all" | "pending" | "partial" | "paid";
  onFilterStatusChange: (value: "all" | "pending" | "partial" | "paid") => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  filteredInvoices: Invoice[];
  onCreateInvoice: () => void;
}

const BillingFilters = ({
  search,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  filteredInvoices,
  onCreateInvoice,
}: BillingFiltersProps) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative max-w-sm">
          <Label htmlFor="billing-search" className="sr-only">
            Search invoices
          </Label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="billing-search"
            name="billing_search"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 w-full sm:w-80"
            autoComplete="off"
          />
        </div>
        <Tabs value={filterStatus} onValueChange={(v) => onFilterStatusChange(v as any)} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="partial">Partial</TabsTrigger>
            <TabsTrigger value="paid">Paid</TabsTrigger>
          </TabsList>
        </Tabs>
        <DateInput
          id="billing-date-from"
          value={dateFrom}
          onChange={onDateFromChange}
          placeholder="From date"
          className="w-[150px]"
          showFormatHint
        />
        <DateInput
          id="billing-date-to"
          value={dateTo}
          onChange={onDateToChange}
          placeholder="To date"
          className="w-[150px]"
          showFormatHint
        />
        {(dateFrom || dateTo) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { onDateFromChange(""); onDateToChange(""); }}
            className="text-muted-foreground"
          >
            Clear dates ×
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            exportToExcel("invoices", [
              { key: "invoice_number", label: "Invoice #" },
              { key: "patient_name", label: "Patient" },
              { key: "patient_phone", label: "Phone" },
              { key: "final_amount", label: "Amount (₹)" },
              { key: "paid_amount", label: "Paid (₹)" },
              { key: "balance", label: "Balance (₹)" },
              { key: "payment_status", label: "Status" },
              { key: "payment_method", label: "Payment Method" },
              { key: "created_at", label: "Date" },
            ], filteredInvoices.map(inv => ({
              ...inv,
              patient_name: inv.patient?.full_name ?? "",
              patient_phone: inv.patient?.phone ?? "",
              balance: inv.final_amount - inv.paid_amount,
              created_at: inv.created_at ? new Date(inv.created_at).toLocaleDateString("en-IN") : "",
            })))
          }
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button onClick={onCreateInvoice} className="bg-clinical-navy hover:bg-clinical-navy/90">
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>
    </div>
  );
};

export default BillingFilters;
