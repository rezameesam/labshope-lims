/**
 * Tells a barcode scanner from a person typing.
 *
 * Most USB scanners act like a keyboard: they type the code very fast and finish with Enter
 * (some use Tab). A person types far slower, so a run of characters with tiny gaps that ends
 * in Enter is a scan, wherever the cursor happens to be.
 */
export interface ScanKey {
  key: string;
  time: number;
}

export interface ScanDetectorOptions {
  /** Longest gap between two characters of one scan (ms). */
  maxGapMs?: number;
  /** Shortest code that counts as a scan. */
  minLength?: number;
}

export interface ScanResult {
  code: string;
  /** True when the characters arrived like a scanner (every gap within the limit). */
  fast: boolean;
}

const TERMINATORS = new Set(["Enter", "Tab"]);

export function createScanDetector({ maxGapMs = 40, minLength = 4 }: ScanDetectorOptions = {}) {
  let buffer = "";
  let lastTime = 0;
  let startedFast = true;

  const reset = () => {
    buffer = "";
    startedFast = true;
  };

  return {
    /** Feed every keydown. Returns the scan when a terminator closes a fast burst, otherwise null. */
    push({ key, time }: ScanKey): ScanResult | null {
      if (TERMINATORS.has(key)) {
        const code = buffer;
        const fast = startedFast;
        reset();
        return fast && code.length >= minLength ? { code, fast } : null;
      }
      if (key.length !== 1) return null; // Shift, Control, arrows...

      if (buffer && time - lastTime > maxGapMs) reset(); // A pause means a person, start over.
      buffer += key;
      lastTime = time;
      return null;
    },
    /** True when what has been typed so far looks like a scan in progress. */
    get inProgress() {
      return buffer.length >= 2;
    },
    reset,
  };
}
