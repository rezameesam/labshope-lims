import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PayUButtonProps {
  invoiceId?: string;
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

export const PayUButton = ({
  invoiceId,
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
}: PayUButtonProps) => {
  const [processing, setProcessing] = useState(false);
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const submitPayUForm = (actionUrl: string, fields: Record<string, string>) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = actionUrl;
    form.target = "_blank";
    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  };

  const handlePayment = async () => {
    const isBulkPayment = Array.isArray(invoices) && invoices.length > 0;
    if (!isBulkPayment && !invoiceId) {
      toast.error("Missing invoice details.");
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

      const { data, error } = await supabase.functions.invoke("create-payu-order", {
        body: {
          invoice_id: invoiceId,
          invoice_ids: isBulkPayment ? invoices?.map((inv) => inv.id) : undefined,
          amount,
          patient_name: patientName,
          patient_email: patientEmail,
          patient_phone: patientPhone,
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error || !data?.action_url || !data?.fields || !data?.transaction_id) {
        throw new Error(data?.error || (error as any)?.message || "Failed to create PayU order");
      }

      submitPayUForm(data.action_url, data.fields);

      let retries = 24;
      while (retries > 0) {
        await wait(5000);
        const { data: statusData, error: statusError } = await supabase.functions.invoke("confirm-payu-payment", {
          body: {
            invoice_id: invoiceId,
            bulk_invoices: isBulkPayment ? (invoices || []).map((inv) => ({ invoice_id: inv.id, amount: inv.amount })) : undefined,
            transaction_id: data.transaction_id,
          },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!statusError && statusData?.success) {
          toast.success("Payment successful!");
          onPaymentSuccess?.();
          setProcessing(false);
          return;
        }
        retries -= 1;
      }

      toast("Payment is pending confirmation. Please refresh billing after a minute.");
    } catch (error: any) {
      console.error("PayU payment error:", error);
      toast.error(error.message || "Failed to initiate PayU payment");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Button onClick={handlePayment} disabled={processing || amount <= 0} className={className} variant={variant} size={size}>
      {processing ? (
        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
      ) : (
        <><CreditCard className="mr-2 h-4 w-4" />{label ?? `Pay via PayU (₹${amount.toLocaleString()})`}</>
      )}
    </Button>
  );
};