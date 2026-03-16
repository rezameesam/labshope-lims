const MARKETING_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
] as const;

type MarketingKey = (typeof MARKETING_KEYS)[number];

export type PlatformMarketingParams = Partial<Record<MarketingKey, string>>;

export const getPlatformMarketingParams = (): PlatformMarketingParams => {
  if (typeof window === "undefined") {
    return {};
  }

  const params = new URLSearchParams(window.location.search);
  const result: PlatformMarketingParams = {};

  for (const key of MARKETING_KEYS) {
    const value = params.get(key)?.trim();
    if (value) {
      result[key] = value;
    }
  }

  return result;
};

export const buildPlatformPathWithMarketing = (basePath: string): string => {
  if (typeof window === "undefined") {
    return basePath;
  }

  const currentParams = getPlatformMarketingParams();
  const query = new URLSearchParams();

  for (const key of MARKETING_KEYS) {
    const value = currentParams[key];
    if (value) {
      query.set(key, value);
    }
  }

  const queryString = query.toString();
  if (!queryString) {
    return basePath;
  }

  return `${basePath}${basePath.includes("?") ? "&" : "?"}${queryString}`;
};
