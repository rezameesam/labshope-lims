import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

type InvalidTenantPageProps = {
  hostname?: string | null;
};

const InvalidTenantPage = ({ hostname }: InvalidTenantPageProps) => {
  return (
    <div className="min-h-screen bg-subtle-gradient flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl rounded-[32px] border border-border bg-card p-8 shadow-xl md:p-10">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div className="mt-6 space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Tenant Not Found
          </p>
          <h1 className="font-heading text-3xl font-bold text-foreground md:text-4xl">
            This lab workspace does not exist.
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            The hostname you opened does not match any configured laboratory tenant. Ask the lab team for the correct
            website link or return to the main product site.
          </p>
          {hostname ? (
            <div className="rounded-2xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Opened host: <span className="font-medium text-foreground">{hostname}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-muted/20 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <Search className="h-4 w-4" />
              <span className="font-medium">Need the right lab URL?</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Use the exact subdomain or custom domain shared by the lab administrator.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-muted/20 p-5">
            <div className="flex items-center gap-2 text-foreground">
              <ArrowRight className="h-4 w-4" />
              <span className="font-medium">Want the product site instead?</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The root domain is the software homepage. Only real tenant hosts should show lab login or booking pages.
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
