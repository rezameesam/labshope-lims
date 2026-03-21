import type { ComponentProps } from "react";
import { RazorpayButton } from "@/components/payment/RazorpayButton";
import { PhonePeButton } from "@/components/payment/PhonePeButton";
import { PayUButton } from "@/components/payment/PayUButton";
import { useOrganization } from "@/contexts/OrganizationContext";

type OnlinePaymentButtonProps = ComponentProps<typeof RazorpayButton>;

export const OnlinePaymentButton = (props: OnlinePaymentButtonProps) => {
  const { settings } = useOrganization();

  // Bulk payments are supported on Razorpay flow only at the moment.
  if (Array.isArray(props.invoices) && props.invoices.length > 0) {
    return <RazorpayButton {...props} />;
  }

  const hasRazorpay = Boolean((settings.razorpay_key_id || "").trim());
  const hasPhonePe = Boolean((settings.phonepe_merchant_id || "").trim());
  const hasPayU = Boolean((settings.payu_key || "").trim());

  const amountLabel = `₹${props.amount.toLocaleString()}`;

  if ([hasRazorpay, hasPhonePe, hasPayU].filter(Boolean).length > 1) {
    return (
      <div className="flex flex-wrap gap-2">
        {hasRazorpay && <RazorpayButton {...props} label={`Pay via Razorpay (${amountLabel})`} />}
        {hasPhonePe && <PhonePeButton {...props} label={`Pay via PhonePe (${amountLabel})`} variant="outline" />}
        {hasPayU && <PayUButton {...props} label={`Pay via PayU (${amountLabel})`} variant="outline" />}
      </div>
    );
  }

  if (hasPhonePe && !hasRazorpay && !hasPayU) {
    return <PhonePeButton {...props} />;
  }

  if (hasPayU && !hasRazorpay && !hasPhonePe) {
    return <PayUButton {...props} />;
  }

  return <RazorpayButton {...props} />;
};