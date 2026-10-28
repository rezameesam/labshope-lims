type JsPdfModule = typeof import("jspdf");
type JsPdfAutoTableModule = typeof import("jspdf-autotable");

export type JsPdfConstructor = JsPdfModule["default"];
export type JsPdfDocument = InstanceType<JsPdfConstructor>;
export type AutoTableFunction = JsPdfAutoTableModule["default"];

interface PdfDependencies {
  jsPDF: JsPdfConstructor;
  autoTable: AutoTableFunction;
}

let pdfDependenciesPromise: Promise<PdfDependencies> | null = null;

export const loadPdfDependencies = async (): Promise<PdfDependencies> => {
  if (!pdfDependenciesPromise) {
    pdfDependenciesPromise = Promise.all([import("jspdf"), import("jspdf-autotable")])
      .then(([jspdfModule, autoTableModule]) => ({
        jsPDF: jspdfModule.default,
        autoTable: autoTableModule.default,
      }))
      .catch((error) => {
        pdfDependenciesPromise = null;
        throw error;
      });
  }

  return pdfDependenciesPromise;
};
