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
  return { ok: true, host, origin: `${protocol}://${host}${port}` };
}

module.exports = { resolveWorkspace };
