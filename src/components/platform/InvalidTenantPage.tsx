import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOptionalOrganization } from "@/contexts/OrganizationContext";

type InvalidTenantPageProps = {
  hostname?: string | null;
};

const InvalidTenantPage = ({ hostname }: InvalidTenantPageProps) => {
  const organizationContext = useOptionalOrganization();
  const resolutionError = organizationContext?.resolutionError || null;
  const isConnectivityIssue = Boolean(resolutionError);

  return (
    <div className="min-h-screen bg-subtle-gradient flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl rounded-[32px] border border-border bg-card p-8 shadow-xl md:p-10">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {isConnectivityIssue ? "Tenant Lookup Failed" : "Tenant Not Found"}
          </p>
          <h1 className="font-heading text-3xl font-bold text-foreground md:text-4xl">
            {isConnectivityIssue
              ? "This device could not reach the lab workspace backend."
              : "This lab workspace does not exist."}
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            {isConnectivityIssue
              ? "The hostname opened correctly, but tenant resolution failed before the workspace could load. This usually points to a DNS, firewall, VPN, or browser-network issue on the affected device."
              : "The hostname you opened does not match any configured laboratory tenant. Ask the lab team for the correct website link or return to the main product site."}
          </p>
          {hostname ? (
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Opened host: <span className="font-medium text-foreground">{hostname}</span>
            </div>
          ) : null}
          {resolutionError ? (
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Resolution error: <span className="font-medium text-foreground">{resolutionError}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-muted/20 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <Search className="h-4 w-4" />
              <span className="font-medium">
                {isConnectivityIssue ? "What should be checked?" : "Need the right lab URL?"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isConnectivityIssue
                ? "Confirm the affected device can resolve and reach the Supabase/API hostname used by this app."
                : "Use the exact subdomain or custom domain shared by the lab administrator."}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <ArrowRight className="h-4 w-4" />
              <span className="font-medium">
                {isConnectivityIssue ? "Need a quick retry?" : "Want the product site instead?"}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isConnectivityIssue
                ? "Retry after disabling VPN, private DNS, device filtering, or browser security extensions. If other devices work, the tenant record itself is likely fine."
                : "The root domain is the software homepage. Only real tenant hosts should show lab login or booking pages."}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/">Go To Product Homepage</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/book-demo">Book Demo</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default InvalidTenantPage;
