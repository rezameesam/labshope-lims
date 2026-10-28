// Checks that the deployed sites really work, from the outside, the way a visitor's browser would.
// Pure logic lives here so it can be unit tested; scripts/check-live.mjs wires it to the network.

const BUNDLE_PATTERN = /\/assets\/index-[A-Za-z0-9_-]+\.js/;
const SUPABASE_URL_PATTERN = /https:\/\/([a-z0-9]{20})\.supabase\.co/g;
const PUBLISHABLE_KEY_PATTERN = /sb_publishable_[A-Za-z0-9_-]+/;

export const extractBundlePath = (html) => html.match(BUNDLE_PATTERN)?.[0] ?? null;

/** What the build baked in: which Supabase project(s) it talks to, and the public key. */
export function extractBuildInfo(js) {
  const projects = [...new Set([...js.matchAll(SUPABASE_URL_PATTERN)].map((match) => match[1]))];
  return { projects, publishableKey: js.match(PUBLISHABLE_KEY_PATTERN)?.[0] ?? null };
}

const result = (name, ok, detail) => ({ name, ok, detail });

/**
 * Runs every check for one host. `fetchImpl` is injectable so this works in tests.
 * Returns { host, results, failed } where failed lists the names of failing checks.
 */
export async function checkHost({ host, tenant = null }, { supabaseProject, fetchImpl = fetch, timeoutMs = 20000 }) {
  const results = [];
  const get = async (url, init) => {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    return response;
  };

  let html = "";
  try {
    const page = await get(`https://${host}/`);
    html = await page.text();
    results.push(result("page loads", page.status === 200, `HTTP ${page.status}`));
    results.push(result("app shell present", html.includes('id="root"'), html.includes('id="root"') ? "found #root" : "no #root: not the LIMS app"));
  } catch (error) {
    results.push(result("page loads", false, `request failed: ${error.message}`));
    return { host, results, failed: ["page loads"] };
  }

  const bundlePath = extractBundlePath(html);
  results.push(result("main bundle referenced", Boolean(bundlePath), bundlePath ?? "no /assets/index-*.js in the page"));

  let build = { projects: [], publishableKey: null };
  if (bundlePath) {
    try {
      const bundle = await get(`https://${host}${bundlePath}`);
      const js = await bundle.text();
      results.push(result("main bundle loads", bundle.status === 200, `HTTP ${bundle.status}, ${js.length} bytes`));
      build = extractBuildInfo(js);
    } catch (error) {
      results.push(result("main bundle loads", false, `request failed: ${error.message}`));
    }
  }

  const connected = build.projects.length === 1 && build.projects[0] === supabaseProject;
  results.push(
    result(
      "build points at the right database",
      connected,
      build.projects.length === 0
        ? "no Supabase address in the build (missing VITE_SUPABASE_URL at build time?)"
        : `build uses ${build.projects.join(", ")}; expected ${supabaseProject}`,
    ),
  );
  results.push(result("public key baked in", Boolean(build.publishableKey), build.publishableKey ? "present" : "missing"));

  if (tenant && connected && build.publishableKey) {
    try {
      const lookup = await get(`https://${supabaseProject}.supabase.co/rest/v1/rpc/get_public_organization_context`, {
        method: "POST",
        headers: { apikey: build.publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({ _domain: host, _slug: tenant }),
      });
      const body = await lookup.json();
      const organization = body?.organization;
      const ok = Boolean(organization) && organization.slug === tenant && ["active", "trial"].includes(organization.status);
      results.push(
        result(
          `tenant "${tenant}" resolves`,
          ok,
          organization
            ? `${organization.display_name} (status ${organization.status})`
            : "no organization found: it may be suspended, missing, or the domain is not mapped",
        ),
      );
    } catch (error) {
      results.push(result(`tenant "${tenant}" resolves`, false, `request failed: ${error.message}`));
    }
  } else if (tenant) {
    results.push(result(`tenant "${tenant}" resolves`, false, "skipped: the build is not connected to the right database"));
  }

  return { host, results, failed: results.filter((r) => !r.ok).map((r) => r.name) };
}

/** Runs all hosts. Failures on hosts marked `knownIssue` are warnings, everything else fails the run. */
export async function runChecks(config, options = {}) {
  const reports = [];
  for (const entry of config.hosts) {
    const report = await checkHost(entry, { supabaseProject: config.supabaseProject, ...options });
    reports.push({ ...report, knownIssue: entry.knownIssue ?? null });
  }
  const failures = reports.filter((r) => r.failed.length > 0 && !r.knownIssue);
  const warnings = reports.filter((r) => r.failed.length > 0 && r.knownIssue);
  return { reports, failures, warnings, ok: failures.length === 0 };
}

export function formatReport({ reports, failures, warnings, ok }) {
  const lines = [];
  for (const report of reports) {
    const status = report.failed.length === 0 ? "PASS" : report.knownIssue ? "WARN" : "FAIL";
    lines.push(`${status}  ${report.host}`);
    for (const item of report.results) {
      if (!item.ok) lines.push(`        x ${item.name}: ${item.detail}`);
    }
    if (report.failed.length > 0 && report.knownIssue) lines.push(`        known issue: ${report.knownIssue}`);
  }
  lines.push("");
  lines.push(
    ok
      ? `All good: ${reports.length - warnings.length} of ${reports.length} sites healthy${warnings.length ? `, ${warnings.length} with a known issue` : ""}.`
      : `${failures.length} site(s) are broken: ${failures.map((f) => f.host).join(", ")}`,
  );
  return lines.join("\n");
}
