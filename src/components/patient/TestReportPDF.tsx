import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { differenceInMonths, differenceInYears, format, isValid, parseISO } from "date-fns";
import logoImageUrl from "@/assets/logo.png";
import { supabase } from "@/integrations/supabase/client";
import { formatAppDate, formatAppDateTime } from "@/lib/date";
import { formatPhoneForDisplay } from "@/lib/phone";
import { renderReportTemplateText, type ReportTemplatePreviewContext } from "@/lib/reportTemplates";

interface TestResult {
  test_id?: string | null;
  category?: string | null;
  test_name: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  result_items?: Array<{
    name: string;
    value: number | string | null;
    unit: string | null;
    normal_range_min: number | null;
    normal_range_max: number | null;
    normal_range_text: string | null;
  }> | null;
  registry_serial?: string | null;
  is_abnormal: boolean;
  normal_range_text?: string;
  normal_range_min?: number;
  normal_range_max?: number;
  notes?: string | null;
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
  includeWatermark?: boolean;
}

interface ReportBranding {
  organizationId?: string;
  name?: string;
  tagline?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  reportTagline?: string;
  reportFooterNote?: string;
}

interface ReportTemplate {
  id: string;
  name: string;
  organization_id?: string | null;
  test_category: string | null;
  test_id: string | null;
  header_template: string | null;
  footer_template: string | null;
  result_format: string;
  include_normal_range: boolean | null;
  include_abnormal_flag: boolean | null;
  include_notes: boolean | null;
  is_default: boolean | null;
}

interface ReportData {
  patient: PatientInfo;
  test_date: string;
  sample_collection_date?: string;
  tests: TestResult[];
  lab_name?: string;
  lab_code?: string;
  collection_center_name?: string;
  collection_center_code?: string;
  entered_by?: string;
  registry_serial?: string;
  options?: ReportOptions;
  template?: ReportTemplate | null;
  branding?: ReportBranding;
}

// Lab Information
const LAB_INFO = {
  name: "Diagnostic Laboratory",
  tagline: "Clinical Laboratory Services",
  address: "Laboratory Address, City, State - Postal Code",
  phone: "+91-0000000000",
  email: "support@example.com",
  website: "https://example.com",
  reportTagline: "Quality Healthcare Services",
  reportFooterNote: "This is a computer-generated report.",
};

let watermarkImagePromise: Promise<string | null> | null = null;
let watermarkImageSource: string | null = null;

const resolveReportBranding = (branding?: ReportBranding) => ({
  name: branding?.name || LAB_INFO.name,
  tagline: branding?.tagline || LAB_INFO.tagline,
  address: branding?.address || LAB_INFO.address,
  phone: branding?.phone || LAB_INFO.phone,
  email: branding?.email || LAB_INFO.email,
  website: branding?.website || LAB_INFO.website,
  logoUrl: branding?.logoUrl || logoImageUrl,
  reportTagline: branding?.reportTagline || LAB_INFO.reportTagline,
  reportFooterNote: branding?.reportFooterNote || LAB_INFO.reportFooterNote,
});

const hasWebsiteReference = (value: string, website?: string) =>
  !!website && value.toLowerCase().includes(website.toLowerCase());

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load watermark image."));
    image.src = src;
  });

const getWatermarkImage = async (source: string) => {
  if (typeof document === "undefined") {
    return null;
  }

  if (!watermarkImagePromise || watermarkImageSource !== source) {
    watermarkImageSource = source;
    watermarkImagePromise = (async () => {
      const image = await loadImage(source);
      const canvas = document.createElement("canvas");
      const canvasSize = 900;
      canvas.width = canvasSize;
      canvas.height = canvasSize;

      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      const watermarkSize = canvasSize * 0.72;
      const offset = (canvasSize - watermarkSize) / 2;

      context.clearRect(0, 0, canvasSize, canvasSize);
      context.filter = "grayscale(1)";
      context.globalAlpha = 0.06;
      context.drawImage(image, offset, offset, watermarkSize, watermarkSize);

      return canvas.toDataURL("image/png");
    })().catch((error) => {
      console.warn("Could not prepare watermark image:", error);
      return null;
    });
  }

  return watermarkImagePromise;
};

