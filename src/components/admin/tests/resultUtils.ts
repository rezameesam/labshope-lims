import { ResultItem, ResultItemInput } from "./types";

export const emptyResultItem = (): ResultItemInput => ({
  name: "",
  value: "",
  unit: "",
  normal_range_min: "",
  normal_range_max: "",
  normal_range_text: "",
});

export const parseOptionalNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) ? numberValue : null;
};

export const parseItemValue = (value: string): number | string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) ? numberValue : trimmed;
};

export const getPanelAbnormal = (items: ResultItemInput[]): boolean =>
  items.some((item) => {
    const value = parseOptionalNumber(item.value);
    if (value === null) return false;
    const min = parseOptionalNumber(item.normal_range_min);
    const max = parseOptionalNumber(item.normal_range_max);
    if (min !== null && value < min) return true;
    if (max !== null && value > max) return true;
    return false;
  });

export const normalizePanelItems = (items: ResultItem[] | null): ResultItemInput[] => {
  if (!items || !Array.isArray(items)) return [];
  return items.map((item) => ({
    name: typeof item?.name === "string" ? item.name : "",
    value: item?.value !== null && item?.value !== undefined ? String(item.value) : "",
    unit: typeof item?.unit === "string" ? item.unit : "",
    normal_range_min:
      item?.normal_range_min !== null && item?.normal_range_min !== undefined
        ? String(item.normal_range_min)
        : "",
    normal_range_max:
      item?.normal_range_max !== null && item?.normal_range_max !== undefined
        ? String(item.normal_range_max)
        : "",
    normal_range_text:
      typeof item?.normal_range_text === "string" ? item.normal_range_text : "",
  }));
};

export const serializePanelItems = (items: ResultItemInput[]) =>
  items
    .map((item) => {
      const name = item.name.trim();
      const unit = item.unit.trim();
      const rangeText = item.normal_range_text.trim();
      return {
        name,
        value: parseItemValue(item.value),
        unit: unit || null,
        normal_range_min: parseOptionalNumber(item.normal_range_min),
        normal_range_max: parseOptionalNumber(item.normal_range_max),
        normal_range_text: rangeText || null,
      };
    })
    .filter(
      (item) => item.name || item.value !== null || item.unit || item.normal_range_text
    );

export const getDefaultPanelItems = (testName?: string | null): ResultItemInput[] => {
  const normalizedName = testName?.toLowerCase() || "";
  const isCbc =
    normalizedName.includes("cbc") || normalizedName.includes("complete blood");
  if (!isCbc) return [];
  return [
    { name: "WBC", value: "", unit: "10^9/L", normal_range_min: "3.5", normal_range_max: "10.0", normal_range_text: "" },
    { name: "LYM", value: "", unit: "10^9/L", normal_range_min: "0.5", normal_range_max: "5.0", normal_range_text: "" },
    { name: "MID", value: "", unit: "10^9/L", normal_range_min: "0.1", normal_range_max: "1.5", normal_range_text: "" },
    { name: "GRAN", value: "", unit: "10^9/L", normal_range_min: "1.2", normal_range_max: "8.0", normal_range_text: "" },
    { name: "LYM%", value: "", unit: "%", normal_range_min: "15.0", normal_range_max: "50.0", normal_range_text: "" },
    { name: "MID%", value: "", unit: "%", normal_range_min: "2.0", normal_range_max: "15.0", normal_range_text: "" },
    { name: "GRA%", value: "", unit: "%", normal_range_min: "35.0", normal_range_max: "80.0", normal_range_text: "" },
    { name: "HGB", value: "", unit: "g/dL", normal_range_min: "11.5", normal_range_max: "16.5", normal_range_text: "" },
    { name: "RBC", value: "", unit: "10^12/L", normal_range_min: "3.50", normal_range_max: "5.50", normal_range_text: "" },
    { name: "MCV", value: "", unit: "fL", normal_range_min: "75.0", normal_range_max: "100.0", normal_range_text: "" },
    { name: "HCT", value: "", unit: "%", normal_range_min: "35.0", normal_range_max: "50.0", normal_range_text: "" },
    { name: "MCH", value: "", unit: "pg", normal_range_min: "25.0", normal_range_max: "35.0", normal_range_text: "" },
    { name: "MCHC", value: "", unit: "g/dL", normal_range_min: "31.0", normal_range_max: "38.0", normal_range_text: "" },
    { name: "RDW%", value: "", unit: "%", normal_range_min: "11.0", normal_range_max: "16.0", normal_range_text: "" },
    { name: "RDWa", value: "", unit: "fL", normal_range_min: "30.0", normal_range_max: "150.0", normal_range_text: "" },
    { name: "PLT", value: "", unit: "10^9/L", normal_range_min: "100", normal_range_max: "400", normal_range_text: "" },
    { name: "MPV", value: "", unit: "fL", normal_range_min: "8.0", normal_range_max: "11.0", normal_range_text: "" },
    { name: "PCT", value: "", unit: "%", normal_range_min: "0.01", normal_range_max: "9.99", normal_range_text: "" },
    { name: "PDW", value: "", unit: "fL", normal_range_min: "0.1", normal_range_max: "99.9", normal_range_text: "" },
    { name: "LPCR", value: "", unit: "%", normal_range_min: "0.1", normal_range_max: "99.9", normal_range_text: "" },
  ];
};
