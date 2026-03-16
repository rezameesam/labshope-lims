export const getWebsiteHostname = (website?: string | null, fallback = "example.com") => {
  const value = (website || "").trim();

  if (!value) {
    return fallback;
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "") || fallback;
  } catch {
    try {
      return new URL(`https://${value}`).hostname.replace(/^www\./, "") || fallback;
    } catch {
      return fallback;
    }
  }
};
