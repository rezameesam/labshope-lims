import { describe, expect, it } from "vitest";
import { checkHost, extractBuildInfo, extractBundlePath, formatReport, runChecks } from "../lib/liveCheck.mjs";

const PROJECT = "ceyfwoczyhnwipacwhcn";
const OTHER = "pxsutovdzppoyyfrbeaw";
const KEY = "sb_publishable_testkey123";

const html = (extra = "") => `<html><body><div id="root"></div><script src="/assets/index-AbC_123.js"></script>${extra}</body></html>`;
const bundle = (project = PROJECT, key = KEY) =>
  `const a="https://${project}.supabase.co",b="${key}";createClient(a,b)`;

/** A fake internet: maps "METHOD url" (or just url) to a response. */
function fakeFetch(routes) {
  return async (url, init = {}) => {
    const key = `${init.method ?? "GET"} ${url}`;
    const route = routes[key] ?? routes[url];
    if (!route) throw new Error(`no route for ${key}`);
    if (route instanceof Error) throw route;
    const { status = 200, body } = route;
    const text = typeof body === "string" ? body : JSON.stringify(body);
    return { status, text: async () => text, json: async () => JSON.parse(text) };
  };
}

const rpcUrl = `https://${PROJECT}.supabase.co/rest/v1/rpc/get_public_organization_context`;
const healthy = (host, org = { slug: "demo", status: "active", display_name: "Demo Lab" }) => ({
  [`https://${host}/`]: { body: html() },
  [`https://${host}/assets/index-AbC_123.js`]: { body: bundle() },
  [`POST ${rpcUrl}`]: { body: { organization: org } },
});

describe("extractors", () => {
  it("finds the main bundle and the baked-in database", () => {
    expect(extractBundlePath(html())).toBe("/assets/index-AbC_123.js");
    expect(extractBundlePath("<html></html>")).toBeNull();
    expect(extractBuildInfo(bundle())).toEqual({ projects: [PROJECT], publishableKey: KEY });
    expect(extractBuildInfo("nothing here")).toEqual({ projects: [], publishableKey: null });
  });
});

describe("checkHost", () => {
  const options = (routes) => ({ supabaseProject: PROJECT, fetchImpl: fakeFetch(routes) });

  it("passes a healthy tenant site", async () => {
    const report = await checkHost({ host: "demo.example", tenant: "demo" }, options(healthy("demo.example")));
    expect(report.failed).toEqual([]);
    expect(report.results.map((r) => r.name)).toContain('tenant "demo" resolves');
  });

  it("passes a platform host that needs no tenant", async () => {
    const report = await checkHost({ host: "lims.example" }, options(healthy("lims.example")));
    expect(report.failed).toEqual([]);
    expect(report.results.some((r) => r.name.startsWith("tenant"))).toBe(false);
  });

  it("catches a build with no database address (the irmclinic.com outage)", async () => {
    const routes = healthy("irm.example");
    routes["https://irm.example/assets/index-AbC_123.js"] = { body: "const nothing = 1" };
    const report = await checkHost({ host: "irm.example", tenant: "irm" }, options(routes));
    expect(report.failed).toContain("build points at the right database");
    expect(report.failed).toContain("public key baked in");
    expect(report.results.find((r) => r.name === "build points at the right database").detail).toMatch(/missing VITE_SUPABASE_URL/);
  });

  it("catches a build that talks to the wrong Supabase project", async () => {
    const routes = healthy("irm.example");
    routes["https://irm.example/assets/index-AbC_123.js"] = { body: bundle(OTHER) };
    const report = await checkHost({ host: "irm.example", tenant: "irm" }, options(routes));
    expect(report.failed).toContain("build points at the right database");
    expect(report.results.find((r) => r.name === "build points at the right database").detail).toContain(OTHER);
    // and it does not pretend the tenant lookup was fine
    expect(report.failed).toContain('tenant "irm" resolves');
  });

  it("catches a suspended or missing lab (the demo/irm outage)", async () => {
    const suspended = healthy("demo.example");
    suspended[`POST ${rpcUrl}`] = { body: null };
    const gone = await checkHost({ host: "demo.example", tenant: "demo" }, options(suspended));
    expect(gone.failed).toEqual(['tenant "demo" resolves']);
    expect(gone.results.at(-1).detail).toMatch(/suspended, missing/);

    const wrongStatus = healthy("demo.example", { slug: "demo", status: "suspended", display_name: "Demo Lab" });
    expect((await checkHost({ host: "demo.example", tenant: "demo" }, options(wrongStatus))).failed).toEqual(['tenant "demo" resolves']);

    const wrongSlug = healthy("demo.example", { slug: "other", status: "active", display_name: "Other" });
    expect((await checkHost({ host: "demo.example", tenant: "demo" }, options(wrongSlug))).failed).toEqual(['tenant "demo" resolves']);
  });

  it("catches a page that is down or not the app", async () => {
    const down = await checkHost({ host: "x.example" }, options({ "https://x.example/": new Error("getaddrinfo ENOTFOUND") }));
    expect(down.failed).toEqual(["page loads"]);

    const errorPage = await checkHost({ host: "x.example" }, options({ "https://x.example/": { status: 500, body: "boom" } }));
    expect(errorPage.failed).toContain("page loads");
    expect(errorPage.failed).toContain("app shell present");

    const otherSite = await checkHost({ host: "x.example" }, options({ "https://x.example/": { body: "<html>a marketing page</html>" } }));
    expect(otherSite.failed).toContain("app shell present");
  });
});

describe("runChecks", () => {
  const config = (hosts) => ({ supabaseProject: PROJECT, hosts });

  it("is green when everything is healthy", async () => {
    const outcome = await runChecks(config([{ host: "a.example" }]), { fetchImpl: fakeFetch(healthy("a.example")) });
    expect(outcome.ok).toBe(true);
    expect(formatReport(outcome)).toMatch(/All good: 1 of 1 sites healthy/);
  });

  it("fails the run for a broken site and names it", async () => {
    const routes = { ...healthy("a.example"), "https://b.example/": { status: 502, body: "bad gateway" } };
    const outcome = await runChecks(config([{ host: "a.example" }, { host: "b.example" }]), { fetchImpl: fakeFetch(routes) });
    expect(outcome.ok).toBe(false);
    expect(outcome.failures.map((f) => f.host)).toEqual(["b.example"]);
    const text = formatReport(outcome);
    expect(text).toMatch(/FAIL {2}b\.example/);
    expect(text).toMatch(/1 site\(s\) are broken: b\.example/);
  });

  it("downgrades a known issue to a warning without hiding it", async () => {
    const routes = healthy("a.example");
    routes["https://a.example/assets/index-AbC_123.js"] = { body: bundle(OTHER) };
    const outcome = await runChecks(config([{ host: "a.example", tenant: "demo", knownIssue: "old build, being migrated" }]), {
      fetchImpl: fakeFetch(routes),
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.warnings).toHaveLength(1);
    const text = formatReport(outcome);
    expect(text).toMatch(/WARN {2}a\.example/);
    expect(text).toContain("known issue: old build, being migrated");
  });
});
