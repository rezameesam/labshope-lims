import { Helmet } from "react-helmet-async";
import { formatAppDate } from "@/lib/date";

const RefundPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Refund Policy | LabShope LIMS</title>
      </Helmet>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl font-heading font-bold text-foreground mb-2">Refund Policy</h1>
        <p className="text-sm text-muted-foreground mb-6">Last updated: {formatAppDate(new Date())}</p>

        <div className="space-y-6 text-sm text-foreground">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">General policy</h2>
            <p>
              Payments made for completed diagnostic services are generally non-refundable.
              If a service cannot be delivered for operational reasons, a refund or adjustment may be offered.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Duplicate or failed transactions</h2>
            <p>
              If your account is charged more than once for the same invoice, or money is debited without successful confirmation,
              we will review and process correction/refund after verification.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Request window</h2>
            <p>
              Please raise refund requests within 7 days of payment with invoice number, transaction reference,
              and patient details.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Processing timeline</h2>
            <p>
              Approved refunds are typically processed in 5–10 business days to the original payment method,
              subject to bank/payment gateway timelines.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Contact</h2>
            <p>
              For refund-related queries, contact
              <span className="ml-1 font-medium">info@labshope.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default RefundPolicy;
