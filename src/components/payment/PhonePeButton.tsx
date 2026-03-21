import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PhonePeButtonProps {
  invoiceId?: string;
  invoiceNumber?: string;
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

export const PhonePeButton = ({
  invoiceId,
  amount,
  patientName,
  patientEmail,
  patientPhone,
  onPaymentSuccess,
  className,
  label,
  variant = "default",
  size = "default",
}: PhonePeButtonProps) => {
  const [processing, setProcessing] = useState(false);

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const handlePayment = async () => {
    if (!invoiceId) {
      toast.error("PhonePe is currently available for single invoice payments.");
      return;
    }

    if (amount <= 0) {
      toast.error("Invalid payment amount");
      return;
    }

    setProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please login to make a payment");
        setProcessing(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-phonepe-order", {
        body: {
          invoice_id: invoiceId,
          amount,
          patient_name: patientName,
          patient_email: patientEmail,
          patient_phone: patientPhone,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error || !data?.checkout_url || !data?.merchant_transaction_id) {
        throw new Error(data?.error || (error as any)?.message || "Failed to create PhonePe order");
      }

      const popup = window.open(data.checkout_url, "_blank", "noopener,noreferrer");
      if (!popup) {
        window.location.href = data.checkout_url;
        return;
      }

      let retries = 24;
      while (retries > 0) {
        await wait(5000);

        const { data: statusData, error: statusError } = await supabase.functions.invoke("confirm-phonepe-payment", {
          body: {
            invoice_id: invoiceId,
            merchant_transaction_id: data.merchant_transaction_id,
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!statusError && statusData?.success) {
          try { popup.close(); } catch {}
          toast.success("Payment successful!");
          onPaymentSuccess?.();
          setProcessing(false);
          return;
        }

        retries -= 1;
      }

      toast("Payment is pending confirmation. Please refresh billing after a minute.");
    } catch (error: any) {
      console.error("PhonePe payment error:", error);
      toast.error(error.message || "Failed to initiate PhonePe payment");
    } finally {
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
          {label ?? `Pay via PhonePe (₹${amount.toLocaleString()})`}
        </>
      )}
    </Button>
  );
};