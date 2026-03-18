export interface TestResult {
  id: string;
  test_id?: string | null;
  test_name: string;
  test_date: string;
  status: string;
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
  test_package_id?: string | null;
  test_package_name?: string | null;
  test_package_group_id?: string | null;
  is_abnormal: boolean;
  normal_range_text?: string | null;
  notes: string | null;
  category?: string;
  entered_by_name?: string;
  created_at?: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
  labs?: { id: string; name: string; lab_code: string } | null;
  collection_centers?: { id: string; name: string; code: string } | null;
}

export interface PatientInfo {
  full_name: string;
  patient_id: string;
  phone: string;
  gender?: string | null;
  date_of_birth?: string | null;
  blood_group?: string | null;
}

export type CompletedResultRow =
  | { kind: "single"; test: TestResult }
  | { kind: "package"; groupId: string; tests: TestResult[] };

export function getResultSummary(test: TestResult): string {
  if (test.result_items && test.result_items.length > 0) {
    return `Panel (${test.result_items.length})`;
  }
  if (test.result_value !== null) {
    return String(test.result_value);
  }
  return test.result || "-";
}

export function getDetailedResultText(test: TestResult): string {
  if (test.result_items && test.result_items.length > 0) {
    return `Panel (${test.result_items.length} items)`;
  }
  if (test.result_value !== null) {
    return `${test.result_value} ${test.result_unit || ""}`.trim();
  }
  return test.result || "N/A";
}

export function getRangeText(item: NonNullable<TestResult["result_items"]>[number]): string {
  return (
    item.normal_range_text ||
    (item.normal_range_min !== null && item.normal_range_max !== null
      ? `${item.normal_range_min} - ${item.normal_range_max}`
      : item.normal_range_min !== null
        ? `>= ${item.normal_range_min}`
        : item.normal_range_max !== null
          ? `<= ${item.normal_range_max}`
          : "-")
  );
}

export function isItemAbnormal(item: NonNullable<TestResult["result_items"]>[number]): boolean {
  const val = Number(item.value);
  if (isNaN(val)) return false;
  if (item.normal_range_min !== null && val < item.normal_range_min) return true;
  if (item.normal_range_max !== null && val > item.normal_range_max) return true;
  return false;
}
