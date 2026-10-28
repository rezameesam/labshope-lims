"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveWorkspace, resolveTarget } = require("../lib/workspace");

const BASE = "labshope.com";

test("a bare workspace name expands to the base domain", () => {
  assert.deepEqual(resolveWorkspace("Demo", BASE), {
    ok: true,
    host: "demo.labshope.com",
    port: "",
    origin: "https://demo.labshope.com",
  });
});

test("a full hostname is used as-is", () => {
  assert.equal(resolveWorkspace("lab.example.com", BASE).origin, "https://lab.example.com");
});

test("pasted URLs are reduced to their origin", () => {
  assert.equal(
    resolveWorkspace("  https://Demo.labshope.com/admin?tab=billing#x ", BASE).origin,
    "https://demo.labshope.com",
  );
});

test("localhost tenants use http and may carry a port", () => {
  assert.equal(resolveWorkspace("demo.localhost:8080", BASE).origin, "http://demo.localhost:8080");
});

test("ports are rejected for real domains", () => {
  assert.equal(resolveWorkspace("demo.labshope.com:8443", BASE).ok, false);
});

test("empty and malformed input is rejected", () => {
  for (const bad of ["", "   ", "demo_lab", "-demo", "a b", "demo..com", "http://", "a:b:c", "demo.localhost:99999"]) {
    assert.equal(resolveWorkspace(bad, BASE).ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

test("a bare name fails when no base domain is configured", () => {
  assert.equal(resolveWorkspace("demo", "").ok, false);
});

test("workspaces under the base domain open from the bundled copy", () => {
  const target = resolveTarget(resolveWorkspace("demo", BASE), BASE, true);
  assert.deepEqual(target, { mode: "bundled", slug: "demo", origin: "http://demo.localhost" });
});

test("a .localhost workspace without a port is bundled too", () => {
  assert.equal(resolveTarget(resolveWorkspace("demo.localhost", BASE), BASE, true).mode, "bundled");
});

test("custom domains, dev ports and missing bundles fall back to the live site", () => {
  assert.equal(resolveTarget(resolveWorkspace("lab.example.com", BASE), BASE, true).mode, "remote");
  assert.equal(resolveTarget(resolveWorkspace("demo.localhost:8080", BASE), BASE, true).mode, "remote");
  assert.deepEqual(resolveTarget(resolveWorkspace("demo", BASE), BASE, false), {
    mode: "remote",
    origin: "https://demo.labshope.com",
  });
});

test("multi-level subdomains are not treated as a slug", () => {
  assert.equal(resolveTarget(resolveWorkspace("a.b.labshope.com", BASE), BASE, true).mode, "remote");
});
