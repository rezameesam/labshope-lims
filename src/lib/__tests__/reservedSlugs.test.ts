import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugProblem } from "../../../supabase/functions/_shared/reserved-slugs";

describe("lab name rules", () => {
  it.each(["lab", "shop", "healthcare", "business", "email", "site", "contact", "lims", "lims-downloads", "radarx-downloads", "www", "Healthcare"])(
    "blocks the reserved word %s",
    (name) => expect(slugProblem(name)).not.toBeNull(),
  );

  it.each(["a", "7", "ab", "12", "abc", "123"])("blocks the short name %s", (name) => {
    expect(slugProblem(name)).toMatch(/at least 4/);
  });

  it.each(["1234", "-abcd", "abcd-", "ab cd", "ab_cd", "abc!"])("blocks the badly shaped name %s", (name) => {
    expect(slugProblem(name)).not.toBeNull();
  });

  it.each(["irmclinic", "sunrise-diagnostics", "demo1", "city-path-lab", "lifeline"])("allows %s", (name) => {
    expect(slugProblem(name)).toBeNull();
  });

  it("only reserves words of 4+ letters (shorter ones are blocked by length)", () => {
    expect([...RESERVED_SLUGS].filter((word) => word.length < 4)).toEqual([]);
  });

  it("is the same list the database uses", () => {
    // The newest migration that defines the list is the one in force.
    const latest = readdirSync("supabase/migrations")
      .filter((file) => file.endsWith(".sql") && readFileSync(`supabase/migrations/${file}`, "utf8").includes("function public.reserved_org_slugs()"))
      .sort()
      .pop()!;
    const sql = readFileSync(`supabase/migrations/${latest}`, "utf8");
    const block = sql.slice(sql.indexOf("select array["), sql.indexOf("$$;"));
    const inDatabase = [...block.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]).sort();
    expect(inDatabase).toEqual([...RESERVED_SLUGS].sort());
  });
});
