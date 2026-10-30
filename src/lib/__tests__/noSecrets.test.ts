import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Fails when a real-looking secret is committed. The repository may be public for a while, and anything committed stays in
 * the history for good, so this runs with the normal tests. Public keys (Supabase publishable/anon keys, Razorpay key IDs,
 * Turnstile site keys) are meant to be in the browser and are not flagged.
 */
const rules: { name: string; pattern: RegExp }[] = [
  { name: "a Mailjet key", pattern: /MAILJET_(API|SECRET)_KEY\s*=\s*["']?[A-Fa-f0-9]{20,}/ },
  { name: "a Razorpay key secret", pattern: /RAZORPAY_KEY_SECRET\s*=\s*["']?[A-Za-z0-9]{16,}/ },
  { name: "a Supabase secret key", pattern: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "a private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "an AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "a GitHub token", pattern: /\b(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/ },
  { name: "a database URL with a password", pattern: /postgres(ql)?:\/\/[^\s:@/]+:(?!postgres@)[^\s@/]{6,}@[a-z0-9.-]+\.supabase\.(co|com)/ },
  { name: "an SMTP password", pattern: /(SMTP_PASS(WORD)?)\s*=\s*["']?(?!your|<|\$|changeme|example|xxx|placeholder)[^\s"'$<]{8,}/i },
];

const skip = /(^|\/)(node_modules|dist|package-lock\.json)(\/|$)|\.(png|jpg|jpeg|gif|ico|svg|pdf|woff2?|ttf|zip|db)$|noSecrets\.test\.ts$/;

describe("repository secrets", () => {
  it("has no real-looking secret in any tracked file", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((f) => f && !skip.test(f));
    const found: string[] = [];
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue; // deleted in the working tree, or not readable as text
      }
      for (const rule of rules) if (rule.pattern.test(text)) found.push(`${file}: ${rule.name}`);
    }
    expect(found).toEqual([]);
  });
});