const getPatientAgeLabel = (dateOfBirth?: string) => {
  if (!dateOfBirth) {
    return null;
  }

  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
    ? parseISO(`${dateOfBirth}T00:00:00`)
    : parseISO(dateOfBirth);

  if (!isValid(parsedDate)) {
    return null;
  }

  const today = new Date();
  const ageInYears = differenceInYears(today, parsedDate);

  if (ageInYears >= 1) {
    return `${ageInYears} year${ageInYears === 1 ? "" : "s"}`;
  }

  const ageInMonths = differenceInMonths(today, parsedDate);
  if (ageInMonths >= 0) {
    return `${ageInMonths} month${ageInMonths === 1 ? "" : "s"}`;
  }

  return null;
};

const getSampleCollectionDate = (
  tests: Array<{ created_at?: string | null; test_date: string }>
) => {
  const datedTests = tests
    .map((test) => {
      if (!test.created_at) {
        return null;
      }

      const parsedDate = parseISO(test.created_at);
      return isValid(parsedDate) ? { createdAt: test.created_at, parsedDate } : null;
    })
    .filter(Boolean) as Array<{ createdAt: string; parsedDate: Date }>;

  if (datedTests.length === 0) {
    return tests[0]?.test_date;
  }

  datedTests.sort((a, b) => a.parsedDate.getTime() - b.parsedDate.getTime());
  return datedTests[0].createdAt;
};

const getResolvedReportDate = (reportDate: string, sampleCollectionDate?: string) => {
  const parsedReportDate = parseISO(reportDate);
  const parsedSampleCollectionDate = sampleCollectionDate ? parseISO(sampleCollectionDate) : null;

  if (!isValid(parsedReportDate)) {
    return sampleCollectionDate || reportDate;
  }

  if (!parsedSampleCollectionDate || !isValid(parsedSampleCollectionDate)) {
    return reportDate;
  }

  return parsedReportDate.getTime() >= parsedSampleCollectionDate.getTime()
    ? reportDate
    : sampleCollectionDate || reportDate;
};

const addReportWatermark = async (doc: jsPDF, options: ReportOptions, logoSource: string) => {
  if (options.includeWatermark === false) {
    return;
  }

  const watermarkImage = await getWatermarkImage(logoSource);
  if (!watermarkImage) {
    return;
  }

  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const watermarkSize = Math.min(pageWidth, pageHeight) * 0.68;
  const watermarkX = (pageWidth - watermarkSize) / 2;
  const watermarkY = (pageHeight - watermarkSize) / 2;

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.addImage(watermarkImage, "PNG", watermarkX, watermarkY, watermarkSize, watermarkSize, undefined, "FAST");
  }
};

