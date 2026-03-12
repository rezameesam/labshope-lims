import { useState, useEffect, useMemo, Fragment, startTransition } from "react";
import { Plus, Search, CheckCircle, Clock, AlertCircle, Calendar, History, User, X, Printer, Building2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateMultiTestReportPDF } from "@/components/patient/TestReportPDF";
import { useLab } from "@/contexts/LabContext";
import { formatAppDate, formatAppDateTime } from "@/lib/date";

interface PatientTest {
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
  patients: {
    patient_id: string;
    full_name: string;
    phone: string;
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

interface AuditLog {
  id: string;
  action: string;
  changed_by: string | null;
  changed_by_name?: string | null;
  changed_at: string;
  old_values: any;
  new_values: any;
  notes: string | null;
}

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
}

interface TestCategory {
  id: string;
  name: string;
}

interface Test {
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

interface Doctor {
  id: string;
  name: string;
  specialization: string | null;
  commission_percentage: number | null;
}

interface TestPackage {
  id: string;
  name: string;
  price: number | null;
  discount_percentage: number | null;
  is_active: boolean | null;
  tests: string[];
}

interface ReportTemplateOption {
  id: string;
  name: string;
  is_default: boolean | null;
}

interface ManageTestsProps {
  preselectedPatient?: Patient | null;
}

interface ResultItem {
  name: string;
  value: number | string | null;
  unit: string | null;
  normal_range_min: number | null;
  normal_range_max: number | null;
  normal_range_text: string | null;
}

interface ResultItemInput {
  name: string;
  value: string;
  unit: string;
  normal_range_min: string;
  normal_range_max: string;
  normal_range_text: string;
}

interface ResultDataState {
  result: string;
  result_value: string;
  result_unit: string;
  normal_range_text: string;
  is_abnormal: boolean;
  status: string;
  result_items: ResultItemInput[];
  registry_serial: string;
}

const ManageTests = ({ preselectedPatient }: ManageTestsProps) => {
  const { user, isCollector } = useAuth();
  const { currentLab, availableLabs } = useLab();

  const [tests, setTests] = useState<PatientTest[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [testCatalog, setTestCatalog] = useState<Test[]>([]);
  const [testPackages, setTestPackages] = useState<TestPackage[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [labs, setLabs] = useState<Array<{ id: string; name: string; lab_code: string }>>([]);
  const [collectionCenters, setCollectionCenters] = useState<Array<{ id: string; name: string; code: string; lab_id: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "in_progress" | "completed">("all");
  const [labFilter, setLabFilter] = useState<string>("all");
  const [collectionCenterFilter, setCollectionCenterFilter] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isResultDialogOpen, setIsResultDialogOpen] = useState(false);
  const [isAuditDialogOpen, setIsAuditDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [isDialogContentReady, setIsDialogContentReady] = useState(false);
  const [selectedTest, setSelectedTest] = useState<PatientTest | null>(null);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<string>("none");
  const [appliedPackage, setAppliedPackage] = useState<TestPackage | null>(null);
  const [showPackageTestsIndividually, setShowPackageTestsIndividually] = useState(false);
  const [expandedPackageGroups, setExpandedPackageGroups] = useState<Set<string>>(new Set());
  const [formData, setFormData] = useState({
    test_date: new Date().toISOString().split("T")[0],
    notes: "",
    referred_by: "self" as string,
    custom_doctor_name: "",
    lab_id: "",
    collection_center_id: "",
  });
  const [resultData, setResultData] = useState<ResultDataState>({
    result: "",
    result_value: "",
    result_unit: "",
    normal_range_text: "",
    is_abnormal: false,
    status: "completed",
    result_items: [],
    registry_serial: "",
  });

  const resolveUserDisplayNames = async (userIds: string[]) => {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    const nameMap = new Map<string, string>();

    if (uniqueIds.length === 0) {
      return nameMap;
    }

    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("user_id, full_name")
      .in("user_id", uniqueIds);

    if (employeesError) throw employeesError;

    (employeesData || []).forEach((employee) => {
      if (employee.user_id) {
        nameMap.set(employee.user_id, employee.full_name);
      }
    });

    const missingIds = uniqueIds.filter((userId) => !nameMap.has(userId));
    if (missingIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", missingIds);

      if (profilesError) throw profilesError;

      (profilesData || []).forEach((profile) => {
        if (profile.user_id) {
          nameMap.set(profile.user_id, profile.full_name);
        }
      });
    }

    return nameMap;
  };
  const [usePanelResults, setUsePanelResults] = useState(false);
  const [printOptions, setPrintOptions] = useState({
    includeHeader: true,
    includeFooter: true,
    includeWatermark: true,
  });
  const [reportTemplates, setReportTemplates] = useState<ReportTemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("auto");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter patients by search
  const filteredPatients = useMemo(() => {
    if (!patientSearch.trim()) return patients.slice(0, 10);
    const searchLower = patientSearch.toLowerCase();
    return patients.filter(
      (p) =>
        p.full_name.toLowerCase().includes(searchLower) ||
        p.patient_id.toLowerCase().includes(searchLower) ||
        p.phone.includes(patientSearch)
    ).slice(0, 20);
  }, [patients, patientSearch]);

  useEffect(() => {
    if (!preselectedPatient) return;

    setSelectedPatient(preselectedPatient);
    setPatientSearch("");

    const patientLabId = preselectedPatient.lab_id || currentLab?.id || "";
    let patientCollectionCenterId = preselectedPatient.collection_center_id || "";

    if (patientCollectionCenterId && patientLabId) {
      const isValidCollectionCenter = collectionCenters.some(
        (center) => center.id === patientCollectionCenterId && center.lab_id === patientLabId
      );
      if (!isValidCollectionCenter) {
        patientCollectionCenterId = "";
      }
    } else if (patientCollectionCenterId && !patientLabId) {
      patientCollectionCenterId = "";
    }

    setFormData((prev) => ({
      ...prev,
      lab_id: patientLabId,
      collection_center_id: patientCollectionCenterId,
    }));
  }, [preselectedPatient, currentLab, collectionCenters]);

  useEffect(() => {
    if (!isDialogOpen) {
      setIsDialogContentReady(false);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      startTransition(() => {
        setIsDialogContentReady(true);
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [isDialogOpen]);

  // Group tests by category
  const testsByCategory = useMemo(() => {
    const grouped: Record<string, Test[]> = {};
    const uncategorized: Test[] = [];
    
    testCatalog.forEach((test) => {
      if (test.category_id) {
        const category = categories.find((c) => c.id === test.category_id);
        const categoryName = category?.name || "Other";
        if (!grouped[categoryName]) grouped[categoryName] = [];
        grouped[categoryName].push(test);
      } else {
        uncategorized.push(test);
      }
    });
    
    if (uncategorized.length > 0) {
      grouped["Other Tests"] = uncategorized;
    }
    
    return grouped;
  }, [testCatalog, categories]);

  const selectedTestsTotal = useMemo(() => {
    const packageTestNames = appliedPackage
      ? new Set(
          testCatalog
            .filter((test) => appliedPackage.tests.includes(test.id))
            .map((test) => test.name)
        )
      : new Set<string>();
    const hasPackageTests = appliedPackage
      ? selectedTests.some((testName) => packageTestNames.has(testName))
      : false;
    const extraTestsTotal = selectedTests.reduce((total, testName) => {
      if (hasPackageTests && packageTestNames.has(testName)) {
        return total;
      }
      const catalogTest = testCatalog.find((test) => test.name === testName);
      return total + (catalogTest?.price || 0);
    }, 0);

    return extraTestsTotal + (hasPackageTests ? appliedPackage?.price || 0 : 0);
  }, [selectedTests, testCatalog, appliedPackage]);

  // Filter tests by search and category
  const filteredTestsByCategory = useMemo(() => {
    let filtered: Record<string, Test[]> = {};
    const searchLower = testSearch.trim().toLowerCase();
    
    Object.entries(testsByCategory).forEach(([category, tests]) => {
      // Filter by category
      if (selectedCategoryFilter !== "all" && category !== selectedCategoryFilter) {
        return;
      }
      
      // Filter by search
      const matchingTests = searchLower
        ? tests.filter((t) => {
            const nameMatch = t.name.toLowerCase().includes(searchLower);
            const codeMatch = t.test_id?.toLowerCase().includes(searchLower) || false;
            return nameMatch || codeMatch;
          })
        : tests;
      
      if (matchingTests.length > 0) {
        filtered[category] = matchingTests;
      }
    });
    
    return filtered;
  }, [testsByCategory, testSearch, selectedCategoryFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Build queries with collector restrictions
      let testsQuery = supabase
        .from("patient_tests")
        .select(`
          id, patient_id, test_name, test_date, status, result, result_value, result_unit, result_items, registry_serial,
          test_package_id, test_package_name, test_package_group_id,
          is_abnormal, normal_range_text, notes, created_at, created_by, updated_by, 
          result_entered_by, result_entered_at, test_id, lab_id, collection_center_id, registry_serial,
          collected_by, collected_at,
          patients (
            patient_id,
            full_name,
            phone,
            created_by
          ),
          labs (
            id,
            name,
            lab_code
          ),
          collection_centers (
            id,
            name,
            code
          )
        `);

      // Collectors should only see tests they collected OR tests for patients they created
      if (isCollector && user?.id) {
        // Filter by collected_by OR patient's created_by
        // Note: This requires a more complex query, so we'll filter in the frontend
        // The RLS policy will handle database-level restrictions
      }

      let patientsQuery: any = supabase
        .from("patients")
        .select("id, patient_id, full_name, phone, lab_id, collection_center_id")
        .eq("is_active", true);

      // Collectors should only see patients they created
      if (isCollector && user?.id) {
        patientsQuery = patientsQuery.eq("created_by", user.id);
      }

      const [testsRes, patientsRes, categoriesRes, catalogRes, doctorsRes, packagesRes, packageTestsRes, templatesRes] = await Promise.all([
        testsQuery.order("created_at", { ascending: false }),
        patientsQuery,
        supabase.from("test_categories").select("id, name"),
        supabase.from("tests").select("id, test_id, name, price, category_id, unit, normal_range_text, normal_range_min, normal_range_max"),
        supabase.from("doctors").select("id, name, specialization, commission_percentage").eq("is_active", true),
        supabase.from("test_packages").select("id, name, price, discount_percentage, is_active").eq("is_active", true),
        supabase.from("test_package_tests").select("package_id, test_id"),
        supabase.from("test_templates").select("id, name, is_default").order("name"),
      ]);

      if (testsRes.error) throw testsRes.error;
      if (patientsRes.error) throw patientsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (catalogRes.error) throw catalogRes.error;
      if (doctorsRes.error) throw doctorsRes.error;
      if (packagesRes.error) throw packagesRes.error;
      if (packageTestsRes.error) throw packageTestsRes.error;
      if (templatesRes.error) throw templatesRes.error;

      let testsData = (testsRes.data || []) as unknown as PatientTest[];
      
      // For collectors, filter tests to only show:
      // 1. Tests they collected (collected_by = user.id)
      // 2. Tests for patients they created (patient.created_by = user.id)
      if (isCollector && user?.id) {
        testsData = testsData.filter((test) => {
          const testAny = test as any;
          const testCollectedBy = testAny.collected_by === user.id;
          const patientCreatedBy = testAny.patients?.created_by === user.id;
          return testCollectedBy || patientCreatedBy;
        }) as PatientTest[];
      }

      setTests(testsData);
      setPatients(patientsRes.data || []);
      setCategories(categoriesRes.data || []);
      setTestCatalog((catalogRes.data || []) as Test[]);
      setDoctors(doctorsRes.data || []);
      const packageTestsMap = new Map<string, string[]>();
      (packageTestsRes.data || []).forEach((row) => {
        const existing = packageTestsMap.get(row.package_id) || [];
        packageTestsMap.set(row.package_id, [...existing, row.test_id]);
      });
      const packages = (packagesRes.data || []).map((pkg) => ({
        ...pkg,
        tests: packageTestsMap.get(pkg.id) || [],
      })) as TestPackage[];
      setTestPackages(packages);
      setReportTemplates((templatesRes.data || []) as ReportTemplateOption[]);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Failed to fetch data: " + (error.message || "Unknown error"));
      // Set empty arrays to prevent crashes
      setTests([]);
      setPatients([]);
      setCategories([]);
      setTestCatalog([]);
      setDoctors([]);
      setTestPackages([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLabs = async () => {
    try {
      const { data, error } = await supabase
        .from("labs")
        .select("id, name, lab_code")
        .eq("is_active", true)
        .order("name");

      if (error) {
        // Table might not exist yet
        if (error.code === "42P01") {
          setLabs([]);
          return;
        }
        throw error;
      }
      setLabs(data || []);
    } catch (error) {
      console.error("Error fetching labs:", error);
      setLabs([]);
    }
  };

  const fetchCollectionCenters = async () => {
    try {
      const { data, error } = await supabase
        .from("collection_centers")
        .select("id, name, code, lab_id")
        .eq("is_active", true)
        .order("name");

      if (error) {
        // Table might not exist yet
        if (error.code === "42P01") {
          setCollectionCenters([]);
          return;
        }
        throw error;
      }
      setCollectionCenters(data || []);
    } catch (error) {
      console.error("Error fetching collection centers:", error);
      setCollectionCenters([]);
    }
  };

  useEffect(() => {
    fetchData();
    fetchLabs();
    fetchCollectionCenters();
  }, []);

  useEffect(() => {
    if (!appliedPackage) return;
    const packageNames = new Set(
      testCatalog
        .filter((test) => appliedPackage.tests.includes(test.id))
        .map((test) => test.name)
    );
    const hasPackageTests = selectedTests.some((name) => packageNames.has(name));
    if (!hasPackageTests) {
      setAppliedPackage(null);
      setSelectedPackageId("none");
    }
  }, [appliedPackage, selectedTests, testCatalog]);

  const emptyResultItem = (): ResultItemInput => ({
    name: "",
    value: "",
    unit: "",
    normal_range_min: "",
    normal_range_max: "",
    normal_range_text: "",
  });

  const normalizePanelDefaults = (): ResultItemInput[] => {
    return [];
  };

  const getDefaultPanelItems = (testName?: string | null): ResultItemInput[] => {
    const catalogDefaults = normalizePanelDefaults();
    if (catalogDefaults.length > 0) return catalogDefaults;

    const normalizedName = testName?.toLowerCase() || "";
    const isCbc = normalizedName.includes("cbc") || normalizedName.includes("complete blood");
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

  const parseOptionalNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numberValue = Number(trimmed);
    return Number.isFinite(numberValue) ? numberValue : null;
  };

  const parseItemValue = (value: string): number | string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numberValue = Number(trimmed);
    return Number.isFinite(numberValue) ? numberValue : trimmed;
  };

  const getPanelAbnormal = (items: ResultItemInput[]) =>
    items.some((item) => {
      const value = parseOptionalNumber(item.value);
      if (value === null) return false;
      const min = parseOptionalNumber(item.normal_range_min);
      const max = parseOptionalNumber(item.normal_range_max);
      if (min !== null && value < min) return true;
      if (max !== null && value > max) return true;
      return false;
    });

  const normalizePanelItems = (items: ResultItem[] | null): ResultItemInput[] => {
    if (!items || !Array.isArray(items)) return [];
    return items.map((item) => ({
      name: typeof item?.name === "string" ? item.name : "",
      value: item?.value !== null && item?.value !== undefined ? String(item.value) : "",
      unit: typeof item?.unit === "string" ? item.unit : "",
      normal_range_min: item?.normal_range_min !== null && item?.normal_range_min !== undefined
        ? String(item.normal_range_min)
        : "",
      normal_range_max: item?.normal_range_max !== null && item?.normal_range_max !== undefined
        ? String(item.normal_range_max)
        : "",
      normal_range_text: typeof item?.normal_range_text === "string" ? item.normal_range_text : "",
    }));
  };

  const serializePanelItems = (items: ResultItemInput[]) =>
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
      .filter((item) => item.name || item.value !== null || item.unit || item.normal_range_text);

  const updatePanelItem = (index: number, field: keyof ResultItemInput, value: string) => {
    setResultData((prev) => {
      const updatedItems = prev.result_items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      );
      const next = { ...prev, result_items: updatedItems };
      if (usePanelResults) {
        next.is_abnormal = getPanelAbnormal(updatedItems);
      }
      return next;
    });
  };

  const addPanelItem = () => {
    setResultData((prev) => ({
      ...prev,
      result_items: [...prev.result_items, emptyResultItem()],
    }));
  };

  const removePanelItem = (index: number) => {
    setResultData((prev) => {
      const updatedItems = prev.result_items.filter((_, itemIndex) => itemIndex !== index);
      const next = { ...prev, result_items: updatedItems };
      if (usePanelResults) {
        next.is_abnormal = getPanelAbnormal(updatedItems);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    
    if (!selectedPatient) {
      toast.error("Please select a patient");
      return;
    }
    
    if (selectedTests.length === 0) {
      toast.error("Please select at least one test");
      return;
    }
    
    setIsSubmitting(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const packageGroupId = appliedPackage ? crypto.randomUUID() : null;
      const packageTestNames = appliedPackage
        ? new Set(
            testCatalog
              .filter((test) => appliedPackage.tests.includes(test.id))
              .map((test) => test.name)
          )
        : new Set<string>();
      const hasPackageTests = appliedPackage
        ? selectedTests.some((testName) => packageTestNames.has(testName))
        : false;
      
      // Insert all selected tests for the patient
      const testsToInsert = selectedTests.map((testName) => ({
        patient_id: selectedPatient.id,
        test_name: testName,
        test_date: formData.test_date,
        notes: formData.notes || null,
        status: "pending",
        created_by: userData.user?.id,
        collected_by: userData.user?.id, // Track who collected the sample
        collected_at: new Date().toISOString(), // Track when sample was collected
        lab_id: formData.lab_id || null,
        collection_center_id: formData.collection_center_id || null,
        test_package_id: hasPackageTests && appliedPackage ? appliedPackage.id : null,
        test_package_name: hasPackageTests && appliedPackage ? appliedPackage.name : null,
        test_package_group_id: hasPackageTests && appliedPackage ? packageGroupId : null,
      }));

      const { data: insertedTests, error } = await supabase
        .from("patient_tests")
        .insert(testsToInsert)
        .select();

      if (error) throw error;

      // Auto-create invoice for the tests
      const invoiceNumber = `INV${new Date().getFullYear().toString().slice(-2)}${Math.floor(10000 + Math.random() * 90000)}`;
      
      // Calculate prices from test catalog
      let totalAmount = 0;
      const invoiceItemsData = selectedTests.map((testName) => {
        const catalogTest = testCatalog.find(t => t.name === testName);
        const price = hasPackageTests && packageTestNames.has(testName)
          ? 0
          : (catalogTest?.price || 0);
        totalAmount += price;
        return {
          test_name: testName,
          unit_price: price,
          quantity: 1,
          amount: price,
          patient_test_id: insertedTests?.find(t => t.test_name === testName)?.id || null
        };
      });
      if (hasPackageTests && appliedPackage) {
        const packagePrice = appliedPackage.price || 0;
        totalAmount += packagePrice;
        invoiceItemsData.push({
          test_name: `${appliedPackage.name} (Package)`,
          unit_price: packagePrice,
          quantity: 1,
          amount: packagePrice,
          patient_test_id: null
        });
      }

      // Create the invoice
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          patient_id: selectedPatient.id,
          lab_id: formData.lab_id || selectedPatient.lab_id || null,
          collection_center_id: formData.collection_center_id || selectedPatient.collection_center_id || null,
          total_amount: totalAmount,
          final_amount: totalAmount,
          created_by: userData.user?.id,
          notes: `Auto-generated for ${selectedTests.length} test(s)`
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Create invoice items
      const invoiceItems = invoiceItemsData.map(item => ({
        ...item,
        invoice_id: invoice.id
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(invoiceItems);

      if (itemsError) throw itemsError;

      // Create doctor referral if a doctor from database was selected
      if (formData.referred_by !== "self" && formData.referred_by !== "custom") {
        const selectedDoctor = doctors.find(d => d.id === formData.referred_by);
        if (selectedDoctor) {
          const commissionAmount = selectedDoctor.commission_percentage 
            ? (totalAmount * selectedDoctor.commission_percentage) / 100 
            : 0;

          const { error: referralError } = await supabase
            .from("doctor_referrals")
            .insert({
              doctor_id: selectedDoctor.id,
              patient_id: selectedPatient.id,
              invoice_id: invoice.id,
              invoice_number: invoiceNumber,
              invoice_amount: totalAmount,
              commission_amount: commissionAmount,
              notes: formData.custom_doctor_name || null,
            });

          if (referralError) {
            console.error("Error creating referral:", referralError);
          }
        }
      }

      toast.success(`${selectedTests.length} test(s) added and invoice ${invoiceNumber} created`);
      setIsDialogOpen(false);
      setIsConfirmOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error("Error adding test:", error);
      toast.error(error.message || "Failed to add test");
    } finally {
      setIsSubmitting(false);
      setIsConfirmOpen(false);
    }
  };

  const resetForm = () => {
    setSelectedPatient(null);
    setSelectedTests([]);
    setSelectedPackageId("none");
    setAppliedPackage(null);
    setShowPackageTestsIndividually(false);
    setPatientSearch("");
    setTestSearch("");
    setSelectedCategoryFilter("all");
    setFormData({
      test_date: new Date().toISOString().split("T")[0],
      notes: "",
      referred_by: "self",
      custom_doctor_name: "",
      lab_id: currentLab?.id || "",
      collection_center_id: "",
    });
  };

  const toggleTestSelection = (testName: string) => {
    setSelectedTests((prev) =>
      prev.includes(testName)
        ? prev.filter((t) => t !== testName)
        : [...prev, testName]
    );
  };

  const selectAllInCategory = (categoryTests: Test[]) => {
    const testNames = categoryTests.map((t) => t.name);
    const allSelected = testNames.every((name) => selectedTests.includes(name));
    
    if (allSelected) {
      setSelectedTests((prev) => prev.filter((t) => !testNames.includes(t)));
    } else {
      setSelectedTests((prev) => [...new Set([...prev, ...testNames])]);
    }
  };

  const handleAddPackageTests = () => {
    if (!selectedPackageId || selectedPackageId === "none") {
      toast.error("Please select a package");
      return;
    }
    const selectedPackage = testPackages.find((pkg) => pkg.id === selectedPackageId);
    if (!selectedPackage) {
      toast.error("Selected package not found");
      return;
    }
    const packageTests = testCatalog.filter((test) => selectedPackage.tests.includes(test.id));
    const packageTestNames = packageTests.map((test) => test.name);
    const missingCount = selectedPackage.tests.length - packageTestNames.length;
    if (missingCount > 0) {
      toast.warning(`Some tests in this package are missing from the catalog (${missingCount}).`);
    }
    setSelectedTests((prev) => {
      let next = prev;
      if (appliedPackage && appliedPackage.id !== selectedPackage.id) {
        const previousPackageNames = new Set(
          testCatalog
            .filter((test) => appliedPackage.tests.includes(test.id))
            .map((test) => test.name)
        );
        next = next.filter((name) => !previousPackageNames.has(name));
      }
      return [...new Set([...next, ...packageTestNames])];
    });
    setAppliedPackage(selectedPackage);
    toast.success(`Added ${packageTestNames.length} test(s) from ${selectedPackage.name}`);
  };

  const handleResultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTest) return;
    setIsSubmitting(true);
    const panelItems = usePanelResults ? serializePanelItems(resultData.result_items) : [];
    const hasPanelResults = panelItems.length > 0;
    const hadResult =
      Boolean(selectedTest.result) ||
      selectedTest.result_value !== null ||
      (selectedTest.result_items && selectedTest.result_items.length > 0);
    const willHaveResult =
      Boolean(resultData.result) ||
      resultData.result_value !== "" ||
      hasPanelResults;
    const wasCompleted = selectedTest.status === "completed" && hadResult;
    const willComplete = resultData.status === "completed" && willHaveResult;

    try {
      const panelAbnormal = usePanelResults ? getPanelAbnormal(resultData.result_items) : false;
      const finalAbnormal = usePanelResults ? panelAbnormal || resultData.is_abnormal : resultData.is_abnormal;
      const updateData: Record<string, unknown> = {
        result: resultData.result || null,
        result_value: usePanelResults ? null : (resultData.result_value ? parseFloat(resultData.result_value) : null),
        result_unit: usePanelResults ? null : (resultData.result_unit || null),
        normal_range_text: usePanelResults ? null : (resultData.normal_range_text || null),
        result_items: hasPanelResults ? panelItems : null,
        registry_serial: resultData.registry_serial.trim() || null,
        is_abnormal: finalAbnormal,
        status: resultData.status,
        updated_by: user?.id,
      };

      // If result is being entered for the first time, track who entered it
      if (!hadResult && willHaveResult) {
        updateData.result_entered_by = user?.id;
        updateData.result_entered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("patient_tests")
        .update(updateData)
        .eq("id", selectedTest.id);

      if (error) throw error;

      // Send notification only when the last test in an invoice is completed
      if (!wasCompleted && willComplete) {
        try {
          const { sendAllTestsReadyNotification, sendTestResultNotification } = await import("@/services/notificationService");
          const { data: invoiceItem } = await supabase
            .from("invoice_items")
            .select("invoice_id")
            .eq("patient_test_id", selectedTest.id)
            .maybeSingle();

          if (invoiceItem?.invoice_id) {
            const { data: invoiceItems, error: invoiceItemsError } = await supabase
              .from("invoice_items")
              .select("patient_test_id, patient_tests(status,result,result_value,test_name)")
              .eq("invoice_id", invoiceItem.invoice_id);

            if (!invoiceItemsError && invoiceItems) {
              const allCompleted = invoiceItems.every((item) => {
                const test = item.patient_tests as {
                  status: string;
                  result: string | null;
                  result_value: number | null;
                } | null;
                if (!test) return false;
                const hasResult = Boolean(test.result) || test.result_value !== null;
                return test.status === "completed" && hasResult;
              });

              if (allCompleted) {
                const testNames = invoiceItems
                  .map((item) => (item.patient_tests as { test_name?: string | null } | null)?.test_name)
                  .filter((name): name is string => Boolean(name));
                await sendAllTestsReadyNotification(
                  selectedTest.patient_id,
                  testNames.length > 0 ? testNames : [selectedTest.test_name]
                );
              }
            }
          } else {
            await sendTestResultNotification(selectedTest.patient_id, selectedTest.test_name, selectedTest.id);
          }
        } catch (notifError) {
          console.error("Failed to send notification:", notifError);
          // Don't fail the update if notification fails
        }
      }

      toast.success("Test result updated successfully");
      setIsResultDialogOpen(false);
      setSelectedTest(null);
      setResultData({
        result: "",
        result_value: "",
        result_unit: "",
        normal_range_text: "",
        is_abnormal: false,
        status: "completed",
        result_items: [],
        registry_serial: "",
      });
      setUsePanelResults(false);
      fetchData();
    } catch (error: any) {
      console.error("Error updating result:", error);
      toast.error(error.message || "Failed to update result");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openResultDialog = (test: PatientTest) => {
    setSelectedTest(test);
    // Try to find the test in catalog to get default unit and normal range
    const catalogTest = testCatalog.find(t => t.name === test.test_name);
    const panelItems = normalizePanelItems(test.result_items);
    
    // Calculate if result is abnormal based on normal range
    let isAbnormal = test.is_abnormal || false;
    if (panelItems.length > 0) {
      isAbnormal = getPanelAbnormal(panelItems);
    } else if (test.result_value !== null && test.result_value !== undefined && catalogTest) {
      const value = test.result_value;
      const min = catalogTest.normal_range_min;
      const max = catalogTest.normal_range_max;
      
      if (min !== null && max !== null) {
        isAbnormal = value < min || value > max;
      } else if (min !== null) {
        isAbnormal = value < min;
      } else if (max !== null) {
        isAbnormal = value > max;
      }
    }
    
    setResultData({
      result: test.result || "",
      result_value: test.result_value?.toString() || "",
      result_unit: test.result_unit || catalogTest?.unit || "",
      normal_range_text: test.normal_range_text || catalogTest?.normal_range_text || "",
      is_abnormal: isAbnormal,
      status: test.status,
      result_items: panelItems,
      registry_serial: test.registry_serial || "",
    });
    setUsePanelResults(panelItems.length > 0);
    setIsResultDialogOpen(true);
  };

  const openAuditDialog = async (test: PatientTest) => {
    setSelectedTest(test);
    setIsAuditDialogOpen(true);
    setLoadingAudit(true);

    try {
      const { data, error } = await supabase
        .from("patient_test_audit")
        .select("*")
        .eq("patient_test_id", test.id)
        .order("changed_at", { ascending: false });

      if (error) throw error;

      const auditData = (data || []) as AuditLog[];
      const changedByIds = Array.from(
        new Set(auditData.map((log) => log.changed_by).filter(Boolean) as string[]),
      );

      if (changedByIds.length === 0) {
        setAuditLogs(auditData);
      } else {
        const nameMap = await resolveUserDisplayNames(changedByIds);
        setAuditLogs(
          auditData.map((log) => ({
            ...log,
            changed_by_name: log.changed_by ? nameMap.get(log.changed_by) || "Unknown staff" : null,
          })),
        );
      }
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      toast.error("Failed to fetch audit history");
    } finally {
      setLoadingAudit(false);
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "created":
        return "Test Created";
      case "result_updated":
        return "Result Updated";
      case "status_changed":
        return "Status Changed";
      case "updated":
        return "Record Updated";
      default:
        return action;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "in_progress":
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Completed</Badge>;
      case "pending":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">In Progress</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredTests = tests.filter((test) => {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      test.test_name?.toLowerCase().includes(searchLower) ||
      test.patients?.full_name?.toLowerCase().includes(searchLower) ||
      test.patients?.patient_id?.toLowerCase().includes(searchLower) ||
      false;
    
    const matchesStatus = statusFilter === "all" || test.status === statusFilter;
    const matchesLab = labFilter === "all" || test.lab_id === labFilter;
    const matchesCollectionCenter = collectionCenterFilter === "all" || test.collection_center_id === collectionCenterFilter;

    return matchesSearch && matchesStatus && matchesLab && matchesCollectionCenter;
  });

  const groupedRows = useMemo(() => {
    const groupMap = new Map<string, PatientTest[]>();
    const rows: Array<
      | { kind: "single"; test: PatientTest }
      | { kind: "package"; groupId: string }
    > = [];
    const seenGroups = new Set<string>();

    filteredTests.forEach((test) => {
      const groupId = test.test_package_group_id;
      if (groupId) {
        const existing = groupMap.get(groupId) || [];
        groupMap.set(groupId, [...existing, test]);
        if (!seenGroups.has(groupId)) {
          seenGroups.add(groupId);
          rows.push({ kind: "package", groupId });
        }
      } else {
        rows.push({ kind: "single", test });
      }
    });

    return { rows, groupMap };
  }, [filteredTests]);

  const totalPages = Math.max(1, Math.ceil(groupedRows.rows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pagedRows = groupedRows.rows.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, labFilter, collectionCenterFilter]);

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  const pendingCount = tests.filter(t => t.status === "pending").length;
  const inProgressCount = tests.filter(t => t.status === "in_progress").length;
  const completedCount = tests.filter(t => t.status === "completed").length;

  // Selection helpers for printing
  const togglePrintSelection = (testId: string) => {
    setSelectedTestIds(prev => 
      prev.includes(testId) 
        ? prev.filter(id => id !== testId)
        : [...prev, testId]
    );
  };

  const toggleAllSelection = () => {
    const completedFilteredTests = filteredTests.filter(t => t.status === "completed");
    if (selectedTestIds.length === completedFilteredTests.length) {
      setSelectedTestIds([]);
    } else {
      setSelectedTestIds(completedFilteredTests.map(t => t.id));
    }
  };

  const togglePackageSelection = (groupId: string) => {
    const testsInGroup = groupedRows.groupMap.get(groupId) || [];
    const completedIds = testsInGroup.filter(t => t.status === "completed").map(t => t.id);
    if (completedIds.length === 0) {
      return;
    }
    const allSelected = completedIds.every((id) => selectedTestIds.includes(id));
    if (allSelected) {
      setSelectedTestIds((prev) => prev.filter((id) => !completedIds.includes(id)));
    } else {
      setSelectedTestIds((prev) => [...new Set([...prev, ...completedIds])]);
    }
  };

  const handlePrintSelected = async () => {
    const selectedTestsData = tests.filter(t => selectedTestIds.includes(t.id) && t.status === "completed");
    
    if (selectedTestsData.length === 0) {
      toast.error("No completed tests selected for printing");
      return;
    }

    const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
    const categoryByTestId = new Map(
      testCatalog.map((test) => [test.id, test.category_id ? categoryNameById.get(test.category_id) || null : null])
    );

    // Group tests by patient
    const testsByPatient = selectedTestsData.reduce((acc, test) => {
      const patientId = test.patient_id;
      if (!acc[patientId]) {
        acc[patientId] = {
          patient: test.patients,
          tests: []
        };
      }
      const labFromList = labs.find((lab) => lab.id === test.lab_id);
      const resolvedLabName = test.labs?.name || labFromList?.name || currentLab?.name;
      const resolvedLabCode = test.labs?.lab_code || labFromList?.lab_code || currentLab?.lab_code;
      acc[patientId].tests.push({
        id: test.id,
        lab_id: test.lab_id,
        test_id: test.test_id,
        category: test.test_id ? categoryByTestId.get(test.test_id) || null : null,
        test_name: test.test_name,
        test_date: test.test_date,
        status: test.status,
        result: test.result,
        result_value: test.result_value,
        result_unit: test.result_unit,
        result_items: test.result_items,
        registry_serial: test.registry_serial,
        notes: test.notes,
        is_abnormal: test.is_abnormal || false,
        normal_range_text: test.normal_range_text || undefined,
        lab_name: resolvedLabName || undefined,
        lab_code: resolvedLabCode || undefined,
        collection_center_name: test.collection_centers?.name,
        collection_center_code: test.collection_centers?.code,
      });
      return acc;
    }, {} as Record<string, { patient: PatientTest["patients"]; tests: Array<any> }>);

    // Generate PDF for each patient
    let printedCount = 0;
    try {
      for (const patientData of Object.values(testsByPatient)) {
        const success = await generateMultiTestReportPDF(
          {
            full_name: patientData.patient.full_name,
            patient_id: patientData.patient.patient_id,
            phone: patientData.patient.phone,
          },
          patientData.tests,
          undefined,
          printOptions,
          selectedTemplateId === "auto" ? undefined : selectedTemplateId
        );
        if (success) printedCount++;
      }
    } catch (error) {
      console.error("Error generating report PDFs:", error);
      toast.error("Failed to generate report PDF");
      return;
    }

    if (printedCount > 0) {
      toast.success(`Generated ${printedCount} report(s)`);
      setSelectedTestIds([]);
      setIsPrintDialogOpen(false);
    }
  };

  // Early return if critical error
  if (loading && tests.length === 0 && patients.length === 0 && testCatalog.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading patient tests...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("all")}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{tests.length}</p>
                <p className="text-xs text-muted-foreground">Total Tests</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10">
                <Calendar className="h-4 w-4 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${statusFilter === 'pending' ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setStatusFilter("pending")}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-100">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${statusFilter === 'in_progress' ? 'ring-2 ring-blue-500' : ''}`} onClick={() => setStatusFilter("in_progress")}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-blue-600">{inProgressCount}</p>
                <p className="text-xs text-muted-foreground">In Progress</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-100">
                <AlertCircle className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow ${statusFilter === 'completed' ? 'ring-2 ring-emerald-500' : ''}`} onClick={() => setStatusFilter("completed")}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-emerald-600">{completedCount}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div className="p-2 rounded-lg bg-emerald-100">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-4 flex-1">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="tests_search"
              name="tests_search"
              placeholder="Search by test, patient..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full sm:w-80"
            />
          </div>
          <Select value={labFilter} onValueChange={setLabFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by Lab" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Labs</SelectItem>
              {labs.map((lab) => (
                <SelectItem key={lab.id} value={lab.id}>
                  {lab.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select 
            value={collectionCenterFilter} 
            onValueChange={setCollectionCenterFilter}
            disabled={labFilter === "all" || !labFilter}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by Center" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Centers</SelectItem>
              {collectionCenters
                .filter(cc => labFilter === "all" || cc.lab_id === labFilter)
                .map((center) => (
                  <SelectItem key={center.id} value={center.id}>
                    {center.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {(statusFilter !== "all" || labFilter !== "all" || collectionCenterFilter !== "all") && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                setStatusFilter("all");
                setLabFilter("all");
                setCollectionCenterFilter("all");
              }}
              className="text-muted-foreground"
            >
              Clear filters ×
            </Button>
          )}
        </div>

        <div className="flex gap-2">
          {selectedTestIds.length > 0 && (
            <Button 
              variant="outline" 
              onClick={() => setIsPrintDialogOpen(true)}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Print ({selectedTestIds.length})
            </Button>
          )}

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                resetForm();
                setIsConfirmOpen(false);
              }
            }}
          >
          <DialogTrigger asChild>
            <Button className="bg-clinical-navy hover:bg-clinical-navy/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Test
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle>Add Tests for Patient</DialogTitle>
            <DialogDescription>
              Select tests and create the invoice in one step.
            </DialogDescription>
          </DialogHeader>
            <form onSubmit={(e) => e.preventDefault()} className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {!isDialogContentReady ? (
                <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                  Loading test form...
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="p-4 space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Patient Search Section */}
                      <div className="space-y-2">
                        <Label htmlFor="patient_search">Patient *</Label>
                        {selectedPatient ? (
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg border">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-full bg-primary/10">
                                <User className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{selectedPatient.full_name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {selectedPatient.patient_id} • {selectedPatient.phone}
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedPatient(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                id="patient_search"
                                name="patient_search"
                                placeholder="Search by name, ID, or phone..."
                                value={patientSearch}
                                onChange={(e) => setPatientSearch(e.target.value)}
                                className="pl-10"
                              />
                            </div>
                            {patientSearch && (
                              <ScrollArea className="h-36 border rounded-lg">
                                <div className="p-2 space-y-1">
                                  {filteredPatients.length === 0 ? (
                                    <p className="text-sm text-muted-foreground p-2 text-center">
                                      No patients found
                                    </p>
                                  ) : (
                                    filteredPatients.map((patient) => (
                                      <button
                                        key={patient.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedPatient(patient);
                                          setPatientSearch("");
                                          // Auto-populate lab and collection center from patient
                                          const patientLabId = patient.lab_id || currentLab?.id || "";
                                          let patientCollectionCenterId = patient.collection_center_id || "";
                                          
                                          // Verify collection center belongs to the patient's lab
                                          if (patientCollectionCenterId && patientLabId) {
                                            const collectionCenter = collectionCenters.find(
                                              cc => cc.id === patientCollectionCenterId && cc.lab_id === patientLabId
                                            );
                                            if (!collectionCenter) {
                                              patientCollectionCenterId = ""; // Clear if doesn't match
                                            }
                                          } else if (patientCollectionCenterId && !patientLabId) {
                                            patientCollectionCenterId = ""; // Clear if no lab selected
                                          }
                                          
                                          setFormData(prev => ({
                                            ...prev,
                                            lab_id: patientLabId,
                                            collection_center_id: patientCollectionCenterId,
                                          }));
                                        }}
                                        className="w-full flex items-center gap-3 p-2 hover:bg-muted rounded-md text-left transition-colors"
                                      >
                                        <div className="p-1.5 rounded-full bg-primary/10">
                                          <User className="h-3 w-3 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium truncate">{patient.full_name}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {patient.patient_id} • {patient.phone}
                                          </p>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </ScrollArea>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Lab and Collection Center Section */}
                      <div className="space-y-2">
                        {/* <Label>Lab & Collection Center</Label> */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label htmlFor="lab_id">Lab</Label>
                            <Select
                              name="lab_id"
                              value={formData.lab_id || "none"}
                              onValueChange={(value) => setFormData({ ...formData, lab_id: value === "none" ? "" : value, collection_center_id: "" })}
                            >
                            <SelectTrigger id="lab_id">
                              <SelectValue placeholder="Select lab (optional)" />
                            </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {labs.map((lab) => (
                                  <SelectItem key={lab.id} value={lab.id}>
                                    {lab.name} ({lab.lab_code})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="collection_center_id">Collection Center</Label>
                            <Select
                              name="collection_center_id"
                              value={formData.collection_center_id || "none"}
                              onValueChange={(value) => setFormData({ ...formData, collection_center_id: value === "none" ? "" : value })}
                              disabled={!formData.lab_id}
                            >
                            <SelectTrigger id="collection_center_id">
                              <SelectValue placeholder={formData.lab_id ? "Select center (optional)" : "Select lab first"} />
                            </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {collectionCenters
                                  .filter(cc => cc.lab_id === formData.lab_id)
                                  .map((center) => (
                                    <SelectItem key={center.id} value={center.id}>
                                      {center.name} ({center.code})
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            {!formData.lab_id && (
                              <p className="text-xs text-muted-foreground">Please select a lab first</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tests Selection Section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium leading-none">Select Tests *</p>
                        {selectedTests.length > 0 && (
                          <Badge variant="secondary">{selectedTests.length} selected</Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2">
                        <div className="space-y-2">
                          <Label htmlFor="test_package_id" className="sr-only">
                            Test package
                          </Label>
                          <Select name="test_package_id" value={selectedPackageId} onValueChange={setSelectedPackageId}>
                            <SelectTrigger id="test_package_id">
                              <SelectValue placeholder="Select package (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No Package</SelectItem>
                              {testPackages.map((pkg) => (
                                <SelectItem key={pkg.id} value={pkg.id}>
                                  {pkg.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddPackageTests}
                          disabled={selectedPackageId === "none"}
                        >
                          Add Package Tests
                        </Button>
                        <div className="text-xs text-muted-foreground flex items-center">
                          Package price replaces individual test prices in billing.
                        </div>
                      </div>
                      
                      {/* Search and Category Filter */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="test_search"
                            name="test_search"
                            placeholder="Search tests..."
                            value={testSearch}
                            onChange={(e) => setTestSearch(e.target.value)}
                            className="pl-10"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="test_category_filter" className="sr-only">
                            Test category filter
                          </Label>
                          <Select
                            name="test_category_filter"
                            value={selectedCategoryFilter}
                            onValueChange={setSelectedCategoryFilter}
                          >
                            <SelectTrigger id="test_category_filter">
                              <SelectValue placeholder="Filter by category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Categories</SelectItem>
                              {categories.map((category) => (
                                <SelectItem key={category.id} value={category.name}>
                                  {category.name}
                                </SelectItem>
                              ))}
                              <SelectItem value="Other Tests">Other Tests</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <div className="lg:col-span-2">
                        <div className="border rounded-lg max-h-[56vh] overflow-auto">
                          <div className="p-3 space-y-4">
                            {Object.entries(filteredTestsByCategory).length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No tests found
                              </p>
                            ) : (
                              Object.entries(filteredTestsByCategory).map(([category, categoryTests]) => (
                                <div key={category} className="space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                                      {category}
                                    </h4>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-xs h-6"
                                      onClick={() => selectAllInCategory(categoryTests)}
                                    >
                                      {categoryTests.every((t) => selectedTests.includes(t.name))
                                        ? "Deselect All"
                                        : "Select All"}
                                    </Button>
                                  </div>
                                  <div className="space-y-1">
                                    {categoryTests.map((test) => (
                                      <Label
                                        key={test.id}
                                        htmlFor={`test_select_${test.id}`}
                                        className="flex items-center gap-3 p-2 hover:bg-muted rounded-md cursor-pointer transition-colors"
                                      >
                                        <Checkbox
                                          id={`test_select_${test.id}`}
                                          checked={selectedTests.includes(test.name)}
                                          onCheckedChange={() => toggleTestSelection(test.name)}
                                        />
                                        <div className="flex-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium">{test.name}</span>
                                            {test.test_id && (
                                              <Badge variant="outline" className="font-mono text-[10px]">
                                                {test.test_id}
                                              </Badge>
                                            )}
                                            {test.price && (
                                              <span className="text-muted-foreground">
                                                ₹{test.price}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </Label>
                                    ))}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium leading-none">Selected Tests</p>
                          <span className="text-sm text-muted-foreground">
                            Total: ₹{selectedTestsTotal}
                          </span>
                        </div>
                        {appliedPackage && (
                          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2 text-sm">
                            <span className="font-medium">
                              Package: {appliedPackage.name} (₹{appliedPackage.price || 0}) • {appliedPackage.tests.length} tests
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Show tests</span>
                              <Switch
                                checked={showPackageTestsIndividually}
                                onCheckedChange={setShowPackageTestsIndividually}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const packageNames = new Set(
                                    testCatalog
                                      .filter((test) => appliedPackage.tests.includes(test.id))
                                      .map((test) => test.name)
                                  );
                                  setSelectedTests((prev) => prev.filter((name) => !packageNames.has(name)));
                                  setAppliedPackage(null);
                                  setSelectedPackageId("none");
                                  setShowPackageTestsIndividually(false);
                                }}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                Remove Package
                              </Button>
                            </div>
                          </div>
                        )}
                        <div className="border rounded-lg p-3 h-[38vh] overflow-y-auto">
                          {selectedTests.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No tests selected yet.</p>
                          ) : (
                            (() => {
                              const packageNames = new Set(
                                appliedPackage
                                  ? testCatalog
                                      .filter((test) => appliedPackage.tests.includes(test.id))
                                      .map((test) => test.name)
                                  : []
                              );
                              const visibleTests = showPackageTestsIndividually
                                ? selectedTests
                                : selectedTests.filter((name) => !packageNames.has(name));
                              if (visibleTests.length === 0) {
                                return (
                                  <p className="text-sm text-muted-foreground">
                                    Only package tests selected.
                                  </p>
                                );
                              }
                              return (
                                <div className="flex flex-wrap gap-2">
                                  {visibleTests.map((testName) => (
                                    <Badge
                                      key={testName}
                                      variant="secondary"
                                      className="cursor-pointer hover:bg-destructive/10 hover:text-destructive"
                                      onClick={() => toggleTestSelection(testName)}
                                    >
                                      {testName}
                                      <X className="h-3 w-3 ml-1" />
                                    </Badge>
                                  ))}
                                </div>
                              );
                            })()
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Click a test to remove it.
                        </p>
                      </div>
                    </div>

                    {/* Referred By Section */}
                    <div className="space-y-2">
                      <Label htmlFor="referred_by">Referred By</Label>
                      <Select 
                        name="referred_by"
                        value={formData.referred_by} 
                        onValueChange={(value) => setFormData({ ...formData, referred_by: value, custom_doctor_name: "" })}
                      >
                        <SelectTrigger id="referred_by">
                          <SelectValue placeholder="Select referral source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="self">Self</SelectItem>
                          {doctors.map((doctor) => (
                            <SelectItem key={doctor.id} value={doctor.id}>
                              Dr. {doctor.name} {doctor.specialization ? `(${doctor.specialization})` : ""}
                              {doctor.commission_percentage ? ` - ${doctor.commission_percentage}%` : ""}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Other (Enter name)</SelectItem>
                        </SelectContent>
                      </Select>
                      {formData.referred_by === "custom" && (
                        <Input
                          id="custom_doctor_name"
                          name="custom_doctor_name"
                          placeholder="Enter doctor's name..."
                          value={formData.custom_doctor_name}
                          onChange={(e) => setFormData({ ...formData, custom_doctor_name: e.target.value })}
                          className="mt-2"
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="test_date">Test Date *</Label>
                        <DateInput
                          id="test_date"
                          value={formData.test_date}
                          onChange={(value) => setFormData({ ...formData, test_date: value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notes">Notes</Label>
                        <Input
                          id="notes"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          placeholder="Any notes..."
                        />
                      </div>
                    </div>

                    </div>
                  </ScrollArea>
                </div>
              )}

              <div className="border-t px-4 py-3 flex items-center justify-between shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-clinical-navy hover:bg-clinical-navy/90"
                  disabled={isSubmitting || !selectedPatient || selectedTests.length === 0}
                  onClick={() => setIsConfirmOpen(true)}
                >
                  Add {selectedTests.length} Test{selectedTests.length !== 1 ? "s" : ""}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm test order</AlertDialogTitle>
              <AlertDialogDescription>
                This will create test records and generate an invoice.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="font-medium">Patient</p>
                {selectedPatient ? (
                  <p className="text-muted-foreground">
                    {selectedPatient.full_name} • {selectedPatient.patient_id} • {selectedPatient.phone}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No patient selected.</p>
                )}
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Tests</p>
                  <span className="text-muted-foreground">Total ₹{selectedTestsTotal}</span>
                </div>
                {selectedTests.length === 0 ? (
                  <p className="text-muted-foreground mt-2">No tests selected.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(() => {
                      const packageNames = new Set(
                        appliedPackage
                          ? testCatalog
                              .filter((test) => appliedPackage.tests.includes(test.id))
                              .map((test) => test.name)
                          : []
                      );
                      const visibleTests = showPackageTestsIndividually
                        ? selectedTests
                        : selectedTests.filter((name) => !packageNames.has(name));
                      return (
                        <>
                          {appliedPackage && !showPackageTestsIndividually && (
                            <Badge variant="secondary">
                              {appliedPackage.name} (Package)
                            </Badge>
                          )}
                          {visibleTests.map((testName) => (
                            <Badge key={testName} variant="secondary">
                              {testName}
                            </Badge>
                          ))}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void handleSubmit();
                }}
                disabled={isSubmitting || !selectedPatient || selectedTests.length === 0}
              >
                {isSubmitting ? "Adding..." : "Create Invoice"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>

      {/* Result Dialog */}
      <Dialog open={isResultDialogOpen} onOpenChange={setIsResultDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Test Result</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResultSubmit} className="space-y-4">
            <Card className="border-0 bg-muted/50">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{selectedTest?.test_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedTest?.patients?.full_name} • {selectedTest?.patients?.patient_id}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedTest && formatAppDate(selectedTest.test_date)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={resultData.status}
                onValueChange={(value) => setResultData({ ...resultData, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      Pending
                    </div>
                  </SelectItem>
                  <SelectItem value="in_progress">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-blue-500" />
                      In Progress
                    </div>
                  </SelectItem>
                  <SelectItem value="completed">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Completed
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Panel Results</p>
                <p className="text-xs text-muted-foreground">
                  Use multiple result rows for tests like CBC.
                </p>
              </div>
              <Switch
                checked={usePanelResults}
                onCheckedChange={(checked) => {
                  setUsePanelResults(checked);
                  if (checked && resultData.result_items.length === 0) {
                    setResultData((prev) => {
                      const defaults = getDefaultPanelItems(selectedTest?.test_name);
                      return {
                        ...prev,
                        result_items: defaults.length > 0 ? defaults : [emptyResultItem()],
                        is_abnormal: defaults.length > 0 ? getPanelAbnormal(defaults) : false,
                      };
                    });
                  }
                }}
              />
            </div>

            {usePanelResults ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const defaults = getDefaultPanelItems(selectedTest?.test_name);
                      if (defaults.length === 0) {
                        toast.info("No default panel template available for this test.");
                        return;
                      }
                      setResultData((prev) => ({
                        ...prev,
                        result_items: defaults,
                        is_abnormal: getPanelAbnormal(defaults),
                      }));
                    }}
                  >
                    Load Panel Template
                  </Button>
                </div>
                {resultData.result_items.map((item, index) => (
                  <div key={`panel-item-${index}`} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Result Item {index + 1}</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removePanelItem(index)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`panel_item_name_${index}`}>Item Name</Label>
                        <Input
                          id={`panel_item_name_${index}`}
                          name={`panel_item_name_${index}`}
                          value={item.name}
                          onChange={(e) => updatePanelItem(index, "name", e.target.value)}
                          placeholder="e.g. WBC, HGB, PLT"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`panel_item_value_${index}`}>Value</Label>
                        <Input
                          id={`panel_item_value_${index}`}
                          name={`panel_item_value_${index}`}
                          value={item.value}
                          onChange={(e) => updatePanelItem(index, "value", e.target.value)}
                          placeholder="e.g. 7.0"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor={`panel_item_unit_${index}`}>Unit</Label>
                        <Input
                          id={`panel_item_unit_${index}`}
                          name={`panel_item_unit_${index}`}
                          value={item.unit}
                          onChange={(e) => updatePanelItem(index, "unit", e.target.value)}
                          placeholder="e.g. 10^9/L"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`panel_item_min_${index}`}>Normal Min</Label>
                        <Input
                          id={`panel_item_min_${index}`}
                          name={`panel_item_min_${index}`}
                          value={item.normal_range_min}
                          onChange={(e) => updatePanelItem(index, "normal_range_min", e.target.value)}
                          placeholder="Min"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`panel_item_max_${index}`}>Normal Max</Label>
                        <Input
                          id={`panel_item_max_${index}`}
                          name={`panel_item_max_${index}`}
                          value={item.normal_range_max}
                          onChange={(e) => updatePanelItem(index, "normal_range_max", e.target.value)}
                          placeholder="Max"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`panel_item_range_${index}`}>Normal Range (Text)</Label>
                      <Input
                        id={`panel_item_range_${index}`}
                        name={`panel_item_range_${index}`}
                        value={item.normal_range_text}
                        onChange={(e) => updatePanelItem(index, "normal_range_text", e.target.value)}
                        placeholder="Optional: e.g. 3.5 - 10.0"
                      />
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addPanelItem}>
                  Add Result Item
                </Button>
              </div>
            ) : (
              <>
                {/* Numeric Result Value and Unit */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="result_value">Result Value</Label>
                    <div className="relative">
                      <Input
                        id="result_value"
                        type="number"
                        step="any"
                        value={resultData.result_value}
                        onChange={(e) => {
                          const value = e.target.value;
                          const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                          
                          // Auto-detect abnormal based on normal range
                          let isAbnormal = resultData.is_abnormal;
                          if (value && catalogTest) {
                            const numValue = parseFloat(value);
                            if (!isNaN(numValue)) {
                              const min = catalogTest.normal_range_min;
                              const max = catalogTest.normal_range_max;
                              
                              if (min !== null && max !== null) {
                                isAbnormal = numValue < min || numValue > max;
                              } else if (min !== null) {
                                isAbnormal = numValue < min;
                              } else if (max !== null) {
                                isAbnormal = numValue > max;
                              }
                            }
                          }
                          
                          setResultData({ ...resultData, result_value: value, is_abnormal: isAbnormal });
                        }}
                        placeholder="e.g. 12.5"
                        className={(() => {
                          const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                          if (resultData.result_value && catalogTest) {
                            const numValue = parseFloat(resultData.result_value);
                            if (!isNaN(numValue)) {
                              const min = catalogTest.normal_range_min;
                              const max = catalogTest.normal_range_max;
                              let isOutOfRange = false;
                              if (min !== null && max !== null) {
                                isOutOfRange = numValue < min || numValue > max;
                              } else if (min !== null) {
                                isOutOfRange = numValue < min;
                              } else if (max !== null) {
                                isOutOfRange = numValue > max;
                              }
                              if (isOutOfRange) {
                                return "border-red-500 focus-visible:ring-red-500";
                              }
                            }
                          }
                          return "";
                        })()}
                      />
                      {(() => {
                        const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                        if (resultData.result_value && catalogTest) {
                          const numValue = parseFloat(resultData.result_value);
                          if (!isNaN(numValue)) {
                            const min = catalogTest.normal_range_min;
                            const max = catalogTest.normal_range_max;
                            let isOutOfRange = false;
                            if (min !== null && max !== null) {
                              isOutOfRange = numValue < min || numValue > max;
                            } else if (min !== null) {
                              isOutOfRange = numValue < min;
                            } else if (max !== null) {
                              isOutOfRange = numValue > max;
                            }
                            if (isOutOfRange) {
                              return (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                </div>
                              );
                            }
                          }
                        }
                        return null;
                      })()}
                    </div>
                    {(() => {
                      const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                      if (resultData.result_value && catalogTest) {
                        const numValue = parseFloat(resultData.result_value);
                        if (!isNaN(numValue)) {
                          const min = catalogTest.normal_range_min;
                          const max = catalogTest.normal_range_max;
                          let isOutOfRange = false;
                          let message = "";
                          if (min !== null && max !== null) {
                            isOutOfRange = numValue < min || numValue > max;
                            if (numValue < min) {
                              message = `Value is below normal range (min: ${min})`;
                            } else if (numValue > max) {
                              message = `Value is above normal range (max: ${max})`;
                            }
                          } else if (min !== null) {
                            isOutOfRange = numValue < min;
                            if (isOutOfRange) {
                              message = `Value is below normal range (min: ${min})`;
                            }
                          } else if (max !== null) {
                            isOutOfRange = numValue > max;
                            if (isOutOfRange) {
                              message = `Value is above normal range (max: ${max})`;
                            }
                          }
                          if (isOutOfRange) {
                            return (
                              <p className="text-xs text-red-600 font-medium mt-1">
                                {message}
                              </p>
                            );
                          } else if (min !== null || max !== null) {
                            return (
                              <p className="text-xs text-green-600 font-medium mt-1">
                                Value is within normal range
                              </p>
                            );
                          }
                        }
                      }
                      return null;
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="result_unit">Unit</Label>
                    <Input
                      id="result_unit"
                      value={resultData.result_unit}
                      onChange={(e) => setResultData({ ...resultData, result_unit: e.target.value })}
                      placeholder="e.g. mg/dL, U/L"
                    />
                  </div>
                </div>
                
                {/* Show Normal Range from Catalog if available */}
                {(() => {
                  const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                  if (catalogTest && (catalogTest.normal_range_min !== null || catalogTest.normal_range_max !== null)) {
                    const min = catalogTest.normal_range_min;
                    const max = catalogTest.normal_range_max;
                    const rangeText = min !== null && max !== null 
                      ? `${min} - ${max} ${catalogTest.unit || ''}`.trim()
                      : min !== null 
                        ? `≥ ${min} ${catalogTest.unit || ''}`.trim()
                        : `≤ ${max} ${catalogTest.unit || ''}`.trim();
                    
                    return (
                      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <p className="text-sm font-medium text-blue-900">Normal Range (from catalog):</p>
                        <p className="text-sm text-blue-700">{rangeText}</p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Normal Range */}
                <div className="space-y-2">
                  <Label htmlFor="normal_range_text">Normal Range</Label>
                  <Input
                    id="normal_range_text"
                    value={resultData.normal_range_text}
                    onChange={(e) => setResultData({ ...resultData, normal_range_text: e.target.value })}
                    placeholder="e.g. 70-100 mg/dL, < 40 U/L, Negative"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the reference range for this test result
                  </p>
                </div>
              </>
            )}

            {/* Text Result (for qualitative results) */}
            <div className="space-y-2">
              <Label htmlFor="result">Result Notes / Qualitative Result</Label>
              <Textarea
                id="result"
                value={resultData.result}
                onChange={(e) => setResultData({ ...resultData, result: e.target.value })}
                placeholder="Enter detailed results, observations, or qualitative findings..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="registry_serial">Registry Serial (optional)</Label>
              <Input
                id="registry_serial"
                value={resultData.registry_serial}
                onChange={(e) => setResultData({ ...resultData, registry_serial: e.target.value })}
                placeholder="e.g. REG-2024-1123"
              />
            </div>

            {/* Abnormal Flag */}
            <div className={`flex items-center gap-3 p-3 rounded-lg border ${
              resultData.is_abnormal 
                ? "bg-red-50 border-red-200" 
                : "bg-muted/30"
            }`}>
              <Checkbox
                id="is_abnormal"
                checked={resultData.is_abnormal}
                onCheckedChange={(checked) => setResultData({ ...resultData, is_abnormal: checked === true })}
              />
              <div className="flex-1">
                <Label htmlFor="is_abnormal" className="cursor-pointer font-medium text-foreground">
                  Mark as Abnormal
                </Label>
                <p className="text-xs text-muted-foreground">
                  {(() => {
                    const catalogTest = testCatalog.find(t => t.name === selectedTest?.test_name);
                    if (usePanelResults && resultData.result_items.length > 0) {
                      return "Automatically detected from panel ranges. You can override if needed.";
                    }
                    if (catalogTest && resultData.result_value && (catalogTest.normal_range_min !== null || catalogTest.normal_range_max !== null)) {
                      return "Automatically detected based on normal range. You can override if needed.";
                    }
                    return "Flag this result if it falls outside the normal range or is qualitatively abnormal";
                  })()}
                </p>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Updating..." : "Update Result"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Audit History Dialog */}
      <Dialog open={isAuditDialogOpen} onOpenChange={setIsAuditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Audit History
            </DialogTitle>
          </DialogHeader>
          
          <Card className="border-0 bg-muted/50 mb-4">
            <CardContent className="pt-4">
              <p className="font-semibold">{selectedTest?.test_name}</p>
              <p className="text-sm text-muted-foreground">
                {selectedTest?.patients?.full_name} • {selectedTest?.patients?.patient_id}
              </p>
            </CardContent>
          </Card>

          {loadingAudit ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No audit history available</p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log) => (
                <div key={log.id} className="border rounded-lg p-3 bg-background">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary">{getActionLabel(log.action)}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatAppDateTime(log.changed_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {log.changed_by_name ? `By ${log.changed_by_name}` : "By system"}
                  </p>
                  
                  {log.old_values && log.new_values && (
                    <div className="text-xs space-y-1">
                      {log.old_values.status !== log.new_values.status && (
                        <p>
                          Status: <span className="text-muted-foreground">{log.old_values.status}</span>
                          {" → "}
                          <span className="font-medium">{log.new_values.status}</span>
                        </p>
                      )}
                      {log.old_values.result !== log.new_values.result && (
                        <p>
                          Result updated
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Print Options Dialog */}
      <Dialog
        open={isPrintDialogOpen}
        onOpenChange={(open) => {
          setIsPrintDialogOpen(open);
          if (!open) {
            setSelectedTemplateId("auto");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Print Report Options
            </DialogTitle>
            <DialogDescription>
              Configure print options for {selectedTestIds.length} selected test(s)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="report-template" className="text-base font-medium">Report Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger id="report-template">
                  <SelectValue placeholder="Auto (Default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Default)</SelectItem>
                  {reportTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}{template.is_default ? " (Default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Auto picks test, category, or default template.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="include-header" className="text-base font-medium">Include Header</Label>
                <p className="text-sm text-muted-foreground">
                  Lab name, address, phone and email at the top
                </p>
              </div>
              <Switch
                id="include-header"
                checked={printOptions.includeHeader}
                onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeHeader: checked }))}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="include-footer" className="text-base font-medium">Include Footer</Label>
                <p className="text-sm text-muted-foreground">
                  Generated date and lab branding at the bottom
                </p>
              </div>
              <Switch
                id="include-footer"
                checked={printOptions.includeFooter}
                onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeFooter: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="include-watermark" className="text-base font-medium">Include Watermark</Label>
                <p className="text-sm text-muted-foreground">
                  Very light IRM logo behind the report content
                </p>
              </div>
              <Switch
                id="include-watermark"
                checked={printOptions.includeWatermark}
                onCheckedChange={(checked) => setPrintOptions(prev => ({ ...prev, includeWatermark: checked }))}
              />
            </div>
            
            <Card className="border-dashed bg-muted/30">
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  <strong>Tip:</strong> Disable both options if you are using pre-printed letterhead paper.
                </p>
              </CardContent>
            </Card>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handlePrintSelected} className="bg-clinical-navy hover:bg-clinical-navy/90 gap-2">
              <Printer className="h-4 w-4" />
              Print Reports
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tests Table */}
      <Card className="border-0 shadow-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedTestIds.length > 0 && selectedTestIds.length === filteredTests.filter(t => t.status === "completed").length}
                  onCheckedChange={toggleAllSelection}
                  aria-label="Select all completed tests"
                />
              </TableHead>
              <TableHead className="font-semibold">Patient</TableHead>
              <TableHead className="font-semibold">Test</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Lab</TableHead>
              <TableHead className="font-semibold">Collection Center</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Result</TableHead>
              <TableHead className="text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    Loading tests...
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredTests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                  {statusFilter !== "all" ? `No ${statusFilter.replace("_", " ")} tests found` : "No tests found"}
                </TableCell>
              </TableRow>
            ) : (
              pagedRows.map((row) => {
                if (row.kind === "package") {
                  const testsInGroup = groupedRows.groupMap.get(row.groupId) || [];
                  if (testsInGroup.length === 0) {
                    return null;
                  }
                  const firstTest = testsInGroup[0];
                  const completedInGroup = testsInGroup.filter((t) => t.status === "completed").length;
                  const totalInGroup = testsInGroup.length;
                  const hasCompleted = completedInGroup > 0;
                  const allCompleted = completedInGroup === totalInGroup;
                  const groupStatus = allCompleted
                    ? "completed"
                    : testsInGroup.some((t) => t.status === "in_progress")
                      ? "in_progress"
                      : "pending";
                  const isExpanded = expandedPackageGroups.has(row.groupId);

                  return (
                    <Fragment key={`package-${row.groupId}`}>
                      <TableRow key={`package-${row.groupId}`} className="bg-muted/30">
                        <TableCell>
                          <Checkbox
                            checked={hasCompleted && testsInGroup.filter((t) => t.status === "completed").every((t) => selectedTestIds.includes(t.id))}
                            onCheckedChange={() => togglePackageSelection(row.groupId)}
                            disabled={!hasCompleted}
                            aria-label={`Select ${firstTest.test_package_name || "package"} tests`}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{firstTest.patients?.full_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {firstTest.patients?.patient_id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setExpandedPackageGroups((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.groupId)) {
                                    next.delete(row.groupId);
                                  } else {
                                    next.add(row.groupId);
                                  }
                                  return next;
                                });
                              }}
                              className="h-7 w-7 p-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                            <div>
                              <p className="font-medium">
                                {firstTest.test_package_name || "Package"} ({totalInGroup} tests)
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Package group
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{formatAppDate(firstTest.test_date)}</span>
                            </div>
                            {firstTest.created_at && (
                              <span className="text-xs text-muted-foreground ml-5">
                                {format(new Date(firstTest.created_at), "HH:mm")}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {firstTest.labs?.lab_code ? (
                            <span className="text-sm font-mono font-medium">{firstTest.labs.lab_code}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {firstTest.collection_centers?.code ? (
                            <span className="text-sm font-mono font-medium">{firstTest.collection_centers.code}</span>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(groupStatus)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {completedInGroup}/{totalInGroup} completed
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setExpandedPackageGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.groupId)) {
                                  next.delete(row.groupId);
                                } else {
                                  next.add(row.groupId);
                                }
                                return next;
                              });
                            }}
                            className="gap-1.5"
                          >
                            {isExpanded ? "Hide Tests" : "View Tests"}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded &&
                        testsInGroup.map((test) => (
                          <TableRow key={test.id} className="hover:bg-muted/30 transition-colors">
                            <TableCell>
                              <Checkbox
                                checked={selectedTestIds.includes(test.id)}
                                onCheckedChange={() => togglePrintSelection(test.id)}
                                disabled={test.status !== "completed"}
                                aria-label={`Select ${test.test_name}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{test.patients?.full_name}</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {test.patients?.patient_id}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{test.test_name}</p>
                              {test.notes && (
                                <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                                  {test.notes}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-sm">{formatAppDate(test.test_date)}</span>
                                </div>
                                {test.created_at && (
                                  <span className="text-xs text-muted-foreground ml-5">
                                    {format(new Date(test.created_at), "HH:mm")}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {test.labs?.lab_code ? (
                                <span className="text-sm font-mono font-medium">{test.labs.lab_code}</span>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {test.collection_centers?.code ? (
                                <span className="text-sm font-mono font-medium">{test.collection_centers.code}</span>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(test.status)}
                            </TableCell>
                            <TableCell>
                              {test.result_items && test.result_items.length > 0 ? (
                                <span className="text-sm font-medium">
                                  Panel ({test.result_items.length})
                                </span>
                              ) : test.result_value !== null && test.result_value !== undefined ? (
                                <span className="text-sm font-medium">
                                  {test.result_value}
                                  {test.result_unit && ` ${test.result_unit}`}
                                </span>
                              ) : test.result ? (
                                <span className="text-sm truncate max-w-[150px] block">
                                  {test.result.substring(0, 50)}{test.result.length > 50 ? "..." : ""}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openAuditDialog(test)}
                                  className="gap-1 text-muted-foreground hover:text-foreground"
                                  title="View audit history"
                                >
                                  <History className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openResultDialog(test)}
                                  className="gap-1.5"
                                >
                                  {test.status === "completed" ? (
                                    <>
                                      <CheckCircle className="h-3.5 w-3.5" />
                                      View
                                    </>
                                  ) : (
                                    <>
                                      <Clock className="h-3.5 w-3.5" />
                                      Update
                                    </>
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                    </Fragment>
                  );
                }

                const test = row.test;
                return (
                  <TableRow key={test.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <Checkbox
                        checked={selectedTestIds.includes(test.id)}
                        onCheckedChange={() => togglePrintSelection(test.id)}
                        disabled={test.status !== "completed"}
                        aria-label={`Select ${test.test_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{test.patients?.full_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {test.patients?.patient_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{test.test_name}</p>
                      {test.notes && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {test.notes}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{formatAppDate(test.test_date)}</span>
                        </div>
                        {test.created_at && (
                          <span className="text-xs text-muted-foreground ml-5">
                            {format(new Date(test.created_at), "HH:mm")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {test.labs?.lab_code ? (
                        <span className="text-sm font-mono font-medium">{test.labs.lab_code}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {test.collection_centers?.code ? (
                        <span className="text-sm font-mono font-medium">{test.collection_centers.code}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(test.status)}
                    </TableCell>
                    <TableCell>
                      {test.result_items && test.result_items.length > 0 ? (
                        <span className="text-sm font-medium">
                          Panel ({test.result_items.length})
                        </span>
                      ) : test.result_value !== null && test.result_value !== undefined ? (
                        <span className="text-sm font-medium">
                          {test.result_value}
                          {test.result_unit && ` ${test.result_unit}`}
                        </span>
                      ) : test.result ? (
                        <span className="text-sm truncate max-w-[150px] block">
                          {test.result.substring(0, 50)}{test.result.length > 50 ? "..." : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAuditDialog(test)}
                          className="gap-1 text-muted-foreground hover:text-foreground"
                          title="View audit history"
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openResultDialog(test)}
                          className="gap-1.5"
                        >
                          {test.status === "completed" ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5" />
                              View
                            </>
                          ) : (
                            <>
                              <Clock className="h-3.5 w-3.5" />
                              Update
                            </>
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        {filteredTests.length > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1}-{Math.min(endIndex, groupedRows.rows.length)} of{" "}
              {groupedRows.rows.length}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows</span>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="h-8 w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safePage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {safePage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safePage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ManageTests;
