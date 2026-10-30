/**
 * The desktop app downloads. Installers are published to a Cloudflare R2 bucket by the "Native Release" workflow under
 * `latest/` with fixed names, plus a small `latest/latest.json` that lists the version, size and file of each one.
 * The base address of that bucket's public domain comes from VITE_DOWNLOADS_BASE_URL.
 */

export type DownloadPlatformId =
  | "windows-64bit"
  | "windows-32bit"
  | "mac-apple-silicon"
  | "mac-intel"
  | "linux";

export type DownloadFamily = "windows" | "mac" | "linux";

export interface DownloadPlatform {
  id: DownloadPlatformId;
  family: DownloadFamily;
  title: string;
  subtitle: string;
  /** The extension of the installer file, used when the list could not be read. */
  extension: string;
  steps: string[];
}

export const DOWNLOAD_PLATFORMS: DownloadPlatform[] = [
  {
    id: "windows-64bit",
    family: "windows",
    title: "Windows (64-bit)",
    subtitle: "Windows 8.1, 10 and 11 on most PCs. Windows 7 and 8 need the updates listed below.",
    extension: "exe",
    steps: [
      "Run the downloaded file.",
      "If Windows says it protected your PC, choose More info, then Run anyway (the installer is not code-signed yet).",
      "LabShope LIMS opens when the installation finishes.",
    ],
  },
  {
    id: "windows-32bit",
    family: "windows",
    title: "Windows (32-bit)",
    subtitle: "Older 32-bit PCs running Windows 7, 8, 10 or 11.",
    extension: "exe",
    steps: [
      "Run the downloaded file.",
      "If Windows says it protected your PC, choose More info, then Run anyway (the installer is not code-signed yet).",
      "LabShope LIMS opens when the installation finishes.",
    ],
  },
  {
    id: "mac-apple-silicon",
    family: "mac",
    title: "Mac (Apple Silicon)",
    subtitle: "Macs with an M1, M2, M3 or newer chip.",
    extension: "pkg",
    steps: [
      "Open the downloaded .pkg file. If macOS blocks it, Control-click the file and choose Open.",
      "Follow the installer, then open LabShope LIMS from Applications.",
    ],
  },
  {
    id: "mac-intel",
    family: "mac",
    title: "Mac (Intel)",
    subtitle: "Macs made before late 2020 with an Intel processor.",
    extension: "pkg",
    steps: [
      "Open the downloaded .pkg file. If macOS blocks it, Control-click the file and choose Open.",
      "Follow the installer, then open LabShope LIMS from Applications.",
    ],
  },
  {
    id: "linux",
    family: "linux",
    title: "Ubuntu / Linux (64-bit)",
    subtitle: "Ubuntu 20.04 and newer, and most other Linux desktops.",
    extension: "AppImage",
    steps: [
      "Make the file runnable: right-click it, Properties, Permissions, Allow executing as a program (or run chmod +x on it).",
      "Double-click it to start LabShope LIMS.",
    ],
  },
];

export interface DownloadManifest {
  version: string;
  published?: string;
  files: Partial<Record<DownloadPlatformId, { file: string; size?: number }>>;
}

/** The public address of the download bucket without a trailing slash, or "" when it is not configured. */
export const getDownloadsBaseUrl = (value: string | undefined = import.meta.env.VITE_DOWNLOADS_BASE_URL): string => {
  const trimmed = (value ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
};

/** The fixed address of a platform's installer, which keeps working even when the file list cannot be read. */
export const buildDownloadUrl = (baseUrl: string, platform: DownloadPlatform, manifest?: DownloadManifest | null): string => {
  if (!baseUrl) return "";
  const file = manifest?.files[platform.id]?.file ?? `LabShope-LIMS-${platform.id}.${platform.extension}`;
  return `${baseUrl}/latest/${encodeURIComponent(file)}`;
};

/** Which kind of computer the visitor is using, from the browser's user-agent text. Phones and tablets get nothing. */
export const detectFamily = (userAgent: string): DownloadFamily | null => {
  const ua = userAgent || "";
  if (/Android|iPhone|iPad|iPod|CrOS/i.test(ua)) return null;
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua)) return "linux";
  return null;
};

/**
 * The single best download for this visitor, or null when it cannot be told: browsers all say "Intel" on a Mac, so a Mac
 * visitor is shown both Mac downloads and told how to check.
 */
export const detectPlatform = (userAgent: string): DownloadPlatformId | null => {
  const family = detectFamily(userAgent);
  if (family === "linux") return "linux";
  if (family === "windows") return /Win64|x64|WOW64|ARM64/i.test(userAgent) ? "windows-64bit" : "windows-32bit";
  return null;
};

export const formatSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) return "";
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
};

/** Reads latest.json. Returns null on any problem so the page can still offer the fixed links. */
export const fetchDownloadManifest = async (baseUrl: string, fetcher: typeof fetch = fetch): Promise<DownloadManifest | null> => {
  if (!baseUrl) return null;
  try {
    const response = await fetcher(`${baseUrl}/latest/latest.json`, { cache: "no-cache" });
    if (!response.ok) return null;
    const data = (await response.json()) as Partial<DownloadManifest>;
    if (!data || typeof data.version !== "string" || !data.files || typeof data.files !== "object") return null;
    return { version: data.version, published: typeof data.published === "string" ? data.published : undefined, files: data.files };
  } catch {
    return null;
  }
};
