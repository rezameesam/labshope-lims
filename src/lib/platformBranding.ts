const env = import.meta.env;

export const platformBranding = {
  label: env.VITE_PLATFORM_LABEL?.trim() || "Platform",
  productName: env.VITE_PLATFORM_PRODUCT_NAME?.trim() || "Diagnostic Lab OS",
  companyName:
    env.VITE_PLATFORM_COMPANY_NAME?.trim() ||
    env.VITE_PLATFORM_PRODUCT_NAME?.trim() ||
    "Diagnostic Lab OS",
  contactEmail: env.VITE_PLATFORM_CONTACT_EMAIL?.trim() || "sales@example.com",
  tagline: env.VITE_PLATFORM_TAGLINE?.trim() || "Lab management software for diagnostic labs.",
};

export const getPlatformPageTitle = (pageTitle: string) =>
  `${pageTitle} | ${platformBranding.productName}`;
