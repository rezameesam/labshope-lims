import { describe, expect, it, vi } from "vitest";
import {
  DOWNLOAD_PLATFORMS,
  buildDownloadUrl,
  detectFamily,
  detectPlatform,
  fetchDownloadManifest,
  formatSize,
  getDownloadsBaseUrl,
} from "../downloads";

const win64 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const win32 = "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 Chrome/109.0 Safari/537.36";
const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const ubuntu = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";
const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";

describe("downloads", () => {
  it("only accepts a real http(s) base address and drops trailing slashes", () => {
    expect(getDownloadsBaseUrl("https://downloads.example.com///")).toBe("https://downloads.example.com");
    expect(getDownloadsBaseUrl("  ")).toBe("https://lims-downloads.labshope.com"); // not set: the default address
    expect(getDownloadsBaseUrl(undefined)).toBe("https://lims-downloads.labshope.com");
    expect(getDownloadsBaseUrl("off")).toBe(""); // anything that is not an http(s) address hides the downloads
    expect(getDownloadsBaseUrl("javascript:alert(1)")).toBe("");
  });

  it("builds the fixed latest/ address for each platform, or the file named in the list", () => {
    const linux = DOWNLOAD_PLATFORMS.find((p) => p.id === "linux")!;
    expect(buildDownloadUrl("https://d.example.com", linux)).toBe("https://d.example.com/latest/LabShope-LIMS-linux.AppImage");
    expect(buildDownloadUrl("", linux)).toBe("");
    const manifest = { version: "1.2.3", files: { linux: { file: "Custom Name.AppImage" } } };
    expect(buildDownloadUrl("https://d.example.com", linux, manifest)).toBe("https://d.example.com/latest/Custom%20Name.AppImage");
  });

  it("recognises the visitor's computer and never guesses for phones", () => {
    expect(detectFamily(win64)).toBe("windows");
    expect(detectFamily(mac)).toBe("mac");
    expect(detectFamily(ubuntu)).toBe("linux");
    expect(detectFamily(android)).toBeNull();
    expect(detectPlatform(win64)).toBe("windows-64bit");
    expect(detectPlatform(win32)).toBe("windows-32bit");
    expect(detectPlatform(ubuntu)).toBe("linux");
    expect(detectPlatform(mac)).toBeNull(); // Apple Silicon and Intel look the same to a website
  });

  it("formats sizes for people", () => {
    expect(formatSize(undefined)).toBe("");
    expect(formatSize(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatSize(87 * 1024 * 1024)).toBe("87 MB");
  });

  it("reads the list and treats any problem as no list", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "1.0.0", files: { linux: { file: "a.AppImage", size: 10 } } }) });
    expect(await fetchDownloadManifest("https://d.example.com", ok as unknown as typeof fetch)).toEqual({
      version: "1.0.0",
      published: undefined,
      files: { linux: { file: "a.AppImage", size: 10 } },
    });
    expect(ok).toHaveBeenCalledWith("https://d.example.com/latest/latest.json", { cache: "no-cache" });

    const missing = vi.fn().mockResolvedValue({ ok: false });
    expect(await fetchDownloadManifest("https://d.example.com", missing as unknown as typeof fetch)).toBeNull();
    const broken = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: true }) });
    expect(await fetchDownloadManifest("https://d.example.com", broken as unknown as typeof fetch)).toBeNull();
    const offline = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await fetchDownloadManifest("https://d.example.com", offline as unknown as typeof fetch)).toBeNull();
    expect(await fetchDownloadManifest("", ok as unknown as typeof fetch)).toBeNull();
  });
});