const resolveReportTemplate = async (
  tests: TestResult[],
  templateId?: string,
  organizationId?: string,
) => {
  const templateQuery = organizationId
    ? supabase
        .from("test_templates")
        .select("*")
        .or(`organization_id.eq.${organizationId},organization_id.is.null`)
        .order("created_at", { ascending: true })
    : supabase
        .from("test_templates")
        .select("*")
        .order("created_at", { ascending: true });

  const { data: templates, error } = await templateQuery;

  if (error || !templates || templates.length === 0) {
    return null;
  }

  const prioritizedTemplates = organizationId
    ? [...templates].sort((left: any, right: any) => {
        const leftPriority = left.organization_id === organizationId ? 0 : 1;
        const rightPriority = right.organization_id === organizationId ? 0 : 1;
        return leftPriority - rightPriority;
      })
    : templates;

  if (templateId) {
    const override = prioritizedTemplates.find((t) => t.id === templateId);
    if (override) return override;
  }

  const defaultTemplate = prioritizedTemplates.find((t) => t.is_default);
  const testIds = Array.from(new Set(tests.map((t) => t.test_id).filter(Boolean)));
  const categoryNames = Array.from(new Set(tests.map((t) => t.category).filter(Boolean)));

  if (tests.length === 1 && testIds.length === 1) {
    const match = prioritizedTemplates.find((t) => t.test_id === testIds[0]);
    if (match) return match;
  }
  if (tests.length === 1 && categoryNames.length === 1) {
    const match = prioritizedTemplates.find((t) => t.test_category === categoryNames[0]);
    if (match) return match;
  }

  if (testIds.length > 0) {
    let testsQuery = supabase
      .from("tests")
      .select("id, test_categories(name)")
      .in("id", testIds);

    if (organizationId) {
      testsQuery = testsQuery.eq("organization_id", organizationId);
    }

    const { data: testRows } = await testsQuery;

    const resolvedCategoryNames = Array.from(
      new Set(
        (testRows || [])
          .map((row: any) => row.test_categories?.name)
          .filter(Boolean)
      )
    );

    if (resolvedCategoryNames.length === 1) {
      const categoryMatch = prioritizedTemplates.find(
        (t) => t.test_category === resolvedCategoryNames[0]
      );
      if (categoryMatch) return categoryMatch;
    }
  }

  return defaultTemplate || null;
};

