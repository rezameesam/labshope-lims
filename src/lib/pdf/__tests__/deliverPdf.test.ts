import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliverPdf, printPdfDocument } from "../deliverPdf";

const makeDoc = () => ({ output: vi.fn(() => new Blob(["%PDF"], { type: "application/pdf" })), save: vi.fn() });

describe("deliverPdf", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:fake");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("downloads by default and never prints", async () => {
    const doc = makeDoc();
    await deliverPdf(doc, "Invoice_1.pdf");
    expect(doc.save).toHaveBeenCalledWith("Invoice_1.pdf");
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("prints from a hidden frame, without saving a file or opening a pop-up", async () => {
    const doc = makeDoc();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const printed = deliverPdf(doc, "Invoice_1.pdf", "print");

    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    expect(frame).not.toBeNull();
    expect(frame.getAttribute("src")).toBe("blob:fake");
    const print = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { focus: vi.fn(), print } });
    frame.onload?.(new Event("load"));
    await printed;

    expect(print).toHaveBeenCalledTimes(1);
    expect(doc.save).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60_000); // the frame and the file address are cleaned up afterwards
    expect(document.querySelector("iframe")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });

  it("opens the PDF in a tab when the browser cannot print from the frame", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const printed = printPdfDocument(makeDoc());
    const frame = document.querySelector("iframe") as HTMLIFrameElement;
    Object.defineProperty(frame, "contentWindow", { value: { focus: vi.fn(), print: () => { throw new Error("blocked"); } } });
    frame.onload?.(new Event("load"));
    await printed;
    expect(open).toHaveBeenCalledWith("blob:fake", "_blank");
  });
});
