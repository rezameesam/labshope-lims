"use strict";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const HOST_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const isLocalHost = (host) => host === "localhost" || host.endsWith(".localhost");

/**
 * Turns whatever the user typed into the tenant origin to load.
 *   "demo"                        -> https://demo.<baseDomain>
 *   "demo.labshope.com"           -> https://demo.labshope.com
 *   "https://lab.example.com/x"   -> https://lab.example.com
 *   "demo.localhost:8080"         -> http://demo.localhost:8080 (local dev only)
 */
function resolveWorkspace(input, baseDomain) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw) {
    return { ok: false, error: "Enter your lab workspace name or address." };
  }

  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  const authority = withoutScheme.split(/[/?#]/)[0];
  const [hostPart, portPart, ...rest] = authority.split(":");

  if (rest.length > 0 || !hostPart) {
    return { ok: false, error: "That doesn't look like a valid address." };
  }

  let host = hostPart.replace(/\.$/, "");
  if (!host.includes(".") && !isLocalHost(host)) {
    if (!SLUG_PATTERN.test(host)) {
      return { ok: false, error: "Workspace names can only use letters, numbers and hyphens." };
    }
    if (!baseDomain) {
      return { ok: false, error: "No default domain is configured. Enter the full address instead." };
    }
    host = `${host}.${baseDomain}`;
  }

  if (!isLocalHost(host) && !HOST_PATTERN.test(host)) {
    return { ok: false, error: "That doesn't look like a valid address." };
  }

  let port = "";
  if (portPart) {
    if (!isLocalHost(host)) {
      return { ok: false, error: "Ports are only supported for local development." };
    }
    if (!/^\d{1,5}$/.test(portPart) || Number(portPart) > 65535) {
      return { ok: false, error: "That port isn't valid." };
    }
    port = `:${portPart}`;
  }

  const protocol = isLocalHost(host) ? "http" : "https";
  return { ok: true, host, port, origin: `${protocol}://${host}${port}` };
}

/**
 * Decides how to open a resolved workspace.
 *
 * "bundled": the app serves its own copy of the web app from disk at
 *   http://<slug>.localhost (no port). Only possible for workspaces under the
 *   base domain, because tenant lookup works from that slug.
 * "remote": load the live site (custom domains, local dev servers, or when no
 *   bundled copy was built into this app).
 */
function resolveTarget(resolved, baseDomain, bundledAvailable) {
  if (bundledAvailable && !resolved.port) {
    let slug = null;
    if (resolved.host.endsWith(".localhost")) {
      slug = resolved.host.slice(0, -".localhost".length);
    } else if (baseDomain && resolved.host.endsWith(`.${baseDomain}`)) {
      slug = resolved.host.slice(0, -(baseDomain.length + 1));
    }
    if (slug && SLUG_PATTERN.test(slug)) {
      return { mode: "bundled", slug, origin: `http://${slug}.localhost` };
    }
  }
  return { mode: "remote", origin: resolved.origin };
}

module.exports = { resolveWorkspace, resolveTarget };