export const generateTestReportPDF = async (data: ReportData) => {
  try {
    const doc = new jsPDF();
  const resolvedReportDate = getResolvedReportDate(data.test_date, data.sample_collection_date);
  const pageWidth = doc.internal.pageSize.getWidth();
  const options = data.options || { includeHeader: true, includeFooter: true, includeWatermark: true };
  const branding = resolveReportBranding(data.branding);
  const template = data.template;
  const includeNormalRange = template?.include_normal_range ?? true;
  const includeAbnormalFlag = template?.include_abnormal_flag ?? true;
  const includeNotes = template?.include_notes ?? false;
  const resultFormat = template?.result_format || "table";
  const templateContext: ReportTemplatePreviewContext = {
    patient_name: data.patient.full_name,
    patient_id: data.patient.patient_id,
    phone: formatPhoneForDisplay(data.patient.phone),
    test_name: data.tests.length === 1 ? data.tests[0].test_name : "Multiple Tests",
    test_date: formatAppDate(data.test_date),
    report_date: formatAppDate(resolvedReportDate),
    lab_name: data.lab_name || branding.name,
    lab_code: data.lab_code || "",
    collection_center: data.collection_center_code || data.collection_center_name || "",
    entered_by: data.entered_by || branding.name,
  };
  const headerText = template?.header_template
    ? renderReportTemplateText(template.header_template, templateContext)
    : "";
  const footerText = template?.footer_template
    ? renderReportTemplateText(template.footer_template, templateContext)
    : "";
  const reportHasWebsite = hasWebsiteReference(headerText, branding.website) || hasWebsiteReference(footerText, branding.website);
  const emailLine = reportHasWebsite
    ? `Email: ${branding.email}`
    : `Email: ${branding.email} | Website: ${branding.website}`;
  
  // Always reserve space for header area (for pre-printed paper compatibility)
  const HEADER_RESERVED_HEIGHT = 55;
  let contentStartY = HEADER_RESERVED_HEIGHT; // Always start content after header space
  
  // Header with lab branding (only if includeHeader is true)
  if (options.includeHeader !== false) {
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 45, "F");
    
    // Add logo on the left side
    try {
      const logoWidth = 30;
      const logoHeight = 30;
      const logoX = 14;
      const logoY = 7.5; // Center vertically in header (45/2 - 30/2 = 7.5)
      
      // jsPDF can handle image URLs directly
      doc.addImage(branding.logoUrl, 'PNG', logoX, logoY, logoWidth, logoHeight);
    } catch (error) {
      console.warn("Could not load logo image:", error);
      // Continue without logo if image fails to load
    }
    
    // Adjust text position to accommodate logo
    const textStartX = 50; // Start text after logo
    const centerX = pageWidth / 2;
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    // Header always uses the main brand name
    doc.text(branding.name, centerX, 12, { align: "center" });
    
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(branding.address, centerX, 21, { align: "center" });
    doc.text(`Phone: ${branding.phone}`, centerX, 27, { align: "center" });
    doc.text(emailLine, centerX, 33, { align: "center" });
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
  const rightColumnValueX = col2X + 25;
  const patientAge = getPatientAgeLabel(data.patient.date_of_birth);
  
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
  doc.text(formatPhoneForDisplay(data.patient.phone), col1X + 25, patientInfoY + 14);

  doc.setFont("helvetica", "bold");
  doc.text("Sample Collection Date:", col1X, patientInfoY + 21);
  doc.setFont("helvetica", "normal");
  doc.text(formatAppDate(data.sample_collection_date), col1X + 41, patientInfoY + 21);
  
  // Right column
  doc.setFont("helvetica", "bold");
  doc.text("Gender:", col2X, patientInfoY);
  doc.setFont("helvetica", "normal");
  doc.text(data.patient.gender || "N/A", rightColumnValueX, patientInfoY);
  
  doc.setFont("helvetica", "bold");
  doc.text("Blood Group:", col2X, patientInfoY + 7);
  doc.setFont("helvetica", "normal");
  doc.text(data.patient.blood_group || "N/A", rightColumnValueX, patientInfoY + 7);
  
  doc.setFont("helvetica", "bold");
  doc.text("Age:", col2X, patientInfoY + 14);
  doc.setFont("helvetica", "normal");
  doc.text(patientAge || "N/A", rightColumnValueX, patientInfoY + 14);

  doc.setFont("helvetica", "bold");
  doc.text("Report Date:", col2X, patientInfoY + 21);
  doc.setFont("helvetica", "normal");
  doc.text(formatAppDate(resolvedReportDate), rightColumnValueX, patientInfoY + 21);
  
  // Registry and collection center info (if available)
  let infoY = patientInfoY + 35; // start after the report date row
  if (data.registry_serial) {
    doc.setFont("helvetica", "bold");
    doc.text("Registry No:", col1X, infoY);
    doc.setFont("helvetica", "normal");
    doc.text(data.registry_serial, col1X + 25, infoY);
    infoY += 7;
  }
  if (data.collection_center_name) {
    doc.setFont("helvetica", "bold");
    doc.text("Center:", col1X, infoY);
    doc.setFont("helvetica", "normal");
    // Show only collection center code if available, otherwise show shortened name
    const centerDisplay = data.collection_center_code || (data.collection_center_name.length > 20 ? data.collection_center_name.substring(0, 20) + "..." : data.collection_center_name);
    doc.text(centerDisplay, col1X + 25, infoY);
    infoY += 7;
  }

  // Test Results Section - calculate start Y position based on optional patient metadata rows
  let testResultsStartY = (data.collection_center_name || data.registry_serial)
    ? infoY + 5
    : patientInfoY + 40;

  if (headerText) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const headerLines = doc.splitTextToSize(headerText, pageWidth - 28);
    doc.text(headerLines, 14, testResultsStartY);
    testResultsStartY += headerLines.length * 4 + 4;
  }

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TEST RESULTS", 14, testResultsStartY);
  
  doc.line(14, testResultsStartY + 2, pageWidth - 14, testResultsStartY + 2);

  const parseNumber = (value: number | string | null | undefined) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const buildRangeText = (
    min: number | string | null | undefined,
    max: number | string | null | undefined,
    text: string | null | undefined
  ) => {
    if (text) return text;
    const minValue = parseNumber(min);
    const maxValue = parseNumber(max);
    if (minValue !== null && maxValue !== null) return `${minValue} - ${maxValue}`;
    if (minValue !== null) return `≥ ${minValue}`;
    if (maxValue !== null) return `≤ ${maxValue}`;
    return "-";
  };

  const isItemAbnormal = (
    value: number | string | null | undefined,
    min: number | string | null | undefined,
    max: number | string | null | undefined
  ) => {
    const numericValue = parseNumber(value);
    if (numericValue === null) return false;
    const minValue = parseNumber(min);
    const maxValue = parseNumber(max);
    if (minValue !== null && numericValue < minValue) return true;
    if (maxValue !== null && numericValue > maxValue) return true;
    return false;
  };

  if (resultFormat === "list") {
    const listData = data.tests.flatMap((test) => {
      const buildListRow = (label: string, value: string, notes?: string | null) => {
        let display = value;
        if (includeNotes && notes) {
          display = `${display} | Notes: ${notes}`;
        }
        return [label, display];
      };

      if (test.result_items && test.result_items.length > 0) {
        return test.result_items.map((item, index) => {
          const normalRange = buildRangeText(
            item.normal_range_min,
            item.normal_range_max,
            item.normal_range_text
          );
          const resultDisplay = item.value !== null && item.value !== undefined
            ? `${item.value} ${item.unit || ""}`.trim()
            : "Pending";
          const extras = [];
          if (includeNormalRange) extras.push(`Range: ${normalRange}`);
          if (includeAbnormalFlag) {
            extras.push(isItemAbnormal(item.value, item.normal_range_min, item.normal_range_max) ? "ABN" : "OK");
          }
          const value = extras.length > 0 ? `${resultDisplay} (${extras.join(" • ")})` : resultDisplay;
          return buildListRow(
            `${test.test_name} - ${item.name || "Item"}`,
            value,
            includeNotes && index === 0 ? test.notes : null
          );
        });
      }

      const normalRange = buildRangeText(
        test.normal_range_min,
        test.normal_range_max,
        test.normal_range_text || null
      );

      const resultDisplay = test.result_value !== null
        ? `${test.result_value} ${test.result_unit || ""}`.trim()
        : test.result || "Pending";
      const extras = [];
      if (includeNormalRange) extras.push(`Range: ${normalRange}`);
      if (includeAbnormalFlag) {
        extras.push(test.is_abnormal ? "ABN" : "OK");
      }
      const value = extras.length > 0 ? `${resultDisplay} (${extras.join(" • ")})` : resultDisplay;
      return [buildListRow(test.test_name, value, test.notes)];
    });

    autoTable(doc, {
      startY: testResultsStartY + 8,
      head: [["Test", "Result"]],
      body: listData,
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
        1: { cellWidth: pageWidth - 28 - 60 }
      }
    });
  } else {
    const headers = ["Test Name", "Result", "Unit"];
    if (includeNormalRange) headers.push("Normal Range");
    if (includeNotes) headers.push("Notes");
    if (includeAbnormalFlag) headers.push("Status");

    const tableData = data.tests.flatMap((test) => {
      const makeRow = (
        name: string,
        resultDisplay: string,
        unit: string,
        normalRange: string,
        notes: string | null,
        status: string
      ) => {
        const row = [name, resultDisplay, unit];
        if (includeNormalRange) row.push(normalRange);
        if (includeNotes) row.push(notes || "-");
        if (includeAbnormalFlag) row.push(status);
        return row;
      };

      if (test.result_items && test.result_items.length > 0) {
        return test.result_items.map((item, index) => {
          const normalRange = buildRangeText(
            item.normal_range_min,
            item.normal_range_max,
            item.normal_range_text
          );
          const resultDisplay = item.value !== null && item.value !== undefined
            ? `${item.value} ${item.unit || ""}`.trim()
            : "Pending";
          const status = includeAbnormalFlag
            ? (isItemAbnormal(item.value, item.normal_range_min, item.normal_range_max) ? "ABN" : "OK")
            : "";
          return makeRow(
            `${test.test_name} - ${item.name || "Item"}`,
            resultDisplay,
            item.unit || "-",
            normalRange,
            index === 0 ? test.notes || null : null,
            status
          );
        });
      }

      const normalRange = buildRangeText(
        test.normal_range_min,
        test.normal_range_max,
        test.normal_range_text || null
      );

      const resultDisplay = test.result_value !== null
        ? `${test.result_value} ${test.result_unit || ""}`.trim()
        : test.result || "Pending";

      return [makeRow(
        test.test_name,
        resultDisplay,
        test.result_unit || "-",
        normalRange,
        test.notes || null,
        includeAbnormalFlag ? (test.is_abnormal ? "ABN" : "OK") : ""
      )];
    });

    const availableWidth = pageWidth - 28;
    const baseWeights = [
      4,
      2,
      1,
      includeNormalRange ? 2 : 0,
      includeNotes ? 2 : 0,
      includeAbnormalFlag ? 1 : 0
    ].filter((w) => w > 0);
    const totalWeight = baseWeights.reduce((sum, w) => sum + w, 0) || 1;
    const unitWidth = availableWidth / totalWeight;
    const widths = [];
    widths.push(4 * unitWidth);
    widths.push(2 * unitWidth);
    widths.push(1 * unitWidth);
    if (includeNormalRange) widths.push(2 * unitWidth);
    if (includeNotes) widths.push(2 * unitWidth);
    if (includeAbnormalFlag) widths.push(1 * unitWidth);

    const statusColumnIndex = includeAbnormalFlag ? headers.length - 1 : -1;

    autoTable(doc, {
      startY: testResultsStartY + 8,
      head: [headers],
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
      columnStyles: widths.reduce((acc, width, index) => {
        acc[index] = {
          cellWidth: width,
          halign: index === 0 ? "left" : "center"
        };
        return acc;
      }, {} as Record<number, { cellWidth: number; halign: "left" | "center" }>),
      didParseCell: (data) => {
        if (includeAbnormalFlag && data.section === "body" && data.column.index === statusColumnIndex) {
          data.cell.text = [""];
          const rowData = tableData[data.row.index];
          if (rowData && rowData[statusColumnIndex] === "ABN") {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
      didDrawCell: (data) => {
        if (!includeAbnormalFlag) return;
        if (data.section === "body" && data.column.index === statusColumnIndex) {
          const rowData = tableData[data.row.index];
          if (!rowData) return;
          const status = rowData[statusColumnIndex];
          const cellX = data.cell.x;
          const cellY = data.cell.y;
          const cellW = data.cell.width;
          const cellH = data.cell.height;
          const centerX = cellX + cellW / 2;
          const centerY = cellY + cellH / 2;
          const size = 2.5;

          if (status === "ABN") {
            doc.setFillColor(220, 38, 38);
            doc.triangle(
              centerX,
              centerY - size,
              centerX - size,
              centerY + size,
              centerX + size,
              centerY + size,
              "F"
            );
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.text("!", centerX, centerY + 2, { align: "center" });
          } else {
            doc.setDrawColor(16, 185, 129);
            doc.setLineWidth(0.8);
            doc.line(centerX - size, centerY, centerX - size / 3, centerY + size / 1.2);
            doc.line(centerX - size / 3, centerY + size / 1.2, centerX + size, centerY - size / 1.2);
          }
        }
      }
    });
  }

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
  
  if (footerText) {
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const footerLines = doc.splitTextToSize(footerText, pageWidth - 28);
    const footerTextHeight = footerLines.length * 4;
    let footerTextY = finalY + 18;
    if (footerTextY + footerTextHeight > footerStartY - 6) {
      doc.addPage();
      footerTextY = 20;
    }
    doc.text(footerLines, 14, footerTextY);
  }

  // Only include footer content if option is true
  if (options.includeFooter !== false) {
    const footerY = footerStartY;
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(branding.reportFooterNote, 14, footerY);
    doc.text(`Generated on: ${formatAppDateTime(new Date())}`, 14, footerY + 5);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(14, footerY + 12, pageWidth - 14, footerY + 12);
    
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text(`${branding.name} - ${branding.reportTagline}`, pageWidth / 2, footerY + 19, { align: "center" });
    if (!reportHasWebsite && options.includeHeader === false) {
      doc.text(emailLine, pageWidth / 2, footerY + 24, { align: "center" });
    }
  }
  // If not including footer, space is still reserved (empty) for pre-printed paper

    await addReportWatermark(doc, options, branding.logoUrl);

    // Save the PDF
    const fileName = `${data.patient.patient_id}_${format(new Date(resolvedReportDate), "yyyy-MM-dd")}_report.pdf`;
    doc.save(fileName);
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};

export const generateMultiTestReportPDF = async (
  patient: PatientInfo,
  tests: Array<{
    id: string;
    test_id?: string | null;
    category?: string | null;
    test_name: string;
    test_date: string;
    created_at?: string | null;
    status: string;
    result: string | null;
    result_value?: number | null;
    result_unit?: string | null;
    result_items?: Array<{
      name: string;
      value: number | string | null;
      unit: string | null;
      normal_range_min: number | null;
      normal_range_max: number | null;
      normal_range_text: string | null;
    }> | null;
    registry_serial?: string | null;
    notes?: string | null;
    is_abnormal?: boolean;
    normal_range_text?: string;
    entered_by_name?: string;
    lab_id?: string | null;
    lab_name?: string;
    lab_code?: string;
    collection_center_name?: string;
    collection_center_code?: string;
  }>,
  enteredByName?: string,
  options?: ReportOptions,
  templateId?: string,
  branding?: ReportBranding
) => {
  const completedTests = tests.filter(t => t.status === "completed");
  
  if (completedTests.length === 0) {
    return false;
  }

  const testResults: TestResult[] = completedTests.map(t => ({
    test_id: t.test_id || null,
    category: t.category || null,
    test_name: t.test_name,
    result: t.result,
    result_value: t.result_value || null,
    result_unit: t.result_unit || null,
    result_items: t.result_items || null,
    registry_serial: t.registry_serial || null,
    is_abnormal: t.is_abnormal || false,
    normal_range_text: t.normal_range_text,
    notes: t.notes || null
  }));

  // Get entered by name from the first test that has it, or use passed parameter
  const employeeName = enteredByName || completedTests.find(t => t.entered_by_name)?.entered_by_name;
  
  // Get lab and collection center from the first test (assuming all tests in a batch are from the same lab/center)
  const firstTest = completedTests[0];
  let labName = firstTest.lab_name;
  let labCode = firstTest.lab_code;
  const sampleCollectionDate = getSampleCollectionDate(completedTests);

  // If lab details weren't populated in the caller, try to resolve them from Supabase
  if ((!labName || !labCode) && firstTest.lab_id) {
    try {
      let labQuery = supabase
        .from("labs")
        .select("name, lab_code")
        .eq("id", firstTest.lab_id);

      if (branding?.organizationId) {
        labQuery = labQuery.eq("organization_id" as any, branding.organizationId);
      }

      const { data: labRow } = await labQuery.maybeSingle();
      
      if (labRow) {
        labName = labName || labRow.name;
        labCode = labCode || labRow.lab_code;
      }
    } catch (error) {
      console.warn("Could not resolve lab info for report:", error);
    }
  }

  const template = await resolveReportTemplate(testResults, templateId, branding?.organizationId);

  await generateTestReportPDF({
    patient,
    test_date: completedTests[0].test_date,
    sample_collection_date: sampleCollectionDate,
    tests: testResults,
    lab_name: labName || branding?.name || LAB_INFO.name,
    lab_code: labCode,
    collection_center_name: firstTest.collection_center_name,
    collection_center_code: firstTest.collection_center_code,
    entered_by: employeeName,
    registry_serial: firstTest.registry_serial || undefined,
    options,
    template,
    branding
  });

  return true;
};
