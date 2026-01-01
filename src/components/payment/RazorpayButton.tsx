import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { initiateRazorpayPayment } from "@/services/razorpayService";

interface RazorpayButtonProps {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  onPaymentSuccess?: () => void;
  className?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export const RazorpayButton = ({
  invoiceId,
  invoiceNumber,
  amount,
  patientName,
  patientEmail,
  patientPhone,
  onPaymentSuccess,
  className,
  variant = "default",
  size = "default",
}: RazorpayButtonProps) => {
  const [processing, setProcessing] = useState(false);

  const handlePayment = async () => {
    if (amount <= 0) {
      toast.error("Invalid payment amount");
      return;
    }

    setProcessing(true);

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login to make a payment");
        setProcessing(false);
        return;
      }

      // Create Razorpay order via Edge Function
      const { data: orderData, error: orderError } = await supabase.functions.invoke(
        "create-razorpay-order",
        {
          body: {
            invoice_id: invoiceId,
            amount: amount,
            invoice_number: invoiceNumber,
            patient_name: patientName,
            patient_email: patientEmail,
            patient_phone: patientPhone,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      if (orderError || !orderData?.order_id) {
        throw new Error(orderData?.error || "Failed to create payment order");
      }

      // Initiate Razorpay payment
      await initiateRazorpayPayment(
        orderData.order_id,
        amount,
        invoiceNumber,
        patientName,
        patientEmail,
        patientPhone,
        async (response) => {
          // Payment successful
          try {
            // Verify payment with backend
            const { error: verifyError } = await supabase.functions.invoke(
              "razorpay-webhook",
              {
                body: {
                  event: "payment.captured",
                  payload: {
                    payment: {
                      entity: {
                        id: response.razorpay_payment_id,
                        order_id: response.razorpay_order_id,
                        amount: Math.round(amount * 100), // In paise
                        status: "captured",
                        notes: {
                          invoice_id: invoiceId,
                          invoice_number: invoiceNumber,
                        },
                      },
                    },
                  },
                },
              }
            );

            if (verifyError) {
              console.error("Payment verification error:", verifyError);
              // Still show success as Razorpay payment was successful
              // Webhook will handle the update
            }

            toast.success("Payment successful! Your invoice will be updated shortly.");
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
          Pay Online (₹{amount.toLocaleString()})
        </>
      )}
    </Button>
  );
};

