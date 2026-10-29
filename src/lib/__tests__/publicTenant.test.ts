import { afterEach, describe, expect, it, vi } from "vitest";

const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("../publicTenant");
};

afterEach(() => vi.unstubAllEnvs());

const ENV = {
  VITE_PUBLIC_BASE_DOMAIN: "labshope.com",
  VITE_PLATFORM_HOSTNAME: "lims.labshope.com",
  VITE_MARKETING_HOSTNAME: "healthcare.labshope.com",
};

describe("marketing host", () => {
  it("treats the marketing host as the product site, not a lab", async () => {
    const t = await load(ENV);
    expect(t.isMarketingHostname("healthcare.labshope.com")).toBe(true);
    expect(t.isDefinitelyPlatformHostname("healthcare.labshope.com")).toBe(true);
    expect(t.isPlatformHostname("healthcare.labshope.com")).toBe(true);
  });

  it("still treats other subdomains as labs", async () => {
    const t = await load(ENV);
    expect(t.isDefinitelyPlatformHostname("demo.labshope.com")).toBe(false);
    expect(t.isMarketingHostname("demo.labshope.com")).toBe(false);
  });

  it("points marketing links at the marketing host, operations links at lims", async () => {
    const t = await load(ENV);
    expect(t.buildMarketingUrl("/pricing")).toBe("http://healthcare.labshope.com/pricing");
    expect(t.buildOperationsUrl("/auth/staff")).toBe("http://lims.labshope.com/auth/staff");
    expect(t.isOperationsHostname("lims.labshope.com")).toBe(true);
  });

  it("falls back to the base domain when no marketing host is set", async () => {
    const t = await load({ VITE_PUBLIC_BASE_DOMAIN: "labshope.com", VITE_PLATFORM_HOSTNAME: "lims.labshope.com", VITE_MARKETING_HOSTNAME: "" });
    expect(t.buildMarketingUrl("/")).toBe("http://labshope.com/");
  });
});
