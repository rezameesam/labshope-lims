/**
 * Exports an array of objects as a CSV file that opens in Excel.
 * @param filename  Desired filename without extension (e.g. "patients")
 * @param columns   Array of { key, label } descriptors
 * @param rows      Array of data objects
 */
export function exportToExcel<T extends Record<string, unknown>>(
  filename: string,
  columns: { key: keyof T; label: string }[],
  rows: T[]
): void {
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    // Wrap in quotes if the value contains comma, quote, or newline
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escape(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(","))
    .join("\n");

  // UTF-8 BOM so Excel opens it correctly (especially for Indian names)
  const csv = "\uFEFF" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
