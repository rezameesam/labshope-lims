import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

interface TestResult {
  test_name: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  is_abnormal: boolean;
  normal_range_text?: string;
  normal_range_min?: number;
  normal_range_max?: number;
}

interface PatientInfo {
  full_name: string;
  patient_id: string;
  phone: string;
  gender?: string;
  date_of_birth?: string;
  blood_group?: string;
}

interface ReportOptions {
  includeHeader?: boolean;
  includeFooter?: boolean;
}

interface ReportData {
  patient: PatientInfo;
  test_date: string;
  tests: TestResult[];
  lab_name?: string;
  entered_by?: string;
  options?: ReportOptions;
}

// Lab Information
const LAB_INFO = {
  name: "IRM Clinical Laboratory",
  tagline: "Clinical Laboratory Services",
  address: "Old Post Office Building, Budgam, Jammu and Kashmir - 191111",
  phone: "+91-9419034607 | +91-9622635767",
  email: "irmclinic@gmail.com",
};

export const generateTestReportPDF = (data: ReportData) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const options = data.options || { includeHeader: true, includeFooter: true };
  
  // Always reserve space for header area (for pre-printed paper compatibility)
  const HEADER_RESERVED_HEIGHT = 55;
  let contentStartY = HEADER_RESERVED_HEIGHT; // Always start content after header space
  
  // Header with lab branding (only if includeHeader is true)
  if (options.includeHeader !== false) {
    doc.setFillColor(30, 58, 138); // Navy blue
    doc.rect(0, 0, pageWidth, 45, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(data.lab_name || LAB_INFO.name, pageWidth / 2, 12, { align: "center" });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(LAB_INFO.address, pageWidth / 2, 21, { align: "center" });
    doc.text(`Phone: ${LAB_INFO.phone}`, pageWidth / 2, 27, { align: "center" });
    doc.text(`Email: ${LAB_INFO.email}`, pageWidth / 2, 33, { align: "center" });
  }
  // If not including header, space is still reserved (empty) for pre-printed paper

  // Patient Info Section
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("PATIENT INFORMATION", 14, contentStartY);
  
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.5);
  doc.line(14, contentStartY + 2, pageWidth - 14, contentStartY + 2);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const patientInfoY = contentStartY + 10;
  const col1X = 14;
  const col2X = pageWidth / 2 + 10;
  
  // Left column
  doc.setFont("helvetica", "bold");
  doc.text("Name:", col1X, patientInfoY);
  doc.setFont("helvetica", "normal");
  doc.text(data.patient.full_name, col1X + 25, patientInfoY);
  
  doc.setFont("helvetica", "bold");
  doc.text("Patient ID:", col1X, patientInfoY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(data.patient.patient_id, col1X + 25, patientInfoY + 7);
  
  doc.setFont("helvetica", "bold");
  doc.text("Phone:", col1X, patientInfoY + 14);
  doc.setFont("helvetica", "normal");
  doc.text(`+91-${data.patient.phone}`, col1X + 25, patientInfoY + 14);
  
  // Right column
  doc.setFont("helvetica", "bold");
  doc.text("Gender:", col2X, patientInfoY);
  doc.setFont("helvetica", "normal");
  doc.text(data.patient.gender || "N/A", col2X + 25, patientInfoY);
  
  doc.setFont("helvetica", "bold");
  doc.text("Blood Group:", col2X, patientInfoY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(data.patient.blood_group || "N/A", col2X + 25, patientInfoY + 7);
  
  doc.setFont("helvetica", "bold");
  doc.text("Report Date:", col2X, patientInfoY + 14);
  doc.setFont("helvetica", "normal");
  doc.text(format(new Date(data.test_date), "dd MMM yyyy"), col2X + 28, patientInfoY + 14);

  // Test Results Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TEST RESULTS", 14, patientInfoY + 30);
  
  doc.line(14, patientInfoY + 32, pageWidth - 14, patientInfoY + 32);

  // Prepare table data
  const tableData = data.tests.map((test) => {
    const normalRange = test.normal_range_text || 
      (test.normal_range_min !== undefined && test.normal_range_max !== undefined 
        ? `${test.normal_range_min} - ${test.normal_range_max}` 
        : "-");
    
    const resultDisplay = test.result_value !== null 
      ? `${test.result_value} ${test.result_unit || ""}`
      : test.result || "Pending";
    
    return [
      test.test_name,
      resultDisplay,
      test.result_unit || "-",
      normalRange,
      test.is_abnormal ? "⚠️" : "✓"
    ];
  });

  autoTable(doc, {
    startY: patientInfoY + 38,
    head: [["Test Name", "Result", "Unit", "Normal Range", "Status"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 10
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [0, 0, 0]
    },
    alternateRowStyles: {
      fillColor: [240, 245, 255]
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 35, halign: "center" },
      2: { cellWidth: 25, halign: "center" },
      3: { cellWidth: 40, halign: "center" },
      4: { cellWidth: 20, halign: "center" }
    },
    didParseCell: (data) => {
      // Highlight abnormal results in red
      if (data.section === "body" && data.column.index === 4) {
        const rowData = tableData[data.row.index];
        if (rowData && rowData[4] === "⚠️") {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = "bold";
        }
      }
    }
  });

  // Footer section
  const finalY = (doc as any).lastAutoTable.finalY || patientInfoY + 100;
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Reserve space for footer area (for pre-printed paper compatibility)
  const FOOTER_RESERVED_HEIGHT = 40;
  const footerStartY = pageHeight - FOOTER_RESERVED_HEIGHT;
  
  // Add entered by info if available (place above footer reserved area)
  if (data.entered_by) {
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("Results Entered By:", 14, finalY + 12);
    doc.setFont("helvetica", "normal");
    doc.text(data.entered_by, 55, finalY + 12);
  }
  
  // Only include footer content if option is true
  if (options.includeFooter !== false) {
    const footerY = footerStartY;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("This is a computer-generated report.", 14, footerY);
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, HH:mm")}`, 14, footerY + 5);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, footerY + 12, pageWidth - 14, footerY + 12);
    
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text("IRM Clinical Laboratory - Quality Healthcare Services", pageWidth / 2, footerY + 19, { align: "center" });
  }
  // If not including footer, space is still reserved (empty) for pre-printed paper

  // Save the PDF
  const fileName = `${data.patient.patient_id}_${format(new Date(data.test_date), "yyyy-MM-dd")}_report.pdf`;
  doc.save(fileName);
};

export const generateMultiTestReportPDF = (
  patient: PatientInfo,
  tests: Array<{
    id: string;
    test_name: string;
    test_date: string;
    status: string;
    result: string | null;
    result_value?: number | null;
    result_unit?: string | null;
    is_abnormal?: boolean;
    normal_range_text?: string;
    entered_by_name?: string;
  }>,
  enteredByName?: string,
  options?: ReportOptions
) => {
  const completedTests = tests.filter(t => t.status === "completed");
  
  if (completedTests.length === 0) {
    return false;
  }

  const testResults: TestResult[] = completedTests.map(t => ({
    test_name: t.test_name,
    result: t.result,
    result_value: t.result_value || null,
    result_unit: t.result_unit || null,
    is_abnormal: t.is_abnormal || false,
    normal_range_text: t.normal_range_text
  }));

  // Get entered by name from the first test that has it, or use passed parameter
  const employeeName = enteredByName || completedTests.find(t => t.entered_by_name)?.entered_by_name;

  generateTestReportPDF({
    patient,
    test_date: completedTests[0].test_date,
    tests: testResults,
    lab_name: "IRM Clinical Laboratory",
    entered_by: employeeName,
    options
  });

  return true;
};
