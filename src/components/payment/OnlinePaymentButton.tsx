import type { ComponentProps } from "react";
import { RazorpayButton } from "@/components/payment/RazorpayButton";
import { PhonePeButton } from "@/components/payment/PhonePeButton";
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

  if (hasRazorpay && hasPhonePe) {
    return (
      <div className="flex flex-wrap gap-2">
        <RazorpayButton {...props} label={props.label || `Pay via Razorpay (₹${props.amount.toLocaleString()})`} />
        <PhonePeButton {...props} label={props.label || `Pay via PhonePe (₹${props.amount.toLocaleString()})`} variant="outline" />
      </div>
    );
  }

  if (hasPhonePe && !hasRazorpay) {
    return <PhonePeButton {...props} />;
  }

  return <RazorpayButton {...props} />;
};