import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/platform/PlatformSiteHeader", () => ({ default: () => <div /> }));
vi.mock("@/components/platform/PlatformSiteFooter", () => ({ default: () => <div /> }));

const renderPage = async () => {
  const { default: Page } = await import("../PlatformDownloadPage");
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <Page />
      </MemoryRouter>
    </HelmetProvider>,
  );
};

describe("PlatformDownloadPage", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
      configurable: true,
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("says downloads are being prepared when no download address is set", async () => {
    vi.stubEnv("VITE_DOWNLOADS_BASE_URL", "");
    await renderPage();
    expect(screen.getByTestId("download-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("download-linux")).not.toBeInTheDocument();
  });

  it("offers every platform with fixed links, the visitor's own computer first, and shows the version from the list", async () => {
    vi.stubEnv("VITE_DOWNLOADS_BASE_URL", "https://downloads.example.com/");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: "1.4.0", files: { linux: { file: "LabShope-LIMS-linux.AppImage", size: 90 * 1024 * 1024 } } }),
      }),
    );
    await renderPage();

    const cards = screen.getAllByTestId(/^download-(windows|mac|linux)/);
    expect(cards).toHaveLength(5);
    expect(cards[0]).toHaveAttribute("data-testid", "download-linux"); // this visitor is on Ubuntu
    expect(screen.getByText("For this computer")).toBeInTheDocument();
    const links = Array.from(document.querySelectorAll("a[download]")).map((a) => a.getAttribute("href"));
    expect(links).toContain("https://downloads.example.com/latest/LabShope-LIMS-windows-64bit.exe");
    expect(links).toContain("https://downloads.example.com/latest/LabShope-LIMS-mac-apple-silicon.pkg");
    await waitFor(() => expect(screen.getByTestId("download-version")).toHaveTextContent("Current version 1.4.0"));
    expect(screen.getByText(/Download \(90 MB\)/)).toBeInTheDocument();
  });
});
