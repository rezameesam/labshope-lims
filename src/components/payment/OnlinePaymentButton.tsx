import type { ComponentProps } from "react";
import { RazorpayButton } from "@/components/payment/RazorpayButton";
import { PhonePeButton } from "@/components/payment/PhonePeButton";
import { useOrganization } from "@/contexts/OrganizationContext";

type OnlinePaymentButtonProps = ComponentProps<typeof RazorpayButton>;

export const OnlinePaymentButton = (props: OnlinePaymentButtonProps) => {
  const { settings } = useOrganization();
  const provider = (settings.payment_provider || "razorpay").toLowerCase();

  if (provider === "phonepe") {
    return <PhonePeButton {...props} />;
  }

  return <RazorpayButton {...props} />;
};