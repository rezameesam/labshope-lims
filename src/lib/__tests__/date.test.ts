import { describe, it, expect } from "vitest";
import {
  formatAppDate,
  formatAppDateTime,
  formatAppDateTimeWithSeconds,
  parseDateInputValue,
  formatDateInputDisplay,
} from "../date";

describe("formatAppDate", () => {
  it("formats ISO date string to dd/MM/yyyy", () => {
    expect(formatAppDate("2024-01-15")).toBe("15/01/2024");
  });

  it("returns '-' fallback for null", () => {
    expect(formatAppDate(null)).toBe("-");
  });

  it("returns '-' fallback for undefined", () => {
    expect(formatAppDate(undefined)).toBe("-");
  });

  it("accepts a custom fallback", () => {
    expect(formatAppDate(null, "N/A")).toBe("N/A");
  });

  it("accepts a Date object", () => {
    expect(formatAppDate(new Date("2024-06-01"))).toBe("01/06/2024");
  });
});

describe("formatAppDateTime", () => {
  it("formats ISO datetime string to dd/MM/yyyy, HH:mm", () => {
    expect(formatAppDateTime("2024-01-15T10:30:00")).toBe("15/01/2024, 10:30");
  });

  it("returns fallback for null", () => {
    expect(formatAppDateTime(null)).toBe("-");
  });
});

describe("formatAppDateTimeWithSeconds", () => {
  it("includes seconds in output", () => {
    expect(formatAppDateTimeWithSeconds("2024-01-15T10:30:45")).toBe(
      "15/01/2024, 10:30:45",
    );
  });
});

describe("parseDateInputValue", () => {
  it("parses dd/MM/yyyy to yyyy-MM-dd", () => {
    expect(parseDateInputValue("15/01/2024")).toBe("2024-01-15");
  });

  it("passes through an already-valid yyyy-MM-dd string", () => {
    expect(parseDateInputValue("2024-01-15")).toBe("2024-01-15");
  });

  it("returns empty string for empty input", () => {
    expect(parseDateInputValue("")).toBe("");
  });

  it("returns empty string for invalid input", () => {
    expect(parseDateInputValue("not-a-date")).toBe("");
  });
});

describe("formatDateInputDisplay", () => {
  it("formats yyyy-MM-dd to dd/MM/yyyy", () => {
    expect(formatDateInputDisplay("2024-01-15")).toBe("15/01/2024");
  });

  it("returns empty string for empty input", () => {
    expect(formatDateInputDisplay("")).toBe("");
  });
});
