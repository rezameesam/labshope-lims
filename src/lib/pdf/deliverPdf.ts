/**
 * What to do with a finished PDF: save it as a file ("download") or open the browser's print dialog for it ("print").
 * A button that says Print must print; a button that says Download must download.
 */
export type PdfOutput = "download" | "print";

interface PdfLike {
  output(type: "blob"): Blob;
  save(fileName: string): unknown;
}

/**
 * Opens the print dialog for a PDF without a pop-up window (so a pop-up blocker cannot stop it): the PDF is loaded into a hidden frame
 * and printed from there. Resolves when the dialog has been used or closed. If the browser cannot print from the frame the PDF is opened in a
 * new tab instead, where the person can print it with the viewer's own print button.
 */
export const printPdfDocument = (doc: Pick<PdfLike, "output">): Promise<void> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(doc.output("blob"));
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      // Keep the frame a while: some browsers read the file after the dialog opens.
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
      }, 60_000);
      resolve();
    };

    frame.onload = () => {
      try {
        const frameWindow = frame.contentWindow;
        if (!frameWindow) throw new Error("no frame window");
        frameWindow.focus();
        frameWindow.print(); // returns once the dialog is closed in most browsers
        finish();
      } catch {
        window.open(url, "_blank");
        finish();
      }
    };
    frame.src = url;
    document.body.appendChild(frame);
  });

export const deliverPdf = async (doc: PdfLike, fileName: string, output: PdfOutput = "download"): Promise<void> => {
  if (output === "print") {
    await printPdfDocument(doc);
    return;
  }
  doc.save(fileName);
};
