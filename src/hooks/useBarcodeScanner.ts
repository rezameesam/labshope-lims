import { useEffect, useRef } from "react";
import { createScanDetector } from "@/lib/scanner/scanDetector";

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.tagName === "TEXTAREA" || element.isContentEditable;
};

/**
 * Calls onScan(code) whenever a barcode scanner (keyboard-style) reads a code.
 * A scan is swallowed, so it never leaves stray characters or a stray Enter in a form,
 * but ordinary typing is left alone. Notes fields (textarea) are never hijacked.
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    if (!enabled) return undefined;
    const detector = createScanDetector();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) {
        detector.reset();
        return;
      }
      const scan = detector.push({ key: event.key, time: event.timeStamp });
      if (scan) {
        event.preventDefault();
        event.stopPropagation();
        handler.current(scan.code);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled]);
}
