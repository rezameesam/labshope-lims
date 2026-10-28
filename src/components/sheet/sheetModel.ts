export type CellValue = string | number | null | undefined;

export interface SortState {
  columnId: string;
  dir: "asc" | "desc";
}

const isEmpty = (value: CellValue) => value === null || value === undefined || value === "";

/** Empty cells always sort last; numbers sort numerically; text sorts naturally ("T2" < "T10"). */
export function compareValues(a: CellValue, b: CellValue): number {
  const emptyA = isEmpty(a);
  const emptyB = isEmpty(b);
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows<T>(rows: T[], valueOf: (row: T) => CellValue, dir: "asc" | "desc"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: valueOf(row) }))
    .sort((x, y) => {
      // Keep blanks at the bottom whichever way we sort.
      const emptyX = isEmpty(x.value);
      const emptyY = isEmpty(y.value);
      if (emptyX || emptyY) return emptyX === emptyY ? x.index - y.index : emptyX ? 1 : -1;
      return sign * compareValues(x.value, y.value) || x.index - y.index;
    })
    .map((entry) => entry.row);
}

const NUMERIC_FILTER = /^(>=|<=|!=|>|<|=)\s*(-?\d+(?:\.\d+)?)$/;
const RANGE_FILTER = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/;

/**
 * Column filter syntax, close to what people expect from a spreadsheet:
 *   text        contains (case-insensitive)
 *   =text       exactly equals;  "=" alone matches blank cells
 *   !text       does not contain
 *   >100 <=50 =300 !=0   numeric comparisons
 *   10..20      numeric range, inclusive
 */
export function parseFilter(input: string): (value: CellValue) => boolean {
  const text = input.trim();
  if (!text) return () => true;

  const range = text.match(RANGE_FILTER);
  if (range) {
    const low = Math.min(Number(range[1]), Number(range[2]));
    const high = Math.max(Number(range[1]), Number(range[2]));
    return (value) => !isEmpty(value) && Number.isFinite(Number(value)) && Number(value) >= low && Number(value) <= high;
  }

  const numeric = text.match(NUMERIC_FILTER);
  if (numeric) {
    const target = Number(numeric[2]);
    const compare: Record<string, (n: number) => boolean> = {
      ">": (n) => n > target,
      "<": (n) => n < target,
      ">=": (n) => n >= target,
      "<=": (n) => n <= target,
      "=": (n) => n === target,
      "!=": (n) => n !== target,
    };
    const test = compare[numeric[1]];
    return (value) => {
      if (isEmpty(value) || !Number.isFinite(Number(value))) return numeric[1] === "!=";
      return test(Number(value));
    };
  }

  if (text === "=") return (value) => isEmpty(value);
  if (text.startsWith("=")) {
    const exact = text.slice(1).trim().toLowerCase();
    return (value) => String(value ?? "").trim().toLowerCase() === exact;
  }
  if (text.startsWith("!")) {
    const needle = text.slice(1).trim().toLowerCase();
    return (value) => !String(value ?? "").toLowerCase().includes(needle);
  }

  const needle = text.toLowerCase();
  return (value) => String(value ?? "").toLowerCase().includes(needle);
}

/** Tab-separated text exactly as Excel and Google Sheets copy it. */
export function toTsv(rows: string[][]): string {
  const escape = (field: string) => (/[\t\n\r"]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field);
  return rows.map((row) => row.map(escape).join("\t")).join("\n");
}

/** Parses clipboard text from Excel / Sheets / this grid into rows of cells. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      inQuotes = true;
    } else if (char === "\t") {
      endField();
    } else if (char === "\n") {
      endRow();
    } else if (char === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += char;
    }
  }
  // A trailing newline (always present when copying from Excel) is not an extra row.
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

/**
 * Cells that start with = + - @ would run as formulas when the CSV is opened in
 * Excel (CSV injection). Prefix such text with an apostrophe; real numbers stay numbers.
 */
export const neutralizeFormula = (field: string) =>
  FORMULA_START.test(field) && !PLAIN_NUMBER.test(field) ? `'${field}` : field;

const CSV_BOM = "\uFEFF";

/** CSV with a BOM so Excel reads UTF-8 (₹, Indian names) correctly. */
export function toCsv(headers: string[], rows: string[][]): string {
  const escape = (field: string) => {
    const safe = neutralizeFormula(field);
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [headers, ...rows].map((line) => line.map(escape).join(","));
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

export interface RangeStats {
  count: number;
  numericCount: number;
  sum: number;
  average: number | null;
  min: number | null;
  max: number | null;
}

/** The numbers Excel shows in its status bar for a selection. */
export function rangeStats(values: CellValue[]): RangeStats {
  const filled = values.filter((value) => !isEmpty(value));
  const numbers = filled
    .map((value) => (typeof value === "number" ? value : Number(String(value).replace(/,/g, ""))))
    .filter((value) => Number.isFinite(value));
  const sum = numbers.reduce((total, n) => total + n, 0);
  return {
    count: filled.length,
    numericCount: numbers.length,
    sum,
    average: numbers.length ? sum / numbers.length : null,
    min: numbers.length ? Math.min(...numbers) : null,
    max: numbers.length ? Math.max(...numbers) : null,
  };
}

export interface CellPos {
  row: number;
  col: number;
}

export interface CellRange {
  anchor: CellPos;
  focus: CellPos;
}

export const normalizeRange = ({ anchor, focus }: CellRange) => ({
  top: Math.min(anchor.row, focus.row),
  bottom: Math.max(anchor.row, focus.row),
  left: Math.min(anchor.col, focus.col),
  right: Math.max(anchor.col, focus.col),
});

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Moves the active cell the way spreadsheet keys do. Returns null for keys it doesn't handle. */
export function navigate(
  key: string,
  pos: CellPos,
  size: { rows: number; cols: number },
  options: { ctrl?: boolean; shift?: boolean; page?: number } = {},
): CellPos | null {
  const lastRow = Math.max(size.rows - 1, 0);
  const lastCol = Math.max(size.cols - 1, 0);
  const page = options.page ?? 10;

  switch (key) {
    case "ArrowUp":
      return { row: options.ctrl ? 0 : clamp(pos.row - 1, 0, lastRow), col: pos.col };
    case "ArrowDown":
      return { row: options.ctrl ? lastRow : clamp(pos.row + 1, 0, lastRow), col: pos.col };
    case "ArrowLeft":
      return { row: pos.row, col: options.ctrl ? 0 : clamp(pos.col - 1, 0, lastCol) };
    case "ArrowRight":
      return { row: pos.row, col: options.ctrl ? lastCol : clamp(pos.col + 1, 0, lastCol) };
    case "Home":
      return { row: options.ctrl ? 0 : pos.row, col: 0 };
    case "End":
      return { row: options.ctrl ? lastRow : pos.row, col: lastCol };
    case "PageUp":
      return { row: clamp(pos.row - page, 0, lastRow), col: pos.col };
    case "PageDown":
      return { row: clamp(pos.row + page, 0, lastRow), col: pos.col };
    case "Tab": {
      // Tab wraps to the next/previous row like a spreadsheet.
      if (options.shift) {
        return pos.col > 0
          ? { row: pos.row, col: pos.col - 1 }
          : { row: clamp(pos.row - 1, 0, lastRow), col: pos.row > 0 ? lastCol : 0 };
      }
      return pos.col < lastCol
        ? { row: pos.row, col: pos.col + 1 }
        : { row: clamp(pos.row + 1, 0, lastRow), col: pos.row < lastRow ? 0 : lastCol };
    }
    default:
      return null;
  }
}
