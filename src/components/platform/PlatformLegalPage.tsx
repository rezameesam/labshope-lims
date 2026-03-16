import { Helmet } from "react-helmet-async";
import { formatAppDate } from "@/lib/date";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { getPlatformPageTitle } from "@/lib/platformBranding";

type LegalSection = {
  title: string;
  body: string;
};

interface PlatformLegalPageProps {
  title: string;
  description: string;
  sections: LegalSection[];
}

const PlatformLegalPage = ({ title, description, sections }: PlatformLegalPageProps) => {
  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{getPlatformPageTitle(title)}</title>
        <meta name="description" content={description} />
      </Helmet>
      <PlatformSiteHeader />
      <main className="container mx-auto max-w-3xl px-4 py-12 lg:px-8">
        <h1 className="font-heading text-3xl font-bold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {formatAppDate(new Date())}</p>
        <p className="mt-6 text-base leading-7 text-muted-foreground">{description}</p>

        <div className="mt-10 space-y-8 text-sm leading-7 text-foreground">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>
      </main>
      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformLegalPage;
