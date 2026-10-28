"use strict";

// Builds the LIMS web app into desktop/app so the desktop app can serve it from
// disk. Values come from, in order of priority:
//   1. environment variables (CI sets these from repository variables)
//   2. desktop/.env.desktop
//   3. the repo's .env  (never .env.local, which holds local-dev overrides)
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopDir, "..");
const outDir = path.join(desktopDir, "app");
const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_PUBLIC_BASE_DOMAIN"];

function parseEnvFile(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

const fromProcess = Object.fromEntries(
  Object.entries(process.env).filter(([key, value]) => key.startsWith("VITE_") && value),
);
const env = {
  ...parseEnvFile(path.join(repoRoot, ".env")),
  ...parseEnvFile(path.join(desktopDir, ".env.desktop")),
  ...fromProcess,
};

const missing = REQUIRED.filter((key) => !env[key]);
if (missing.length) {
  console.error(
    `Cannot build the bundled web app. Missing: ${missing.join(", ")}.\n` +
      "Set them as environment variables (in CI: repository Variables), or in desktop/.env.desktop.",
  );
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });

const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
if (!fs.existsSync(viteBin)) {
  console.error("Vite is not installed. Run `npm ci` in the repository root first.");
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [viteBin, "build", "--outDir", outDir, "--emptyOutDir"],
  { cwd: repoRoot, stdio: "inherit", env: { ...process.env, ...env } },
);
if (result.status !== 0) process.exit(result.status ?? 1);

if (!fs.existsSync(path.join(outDir, "index.html"))) {
  console.error("Web build finished but index.html is missing.");
  process.exit(1);
}
console.log(`Bundled web app ready in ${outDir} (base domain: ${env.VITE_PUBLIC_BASE_DOMAIN})`);
