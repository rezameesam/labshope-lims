// Shared types used across ManageTests sub-components

export interface PatientTest {
  id: string;
  patient_id: string;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  registry_serial: string | null;
  result_items: ResultItem[] | null;
  test_package_id: string | null;
  test_package_name: string | null;
  test_package_group_id: string | null;
  is_abnormal: boolean | null;
  normal_range_text: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  updated_by: string | null;
  result_entered_by: string | null;
  result_entered_at: string | null;
  test_id: string | null;
  collected_by: string | null;
  collected_at: string | null;
  lab_id: string | null;
  collection_center_id: string | null;
  external_lab_id: string | null;
  outsource_cost: number | null;
  outsourced_at: string | null;
  patients: {
    patient_id: string;
    full_name: string;
    phone: string;
    gender?: string | null;
    date_of_birth?: string | null;
    blood_group?: string | null;
  };
  labs?: {
    id: string;
    name: string;
    lab_code: string;
  } | null;
  collection_centers?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export interface AuditLog {
  id: string;
  action: string;
  changed_by: string | null;
  changed_by_name?: string | null;
  changed_at: string;
  old_values: any;
  new_values: any;
  notes: string | null;
}

export interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
}

export interface TestCategory {
  id: string;
  name: string;
}

export interface Test {
  id: string;
  test_id: string | null;
  name: string;
  price: number | null;
  category_id: string | null;
  unit: string | null;
  normal_range_text: string | null;
  normal_range_min: number | null;
  normal_range_max: number | null;
}

export interface Doctor {
  id: string;
  name: string;
  specialization: string | null;
  commission_percentage: number | null;
}

export interface TestPackage {
  id: string;
  name: string;
  price: number | null;
  discount_percentage: number | null;
  is_active: boolean | null;
  tests: string[];
}

export interface ReportTemplateOption {
  id: string;
  name: string;
  is_default: boolean | null;
}

export interface ResultItem {
  name: string;
  value: number | string | null;
  unit: string | null;
  normal_range_min: number | null;
  normal_range_max: number | null;
  normal_range_text: string | null;
}

export interface ResultItemInput {
  name: string;
  value: string;
  unit: string;
  normal_range_min: string;
  normal_range_max: string;
  normal_range_text: string;
}

export interface ResultDataState {
  result: string;
  result_value: string;
  result_unit: string;
  normal_range_text: string;
  is_abnormal: boolean;
  status: string;
  result_items: ResultItemInput[];
  registry_serial: string;
}
