import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Download, MonitorSmartphone, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import PlatformSiteFooter from "@/components/platform/PlatformSiteFooter";
import PlatformSiteHeader from "@/components/platform/PlatformSiteHeader";
import { Button } from "@/components/ui/button";
import { buildPlatformPathWithMarketing } from "@/lib/platformMarketing";
import { getPlatformPageTitle } from "@/lib/platformBranding";
import {
  DOWNLOAD_PLATFORMS,
  buildDownloadUrl,
  detectFamily,
  detectPlatform,
  fetchDownloadManifest,
  formatSize,
  getDownloadsBaseUrl,
  type DownloadManifest,
  type DownloadPlatform,
} from "@/lib/downloads";

const highlights = [
  "Works without internet: register patients, enter results and take payments, and it syncs when the connection returns.",
  "Reads barcode scanners and connects to lab analyzers (ASTM and HL7).",
  "Prints receipts to a thermal printer, plus labels and reports.",
  "Sign in with the same staff email and password you use on the website.",
];

const olderWindows = [
  "Windows 7 and 8 need Service Pack 1 (Windows 7) and these Microsoft updates installed first: the Universal C Runtime (KB2999226) and TLS 1.2 support.",
  "Windows 10 and 11 need nothing extra.",
];

const PlatformDownloadPage = () => {
  const baseUrl = getDownloadsBaseUrl();
  const [manifest, setManifest] = useState<DownloadManifest | null>(null);
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const family = detectFamily(userAgent);
  const best = detectPlatform(userAgent);

  useEffect(() => {
    let cancelled = false;
    void fetchDownloadManifest(baseUrl).then((data) => {
      if (!cancelled) setManifest(data);
    });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  // The visitor's own computer first.
  const platforms = useMemo(() => {
    const mine = (p: DownloadPlatform) => (best ? p.id === best : p.family === family);
    return [...DOWNLOAD_PLATFORMS].sort((a, b) => Number(mine(b)) - Number(mine(a)));
  }, [best, family]);

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{getPlatformPageTitle("Download")}</title>
        <meta
          name="description"
          content="Download LabShope LIMS for Windows, Mac and Ubuntu. Works offline and syncs with your lab's online account."
        />
      </Helmet>

      <PlatformSiteHeader />

      <main>
        <section className="border-b border-border/60 bg-[linear-gradient(180deg,rgba(10,35,66,0.05),transparent)]">
          <div className="container mx-auto px-4 py-16 lg:px-8 lg:py-20">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-clinical-blue">Desktop app</p>
              <h1 className="mt-4 font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                Download LabShope LIMS for your lab computer
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                The desktop app is fast, keeps working when the internet drops, and syncs with your lab's online account.
                Install it on the front desk and bench computers.
              </p>
              {manifest ? (
                <p className="mt-4 text-sm text-muted-foreground" data-testid="download-version">
                  Current version {manifest.version}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="bg-background">
          <div className="container mx-auto px-4 py-12 lg:px-8">
            {!baseUrl ? (
              <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm" data-testid="download-unavailable">
                <MonitorSmartphone className="mx-auto h-8 w-8 text-clinical-blue" />
                <h2 className="mt-4 font-heading text-xl font-semibold text-foreground">Downloads are being prepared</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  The installers will appear here shortly. Meanwhile you can{" "}
                  <Link className="text-primary underline" to={buildPlatformPathWithMarketing("/contact")}>
                    contact us
                  </Link>{" "}
                  and we will send you the right one.
                </p>
              </div>
            ) : (
              <>
                {family === null ? (
                  <p className="mb-6 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    The desktop app installs on a Windows, Mac or Ubuntu computer. Open this page on that computer to download it.
                  </p>
                ) : null}
                {family === "mac" ? (
                  <p className="mb-6 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    Not sure which Mac you have? Open the Apple menu, choose About This Mac, and look at Chip (Apple M1 or newer) or Processor (Intel).
                  </p>
                ) : null}

                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {platforms.map((platform) => {
                    const entry = manifest?.files[platform.id];
                    // Once the list is known, a platform that is not in it has no current installer yet.
                    const available = !manifest || Boolean(entry);
                    const recommended = best ? platform.id === best : platform.family === family;
                    return (
                      <article
                        key={platform.id}
                        className={`flex flex-col rounded-3xl border bg-card p-7 shadow-sm ${recommended ? "border-clinical-blue ring-1 ring-clinical-blue/40" : "border-border"}`}
                        data-testid={`download-${platform.id}`}
                      >
                        {recommended ? (
                          <p className="mb-3 w-fit rounded-full bg-clinical-blue-light px-3 py-1 text-xs font-semibold text-clinical-blue">
                            For this computer
                          </p>
                        ) : null}
                        <h2 className="font-heading text-xl font-semibold text-foreground">{platform.title}</h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{platform.subtitle}</p>
                        {available ? (
                          <>
                            <a href={buildDownloadUrl(baseUrl, platform, manifest)} className="mt-5" download>
                              <Button variant={recommended ? "clinical" : "outline"} className="w-full">
                                <Download className="mr-2 h-4 w-4" />
                                Download{entry?.size ? ` (${formatSize(entry.size)})` : ""}
                              </Button>
                            </a>
                            <ol className="mt-5 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                              {platform.steps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" className="mt-5 w-full" disabled>
                              Coming soon
                            </Button>
                            <p className="mt-5 text-sm text-muted-foreground">
                              This version is not ready yet.{" "}
                              <Link className="text-primary underline" to={buildPlatformPathWithMarketing("/contact")}>
                                Contact us
                              </Link>{" "}
                              if you need it.
                            </p>
                          </>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="border-t border-border/60 bg-background">
          <div className="container mx-auto grid gap-8 px-4 py-12 lg:grid-cols-2 lg:px-8">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
                <WifiOff className="h-5 w-5 text-clinical-blue" /> What you get
              </h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                {highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-heading text-xl font-semibold text-foreground">Older Windows PCs</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                {olderWindows.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted-foreground">
                Need help installing?{" "}
                <Link className="text-primary underline" to={buildPlatformPathWithMarketing("/contact")}>
                  Contact us
                </Link>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <PlatformSiteFooter />
    </div>
  );
};

export default PlatformDownloadPage;
