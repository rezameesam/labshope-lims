import { describe, expect, it } from "vitest";
import { createScanDetector } from "../scanDetector";

const type = (detector: ReturnType<typeof createScanDetector>, text: string, start: number, gap: number, end = "Enter") => {
  let time = start;
  for (const key of text) {
    detector.push({ key, time });
    time += gap;
  }
  return detector.push({ key: end, time });
};

describe("scan detector", () => {
  it("reads a fast burst ended by Enter as a scan", () => {
    expect(type(createScanDetector(), "IRM-00123", 0, 8)).toEqual({ code: "IRM-00123", fast: true });
  });

  it("also accepts Tab as the terminator", () => {
    expect(type(createScanDetector(), "INV20260001", 0, 5, "Tab")?.code).toBe("INV20260001");
  });

  it("ignores a person typing slowly", () => {
    expect(type(createScanDetector(), "ravi kumar", 0, 150)).toBeNull();
  });

  it("ignores codes that are too short", () => {
    expect(type(createScanDetector(), "ab", 0, 5)).toBeNull();
  });

  it("restarts after a pause, so only the fast tail counts", () => {
    const detector = createScanDetector();
    detector.push({ key: "x", time: 0 });
    detector.push({ key: "y", time: 500 });
    expect(type(detector, "PAT0001", 700, 6)?.code).toBe("PAT0001");
  });

  it("ignores modifier keys in the middle of a scan", () => {
    const detector = createScanDetector();
    detector.push({ key: "A", time: 0 });
    detector.push({ key: "Shift", time: 4 });
    for (const [i, key] of ["B", "C", "D"].entries()) detector.push({ key, time: 8 + i * 5 });
    expect(detector.push({ key: "Enter", time: 30 })?.code).toBe("ABCD");
  });

  it("starts clean after each scan", () => {
    const detector = createScanDetector();
    type(detector, "FIRST1", 0, 5);
    expect(type(detector, "SECOND2", 100, 5)?.code).toBe("SECOND2");
  });
});
