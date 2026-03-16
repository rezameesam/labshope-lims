import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { initiateRazorpayPayment } from "@/services/razorpayService";
import { useOrganization } from "@/contexts/OrganizationContext";

interface RazorpayButtonProps {
  invoiceId?: string;
  invoiceNumber?: string;
  invoices?: Array<{ id: string; invoice_number: string; amount: number }>;
  amount: number;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  onPaymentSuccess?: () => void;
  className?: string;
  label?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export const RazorpayButton = ({
  invoiceId,
  invoiceNumber,
  invoices,
  amount,
  patientName,
  patientEmail,
  patientPhone,
  onPaymentSuccess,
  className,
  label,
  variant = "default",
  size = "default",
}: RazorpayButtonProps) => {
  const [processing, setProcessing] = useState(false);
  const { branding } = useOrganization();

  const extractOrderErrorMessage = async (error: unknown, fallback?: string) => {
    if (fallback) return fallback;

    if (error && typeof error === "object" && "context" in error) {
      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const errorBody = await context.clone().json();
          if (errorBody && typeof errorBody.error === "string") {
            return errorBody.error;
          }
        } catch {
          // Ignore parse failures and fall through to generic handling.
        }
      }
    }

    if (error && typeof error === "object" && "message" in error && typeof (error as { message?: string }).message === "string") {
      return (error as { message: string }).message;
    }

    return "Failed to create payment order";
  };

  const handlePayment = async () => {
    if (amount <= 0) {
      toast.error("Invalid payment amount");
      return;
    }

    setProcessing(true);

    try {
      const isBulkPayment = Array.isArray(invoices) && invoices.length > 0;
      if (!isBulkPayment && (!invoiceId || !invoiceNumber)) {
        toast.error("Missing invoice details");
        setProcessing(false);
        return;
      }

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login to make a payment");
        setProcessing(false);
        return;
      }

      // Create Razorpay order via Edge Function
      const orderBody = isBulkPayment
        ? {
            invoice_ids: invoices?.map((invoice) => invoice.id),
            amount: amount,
            patient_name: patientName,
            patient_email: patientEmail,
            patient_phone: patientPhone,
          }
        : {
            invoice_id: invoiceId,
            amount: amount,
            invoice_number: invoiceNumber,
            patient_name: patientName,
            patient_email: patientEmail,
            patient_phone: patientPhone,
          };

      const resolvedInvoiceNumber = isBulkPayment
        ? `Bulk Payment (${invoices?.length ?? 0} invoices)`
        : invoiceNumber || "Invoice";

      const { data: orderData, error: orderError } = await supabase.functions.invoke(
        "create-razorpay-order",
        {
          body: orderBody,
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (orderError || !orderData?.order_id || !orderData?.key_id) {
        const message = await extractOrderErrorMessage(orderError, orderData?.error);
        throw new Error(message);
      }

      const orderAmountInRupees =
        typeof orderData.amount === "number" && Number.isFinite(orderData.amount)
          ? orderData.amount / 100
          : amount;

      // Initiate Razorpay payment
      await initiateRazorpayPayment(
        orderData.key_id,
        orderData.order_id,
        orderAmountInRupees,
        resolvedInvoiceNumber,
        branding.displayName,
        patientName,
        patientEmail,
        patientPhone,
        async (response) => {
          // Payment successful
          try {
            // Confirm payment server-side (HMAC signature verification + DB update)
            const confirmBody = isBulkPayment
              ? {
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  bulk_invoices: (invoices || []).map((inv) => ({
                    invoice_id: inv.id,
                    invoice_number: inv.invoice_number,
                    amount: inv.amount,
                  })),
                }
              : {
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature,
                  invoice_id: invoiceId,
                  amount: orderAmountInRupees,
                };

            const { data: confirmData, error: confirmError } = await supabase.functions.invoke(
              "confirm-razorpay-payment",
              {
                body: confirmBody,
                headers: { Authorization: `Bearer ${session.access_token}` },
              }
            );

            if (confirmError || !confirmData?.success) {
              const msg = confirmData?.error || (confirmError as any)?.message || "Payment confirmation failed";
              throw new Error(msg);
            }

            toast.success("Payment successful!");
            if (onPaymentSuccess) {
              onPaymentSuccess();
            }
          } catch (error: any) {
            console.error("Error verifying payment:", error);
            toast.success("Payment successful! Your invoice will be updated shortly.");
            if (onPaymentSuccess) {
              onPaymentSuccess();
            }
          } finally {
            setProcessing(false);
          }
        },
        (error) => {
          // Payment failed or cancelled
          toast.error(error || "Payment failed. Please try again.");
          setProcessing(false);
        }
      );
    } catch (error: any) {
      console.error("Error initiating payment:", error);
      toast.error(error.message || "Failed to initiate payment. Please try again.");
      setProcessing(false);
    }
  };

  return (
    <Button
      onClick={handlePayment}
      disabled={processing || amount <= 0}
      className={className}
      variant={variant}
      size={size}
    >
      {processing ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <CreditCard className="mr-2 h-4 w-4" />
          {label ?? `Pay Online (₹${amount.toLocaleString()})`}
        </>
      )}
    </Button>
  );
};
