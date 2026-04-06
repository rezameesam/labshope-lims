import { CreditCard, Banknote, IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Invoice {
  id: string;
  invoice_number: string;
  patient_id: string;
  final_amount: number;
  paid_amount: number;
  payment_status: string;
  patient?: {
    full_name: string;
    patient_id: string;
    phone: string;
  };
}

interface BillingPaymentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedInvoice: Invoice | null;
  paymentAmount: number;
  onPaymentAmountChange: (value: number) => void;
  paymentMethod: string;
  onPaymentMethodChange: (value: string) => void;
  transactionId: string;
  onTransactionIdChange: (value: string) => void;
  paymentNotes: string;
  onPaymentNotesChange: (value: string) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
}

const BillingPaymentDialog = ({
  isOpen,
  onOpenChange,
  selectedInvoice,
  paymentAmount,
  onPaymentAmountChange,
  paymentMethod,
  onPaymentMethodChange,
  transactionId,
  onTransactionIdChange,
  paymentNotes,
  onPaymentNotesChange,
  isSubmitting,
  onSubmit,
}: BillingPaymentDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Record Payment
          </DialogTitle>
          <DialogDescription>
            Record a payment against the selected invoice and capture the payment method and reference details.
          </DialogDescription>
        </DialogHeader>

        {selectedInvoice && (
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Invoice #{selectedInvoice.invoice_number}</p>
              <p className="font-medium">{selectedInvoice.patient?.full_name}</p>
              <div className="flex justify-between mt-2">
                <span>Outstanding:</span>
                <span className="font-bold">
                  ₹{(selectedInvoice.final_amount - selectedInvoice.paid_amount).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-amount">Payment Amount</Label>
              <Input
                id="payment-amount"
                name="payment_amount"
                type="number"
                value={paymentAmount}
                onChange={(e) => onPaymentAmountChange(Number(e.target.value))}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium leading-none">Payment Method</p>
              <Select name="payment_method" value={paymentMethod} onValueChange={onPaymentMethodChange}>
                <SelectTrigger id="payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <div className="flex items-center gap-2">
                      <Banknote className="h-4 w-4" /> Cash
                    </div>
                  </SelectItem>
                  <SelectItem value="upi">
                    <div className="flex items-center gap-2">
                      <IndianRupee className="h-4 w-4" /> UPI
                    </div>
                  </SelectItem>
                  <SelectItem value="card">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" /> Card
                    </div>
                  </SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod !== "cash" && (
              <div className="space-y-2">
                <Label htmlFor="transaction-id">Transaction ID</Label>
                <Input
                  id="transaction-id"
                  name="transaction_id"
                  value={transactionId}
                  onChange={(e) => onTransactionIdChange(e.target.value)}
                  placeholder="Enter transaction reference"
                  autoComplete="off"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <Textarea
                id="payment-notes"
                name="payment_notes"
                value={paymentNotes}
                onChange={(e) => onPaymentNotesChange(e.target.value)}
                placeholder="Any payment notes..."
                autoComplete="off"
              />
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          A journal entry will be created automatically in the Finance module.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Recording..." : "Record Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillingPaymentDialog;
