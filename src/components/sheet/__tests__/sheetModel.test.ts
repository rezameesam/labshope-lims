import { describe, expect, it } from "vitest";
import {
  compareValues,
  navigate,
  normalizeRange,
  parseFilter,
  parseTsv,
  rangeStats,
  sortRows,
  toCsv,
  toTsv,
} from "../sheetModel";

describe("sorting", () => {
  it("orders numbers numerically and text naturally, blanks last", () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues("T2", "T10")).toBeLessThan(0);
    expect(compareValues("apple", "Banana")).toBeLessThan(0);
    expect(compareValues(null, "a")).toBeGreaterThan(0);
    expect(compareValues("", 5)).toBeGreaterThan(0);
  });

  it("keeps blanks at the bottom in both directions and is stable", () => {
    const rows = [
      { id: 1, v: 5 },
      { id: 2, v: null },
      { id: 3, v: 1 },
      { id: 4, v: 5 },
    ];
    expect(sortRows(rows, (r) => r.v, "asc").map((r) => r.id)).toEqual([3, 1, 4, 2]);
    expect(sortRows(rows, (r) => r.v, "desc").map((r) => r.id)).toEqual([1, 4, 3, 2]);
  });
});

describe("filters", () => {
  const pass = (filter: string, value: string | number | null) => parseFilter(filter)(value);

  it("matches text case-insensitively and supports exact, negated and blank", () => {
    expect(pass("asha", "Asha Rao")).toBe(true);
    expect(pass("ASHA", "Asha Rao")).toBe(true);
    expect(pass("=asha rao", "Asha Rao")).toBe(true);
    expect(pass("=asha", "Asha Rao")).toBe(false);
    expect(pass("!rao", "Asha Rao")).toBe(false);
    expect(pass("!rao", "Ravi")).toBe(true);
    expect(pass("=", "")).toBe(true);
    expect(pass("=", "x")).toBe(false);
    expect(pass("", "anything")).toBe(true);
  });

  it("supports numeric comparisons and ranges", () => {
    expect(pass(">100", 150)).toBe(true);
    expect(pass(">100", 100)).toBe(false);
    expect(pass(">=100", 100)).toBe(true);
    expect(pass("<=50", 50)).toBe(true);
    expect(pass("=300", 300)).toBe(true);
    expect(pass("!=0", 5)).toBe(true);
    expect(pass("!=0", 0)).toBe(false);
    expect(pass("10..20", 15)).toBe(true);
    expect(pass("20..10", 15)).toBe(true);
    expect(pass("10..20", 21)).toBe(false);
    expect(pass(">5", null)).toBe(false);
    expect(pass(">5", "abc")).toBe(false);
  });
});

describe("clipboard text", () => {
  it("round-trips fields containing tabs, quotes and newlines", () => {
    const rows = [
      ["Asha Rao", 'said "hi"', "line1\nline2"],
      ["a\tb", "", "x"],
    ];
    expect(parseTsv(toTsv(rows))).toEqual(rows);
  });

  it("parses what Excel copies, including the trailing newline and CRLF", () => {
    expect(parseTsv("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseTsv("single")).toEqual([["single"]]);
    expect(parseTsv("")).toEqual([]);
    expect(parseTsv("a\t\tc")).toEqual([["a", "", "c"]]);
  });
});

describe("csv export", () => {
  it("starts with a BOM, uses CRLF and quotes special characters", () => {
    const csv = toCsv(["Name", "Note"], [["Asha, Rao", 'a "b"']]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toBe('\uFEFFName,Note\r\n"Asha, Rao","a ""b"""\r\n');
  });

  it("neutralizes spreadsheet formulas but leaves real numbers alone", () => {
    const csv = toCsv(["v"], [["=HYPERLINK(\"http://evil\")"], ["+91 98765"], ["@SUM(A1)"], ["-5"], ["300.5"], ["-cmd"]]);
    const lines = csv.split("\r\n");
    expect(lines[1]).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(lines[2]).toBe("'+91 98765");
    expect(lines[3]).toBe("'@SUM(A1)");
    expect(lines[4]).toBe("-5");
    expect(lines[5]).toBe("300.5");
    expect(lines[6]).toBe("'-cmd");
  });
});

describe("range stats", () => {
  it("summarizes numbers the way Excel's status bar does", () => {
    expect(rangeStats([300, "450", "1,200", "", null, "abc"])).toEqual({
      count: 4,
      numericCount: 3,
      sum: 1950,
      average: 650,
      min: 300,
      max: 1200,
    });
    expect(rangeStats(["a", "b"]).average).toBeNull();
    expect(rangeStats([]).count).toBe(0);
  });
});

describe("navigation", () => {
  const size = { rows: 5, cols: 4 };

  it("moves and clamps at the edges", () => {
    expect(navigate("ArrowDown", { row: 4, col: 1 }, size)).toEqual({ row: 4, col: 1 });
    expect(navigate("ArrowUp", { row: 0, col: 1 }, size)).toEqual({ row: 0, col: 1 });
    expect(navigate("ArrowRight", { row: 2, col: 3 }, size)).toEqual({ row: 2, col: 3 });
    expect(navigate("ArrowDown", { row: 1, col: 1 }, size, { ctrl: true })).toEqual({ row: 4, col: 1 });
    expect(navigate("Home", { row: 3, col: 2 }, size)).toEqual({ row: 3, col: 0 });
    expect(navigate("End", { row: 3, col: 1 }, size, { ctrl: true })).toEqual({ row: 4, col: 3 });
    expect(navigate("PageDown", { row: 1, col: 0 }, size, { page: 10 })).toEqual({ row: 4, col: 0 });
  });

  it("wraps Tab across rows", () => {
    expect(navigate("Tab", { row: 0, col: 3 }, size)).toEqual({ row: 1, col: 0 });
    expect(navigate("Tab", { row: 1, col: 0 }, size, { shift: true })).toEqual({ row: 0, col: 3 });
    expect(navigate("Tab", { row: 4, col: 3 }, size)).toEqual({ row: 4, col: 3 });
    expect(navigate("x", { row: 0, col: 0 }, size)).toBeNull();
  });

  it("normalizes ranges regardless of drag direction", () => {
    expect(normalizeRange({ anchor: { row: 3, col: 2 }, focus: { row: 1, col: 0 } })).toEqual({
      top: 1,
      bottom: 3,
      left: 0,
      right: 2,
    });
  });
});
