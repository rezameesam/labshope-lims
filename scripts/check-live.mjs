#!/usr/bin/env node
// Checks the deployed sites from the outside. Exit code 1 if any site is broken.
//   node scripts/check-live.mjs [path/to/config.json]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { formatReport, runChecks } from "./lib/liveCheck.mjs";

const configPath = process.argv[2] ?? fileURLToPath(new URL("./live-checks.json", import.meta.url));
const config = JSON.parse(readFileSync(configPath, "utf8"));

const outcome = await runChecks(config);
console.log(formatReport(outcome));
process.exit(outcome.ok ? 0 : 1);
