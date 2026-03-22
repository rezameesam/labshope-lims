import { Receipt, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatAppDate } from "@/lib/date";
import { toast } from "sonner";

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
}

interface PatientTest {
  id: string;
  test_name: string;
  test_date: string;
  status: string;
  test_id: string | null;
  test?: {
    price: number | null;
  } | null;
  invoice_status?: "not_invoiced" | "unpaid" | "paid";
  invoice_number?: string;
}

interface BillingFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  filteredPatients: Patient[];
  selectedPatientId: string;
  onPatientSelect: (id: string) => void;
  patientSearchOpen: boolean;
  onPatientSearchOpenChange: (open: boolean) => void;
  patientSearchQuery: string;
  onPatientSearchQueryChange: (query: string) => void;
  selectedPatient: Patient | undefined;
  patientTests: PatientTest[];
  selectedTestIds: Set<string>;
  onTestSelectionChange: (testIds: Set<string>) => void;
  getTestPrice: (testId: string) => number;
  updateTestPrice: (testId: string, price: number) => void;
  calculateTotal: () => number;
  clampDiscount: (value: number, total: number) => number;
  discount: number;
  onDiscountChange: (value: number) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
}

const BillingFormDialog = ({
  isOpen,
  onOpenChange,
  filteredPatients,
  selectedPatientId,
  onPatientSelect,
  patientSearchOpen,
  onPatientSearchOpenChange,
  patientSearchQuery,
  onPatientSearchQueryChange,
  selectedPatient,
  patientTests,
  selectedTestIds,
  onTestSelectionChange,
  getTestPrice,
  updateTestPrice,
  calculateTotal,
  clampDiscount,
  discount,
  onDiscountChange,
  notes,
  onNotesChange,
  isSubmitting,
  onSubmit,
}: BillingFormDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Create New Invoice
          </DialogTitle>
          <DialogDescription>
            Select a patient, choose billable tests, adjust pricing if needed, and create a new invoice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          <div className="space-y-2">
            <p className="text-sm font-medium leading-none">Select Patient</p>
            <Popover open={patientSearchOpen} onOpenChange={onPatientSearchOpenChange}>
              <PopoverTrigger asChild>
                <Button
                  id="invoice-patient-select"
                  variant="outline"
                  role="combobox"
                  aria-expanded={patientSearchOpen}
                  className="w-full justify-between"
                >
                  {selectedPatient
                    ? `${selectedPatient.full_name} (${selectedPatient.patient_id})`
                    : "Choose a patient..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput
                    name="invoice_patient_search"
                    aria-label="Search patient"
                    placeholder="Search by name, ID, or phone..."
                    value={patientSearchQuery}
                    onValueChange={onPatientSearchQueryChange}
                    autoComplete="off"
                  />
                  <CommandList>
                    <CommandEmpty>No patient found.</CommandEmpty>
                    <CommandGroup>
                      {filteredPatients.map((patient) => (
                        <CommandItem
                          key={patient.id}
                          value={patient.id}
                          onSelect={() => {
                            onPatientSelect(patient.id);
                            onPatientSearchOpenChange(false);
                            onPatientSearchQueryChange("");
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{patient.full_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {patient.patient_id} • {patient.phone}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedPatientId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium leading-none">Select Tests to Invoice</p>
                {patientTests.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    {patientTests.filter(t => t.invoice_status !== "paid").length} available •{" "}
                    {patientTests.filter(t => t.invoice_status === "paid").length} already paid
                  </div>
                )}
              </div>
              <div className="border rounded-lg max-h-48 overflow-y-auto">
                {patientTests.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">No tests found for this patient</p>
                ) : (
                  patientTests.map((test) => {
                    const isPaidInvoiced = test.invoice_status === "paid";
                    const isUnpaidInvoiced = test.invoice_status === "unpaid";

                    return (
                      <div
                        key={test.id}
                        className={`flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50 ${
                          isPaidInvoiced ? "opacity-60 bg-muted/30" : ""
                        }`}
                      >
                        <Checkbox
                          checked={selectedTestIds.has(test.id)}
                          onCheckedChange={(checked) => {
                            if (isPaidInvoiced) {
                              toast.error(`This test is already invoiced and paid (Invoice: ${test.invoice_number}). Cannot create duplicate invoice.`);
                              return;
                            }
                            const newSet = new Set(selectedTestIds);
                            if (checked) {
                              newSet.add(test.id);
                            } else {
                              newSet.delete(test.id);
                            }
                            onTestSelectionChange(newSet);
                          }}
                          disabled={isPaidInvoiced}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{test.test_name}</p>
                            {isPaidInvoiced && (
                              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                Paid (INV: {test.invoice_number})
                              </Badge>
                            )}
                            {isUnpaidInvoiced && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                Unpaid Invoice ({test.invoice_number})
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatAppDate(test.test_date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">₹</span>
                          <Label htmlFor={`invoice-test-price-${test.id}`} className="sr-only">
                            Price for {test.test_name}
                          </Label>
                          <Input
                            id={`invoice-test-price-${test.id}`}
                            name={`invoice_test_price_${test.id}`}
                            type="number"
                            value={getTestPrice(test.id)}
                            onChange={(e) => updateTestPrice(test.id, Number(e.target.value))}
                            className="w-24 h-8 text-right"
                            min={0}
                            disabled={isPaidInvoiced}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice-subtotal">Subtotal</Label>
              <Input id="invoice-subtotal" name="invoice_subtotal" value={`₹${calculateTotal().toLocaleString()}`} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoice-discount">Discount</Label>
              <Input
                id="invoice-discount"
                name="invoice_discount"
                type="number"
                value={discount}
                onChange={(e) => onDiscountChange(Number(e.target.value) || 0)}
                placeholder="0"
                min={0}
                max={calculateTotal()}
              />
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total Amount</span>
              <span className="text-2xl font-bold">
                ₹{(calculateTotal() - clampDiscount(discount, calculateTotal())).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-notes">Notes (optional)</Label>
            <Textarea
              id="invoice-notes"
              name="invoice_notes"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Any additional notes..."
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="clinical"
            onClick={onSubmit}
            disabled={isSubmitting || selectedTestIds.size === 0}
          >
            {isSubmitting ? "Creating..." : "Create Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillingFormDialog;
