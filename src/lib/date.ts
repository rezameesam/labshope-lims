import { format, isValid, parse, parseISO } from "date-fns";

type DateValue = Date | string | null | undefined;

/** IANA timezone for the app — Asia/Kolkata (IST, UTC+05:30) */
export const APP_TIMEZONE = "Asia/Kolkata";

/**
 * Convert any date value to a Date in IST context.
 * For display purposes, we shift the date to IST so that
 * format() outputs the correct IST representation.
 */
function toIST(date: Date): Date {
  // Get the UTC offset for IST (+5:30 = 330 minutes)
  const istOffsetMs = 330 * 60 * 1000;
  const localOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() + localOffsetMs + istOffsetMs);
}

function parseDateValue(value: DateValue): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  const normalized = value.trim();
  if (!normalized) return null;

  const parsed =
    /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? parseISO(`${normalized}T00:00:00`)
      : parseISO(normalized);

  if (isValid(parsed)) {
    return parsed;
  }

  const fallback = new Date(normalized);
  return isValid(fallback) ? fallback : null;
}

/**
 * Format a date value using IST timezone.
 * Uses Intl.DateTimeFormat for accurate timezone conversion.
 */
function formatInIST(value: DateValue, fmt: string, fallback: string): string {
  const parsed = parseDateValue(value);
  if (!parsed) return fallback;

  // For date-only strings (yyyy-MM-dd), don't shift timezone — treat as calendar date
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return format(parsed, fmt);
  }

  // For timestamps, shift to IST
  const ist = toIST(parsed);
  return format(ist, fmt);
}

/** dd/MM/yyyy in IST */
export function formatAppDate(value: DateValue, fallback = "-") {
  return formatInIST(value, "dd/MM/yyyy", fallback);
}

/** dd/MM/yyyy, HH:mm in IST */
export function formatAppDateTime(value: DateValue, fallback = "-") {
  return formatInIST(value, "dd/MM/yyyy, HH:mm", fallback);
}

/** dd/MM/yyyy, HH:mm:ss in IST */
export function formatAppDateTimeWithSeconds(value: DateValue, fallback = "-") {
  return formatInIST(value, "dd/MM/yyyy, HH:mm:ss", fallback);
}

/** dd/MM/yyyy, hh:mm a in IST */
export function formatAppDateTimeWithMeridiem(value: DateValue, fallback = "-") {
  return formatInIST(value, "dd/MM/yyyy, hh:mm a", fallback);
}

/** Format a date for report headers: dd/MM/yyyy */
export function formatReportDate(value: DateValue, fallback = "-") {
  return formatInIST(value, "dd/MM/yyyy", fallback);
}

/** Format a date+time for print footers: dd/MM/yyyy, hh:mm a IST */
export function formatPrintTimestamp() {
  const now = toIST(new Date());
  return format(now, "dd/MM/yyyy, hh:mm a") + " IST";
}

/** Get today's date as yyyy-MM-dd in IST */
export function todayIST(): string {
  const now = toIST(new Date());
  return format(now, "yyyy-MM-dd");
}

/** Get start of current month as yyyy-MM-dd in IST */
export function startOfMonthIST(): string {
  const now = toIST(new Date());
  return format(now, "yyyy-MM") + "-01";
}

// ── Indian Financial Year (Apr 1 – Mar 31) ──────────────────

export interface FinancialYear {
  /** e.g. "2025-26" */
  label: string;
  /** yyyy-MM-dd */
  start: string;
  /** yyyy-MM-dd */
  end: string;
}

/** Get the FY that contains a given date (defaults to today IST) */
export function getFinancialYear(dateStr?: string): FinancialYear {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : toIST(new Date());
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed

  // FY starts Apr (month 3). If Jan–Mar, FY started previous calendar year.
  const fyStartYear = month >= 3 ? year : year - 1;
  const fyEndYear = fyStartYear + 1;

  return {
    label: `${fyStartYear}-${String(fyEndYear).slice(2)}`,
    start: `${fyStartYear}-04-01`,
    end: `${fyEndYear}-03-31`,
  };
}

/** Get the previous FY */
export function getPreviousFinancialYear(dateStr?: string): FinancialYear {
  const current = getFinancialYear(dateStr);
  const prevStartYear = parseInt(current.start.slice(0, 4)) - 1;
  return getFinancialYear(`${prevStartYear}-04-01`);
}

/** Get a list of recent financial years (current + N previous) */
export function getRecentFinancialYears(count = 5): FinancialYear[] {
  const years: FinancialYear[] = [];
  let fy = getFinancialYear();
  for (let i = 0; i < count; i++) {
    years.push(fy);
    fy = getPreviousFinancialYear(fy.start);
  }
  return years;
}

/** Get current quarter within the Indian FY (Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar) */
export function getCurrentQuarter(dateStr?: string): { label: string; quarter: number; start: string; end: string } {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : toIST(new Date());
  const month = d.getMonth(); // 0-indexed
  const year = d.getFullYear();

  if (month >= 3 && month <= 5) return { label: "Q1 (Apr–Jun)", quarter: 1, start: `${year}-04-01`, end: `${year}-06-30` };
  if (month >= 6 && month <= 8) return { label: "Q2 (Jul–Sep)", quarter: 2, start: `${year}-07-01`, end: `${year}-09-30` };
  if (month >= 9 && month <= 11) return { label: "Q3 (Oct–Dec)", quarter: 3, start: `${year}-10-01`, end: `${year}-12-31` };
  // Jan–Mar
  return { label: "Q4 (Jan–Mar)", quarter: 4, start: `${year}-01-01`, end: `${year}-03-31` };
}

export function formatDateInputDisplay(value: string) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatAppDate(value, "");
  }

  const digits = value.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join("/");
}

export function parseDateInputValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = parse(trimmed, "dd/MM/yyyy", new Date());
  if (!isValid(parsed) || format(parsed, "dd/MM/yyyy") !== trimmed) {
    return "";
  }

  return format(parsed, "yyyy-MM-dd");
}
