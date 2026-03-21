import { useCallback, useEffect, useMemo, useRef, startTransition, useState } from "react";
import { Plus, CheckCircle, Clock, AlertCircle, Calendar, FileSpreadsheet, Printer, History } from "lucide-react";
import { exportToExcel } from "@/lib/exportToExcel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateMultiTestReportPDF } from "@/components/patient/TestReportPDF";
import { useLab } from "@/contexts/LabContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/hooks/useAuth";
import { formatAppDateTime } from "@/lib/date";
import { generateScopedInvoiceNumber } from "@/lib/invoiceNumbers";
import { TestFilters } from "./tests/TestFilters";
import { TestTable } from "./tests/TestTable";
import { TestFormDialog } from "./tests/TestFormDialog";
import { TestResultEntry } from "./tests/TestResultEntry";
import {
  PatientTest,
  AuditLog,
  Patient,
  TestCategory,
  Test,
  Doctor,
  TestPackage,
  ReportTemplateOption,
  ResultItem,
  ResultItemInput,
  ResultDataState,
} from "./tests/types";

interface ManageTestsProps {
  preselectedPatient?: Patient | null;
}

const ManageTests = ({ preselectedPatient }: ManageTestsProps) => {
  const { user, isCollector } = useAuth();
  const { currentLab } = useLab();
  const { organization, branding, loading: organizationLoading } = useOrganization();
  const organizationId = organization?.id ?? null;

  const [tests, setTests] = useState<PatientTest[]>([]);
  const [linkedTestIds, setLinkedTestIds] = useState<Set<string>>(new Set());
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
  const [usePanelResults, setUsePanelResults] = useState(false);
  const [printOptions, setPrintOptions] = useState({
    includeHeader: true,
    includeFooter: true,
    includeWatermark: true,
  });
  const [reportTemplates, setReportTemplates] = useState<ReportTemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("auto");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarningAccepted, setDuplicateWarningAccepted] = useState(false);
  const [favoriteTests, setFavoriteTests] = useState<string[]>([]);
  const lastPreselectedPatientIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scopeKey = currentLab?.id || organizationId || "global";
    const raw = window.localStorage.getItem(`favorite_tests_${scopeKey}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setFavoriteTests(parsed.filter(Boolean).slice(0, 20));
      } catch {
        setFavoriteTests([]);
      }
    } else {
      setFavoriteTests([]);
    }
  }, [currentLab?.id, organizationId]);

  const patientTestInsights = useMemo(() => {
    if (!selectedPatient) {
      return { recentTestSuggestions: [] as string[], pendingCount: 0, completedCount: 0, lastTestDate: "" };
    }

    const patientRows = tests.filter((t) => t.patient_id === selectedPatient.id);
    const pendingCount = patientRows.filter((t) => t.status === "pending" || t.status === "in_progress").length;
    const completedCount = patientRows.filter((t) => t.status === "completed").length;
    const lastTestDate = patientRows[0]?.test_date || "";

    const recentTestSuggestions = Array.from(
      new Set(
        patientRows
          .slice(0, 30)
          .map((t) => t.test_name)
          .filter(Boolean)
      )
    ).slice(0, 8);

    return { recentTestSuggestions, pendingCount, completedCount, lastTestDate };
  }, [tests, selectedPatient]);

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
    if (!preselectedPatient) {
      lastPreselectedPatientIdRef.current = null;
      return;
    }

    const isNewPreselectedPatient = lastPreselectedPatientIdRef.current !== preselectedPatient.id;

    setSelectedPatient(preselectedPatient);
    setPatientSearch("");
    if (isNewPreselectedPatient) {
      setIsDialogOpen(true);
      lastPreselectedPatientIdRef.current = preselectedPatient.id;
    }

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

  const popularTodaySuggestions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const counts = new Map<string, number>();
    tests
      .filter((t) => t.test_date?.slice(0, 10) === today)
      .forEach((t) => counts.set(t.test_name, (counts.get(t.test_name) || 0) + 1));

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);
  }, [tests]);

  const weightedTestCatalog = useMemo(() => {
    const patientRecentSet = new Set(patientTestInsights.recentTestSuggestions);
    return [...testCatalog].sort((a, b) => {
      const score = (name: string) => {
        let s = 0;
        if (favoriteTests.includes(name)) s += 100;
        if (patientRecentSet.has(name)) s += 60;
        if (popularTodaySuggestions.includes(name)) s += 30;
        return s;
      };
      return score(b.name) - score(a.name) || a.name.localeCompare(b.name);
    });
  }, [testCatalog, favoriteTests, patientTestInsights.recentTestSuggestions, popularTodaySuggestions]);

  // Group tests by category
  const testsByCategory = useMemo(() => {
    const grouped: Record<string, Test[]> = {};
    const uncategorized: Test[] = [];

    weightedTestCatalog.forEach((test) => {
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
  }, [weightedTestCatalog, categories]);

  useEffect(() => {
    setDuplicateWarningAccepted(false);
  }, [selectedPatient?.id, selectedTests]);

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
    const filtered: Record<string, Test[]> = {};
    const searchLower = testSearch.trim().toLowerCase();

    Object.entries(testsByCategory).forEach(([category, catTests]) => {
      if (selectedCategoryFilter !== "all" && category !== selectedCategoryFilter) {
        return;
      }

      const matchingTests = searchLower
        ? catTests.filter((t) => {
            const nameMatch = t.name.toLowerCase().includes(searchLower);
            const codeMatch = t.test_id?.toLowerCase().includes(searchLower) || false;
            return nameMatch || codeMatch;
          })
        : catTests;

      if (matchingTests.length > 0) {
        filtered[category] = matchingTests;
      }
    });

    return filtered;
  }, [testsByCategory, testSearch, selectedCategoryFilter]);

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

  const fetchData = useCallback(async () => {
    if (!organizationId) {
      setTests([]);
      setPatients([]);
      setCategories([]);
      setTestCatalog([]);
      setDoctors([]);
      setTestPackages([]);
      setReportTemplates([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let testsQuery = (supabase as any)
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
            gender,
            date_of_birth,
            blood_group,
            created_by,
            abha_address
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

      testsQuery = testsQuery.eq("organization_id" as any, organizationId);

      let patientsQuery: any = (supabase as any)
        .from("patients")
        .select("id, patient_id, full_name, phone, lab_id, collection_center_id")
        .eq("is_active", true)
        .eq("organization_id" as any, organizationId);

      if (isCollector && user?.id) {
        patientsQuery = patientsQuery.eq("created_by", user.id);
      }

      const templatesQuery = (supabase as any)
        .from("test_templates")
        .select("id, name, is_default")
        .eq("organization_id" as any, organizationId)
        .order("name");

      const categoriesQuery = (supabase as any)
        .from("test_categories")
        .select("id, name")
        .eq("organization_id", organizationId);

      const catalogQuery = (supabase as any)
        .from("tests")
        .select("id, test_id, name, price, category_id, unit, normal_range_text, normal_range_min, normal_range_max")
        .eq("is_active", true)
        .eq("organization_id", organizationId);

      const packagesQuery = (supabase as any)
        .from("test_packages")
        .select("id, name, price, discount_percentage, is_active")
        .eq("is_active", true)
        .eq("organization_id", organizationId);

      const doctorsQuery = (supabase as any)
        .from("doctors")
        .select("id, name, specialization, commission_percentage")
        .eq("is_active", true)
        .eq("organization_id" as any, organizationId);

      const [testsRes, patientsRes, categoriesRes, catalogRes, doctorsRes, packagesRes, packageTestsRes, templatesRes] = await Promise.all([
        testsQuery.order("created_at", { ascending: false }),
        patientsQuery,
        categoriesQuery,
        catalogQuery,
        doctorsQuery,
        packagesQuery,
        (supabase as any).from("test_package_tests").select("package_id, test_id"),
        templatesQuery,
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

      if (isCollector && user?.id) {
        testsData = testsData.filter((test) => {
          const testAny = test as any;
          const testCollectedBy = testAny.collected_by === user.id;
          const patientCreatedBy = testAny.patients?.created_by === user.id;
          return testCollectedBy || patientCreatedBy;
        }) as PatientTest[];
      }

      setTests(testsData);

      const completedTestIds = testsData
        .filter((t) => t.status === "completed" && (t.patients as any)?.abha_address)
        .map((t) => t.id);
      if (completedTestIds.length > 0) {
        const { data: linkData } = await (supabase as any)
          .from("abdm_care_context_links" as any)
          .select("patient_test_id")
          .eq("organization_id" as any, organizationId)
          .in("patient_test_id", completedTestIds)
          .in("link_status", ["linked", "notified"]);
        const ids = new Set<string>((linkData || []).map((r: any) => r.patient_test_id).filter(Boolean));
        setLinkedTestIds(ids);
      } else {
        setLinkedTestIds(new Set());
      }

      setPatients(patientsRes.data || []);
      setCategories(categoriesRes.data || []);
      setTestCatalog((catalogRes.data || []) as Test[]);
      setDoctors(doctorsRes.data || []);
      const packageTestsMap = new Map<string, string[]>();
      (packageTestsRes.data || []).forEach((row) => {
        const existing = packageTestsMap.get(row.package_id) || [];
        packageTestsMap.set(row.package_id, [...existing, row.test_id]);
      });
      const packageIds = (packagesRes.data || []).map((pkg) => pkg.id);
      const packages = (packagesRes.data || []).map((pkg) => ({
        ...pkg,
        tests: packageTestsMap.get(pkg.id) || [],
      })) as TestPackage[];
      setTestPackages(packages.filter((pkg) => packageIds.includes(pkg.id)));
      setReportTemplates((templatesRes.data || []) as ReportTemplateOption[]);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Failed to fetch data: " + (error.message || "Unknown error"));
      setTests([]);
      setPatients([]);
      setCategories([]);
      setTestCatalog([]);
      setDoctors([]);
      setTestPackages([]);
    } finally {
      setLoading(false);
    }
  }, [isCollector, organizationId, user?.id]);

  const fetchLabs = useCallback(async () => {
    try {
      if (!organizationId) {
        setLabs([]);
        return;
      }

      const { data, error } = await (supabase as any)
        .from("labs")
        .select("id, name, lab_code")
        .eq("is_active", true)
        .eq("organization_id" as any, organizationId)
        .order("name");

      if (error) {
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
  }, [organizationId]);

  const fetchCollectionCenters = useCallback(async () => {
    try {
      if (!organizationId) {
        setCollectionCenters([]);
        return;
      }

      const { data, error } = await (supabase as any)
        .from("collection_centers")
        .select("id, name, code, lab_id")
        .eq("is_active", true)
        .eq("organization_id" as any, organizationId)
        .order("name");

      if (error) {
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
  }, [organizationId]);

  useEffect(() => {
    if (organizationLoading) {
      return;
    }

    if (!organizationId) {
      setTests([]);
      setPatients([]);
      setCategories([]);
      setTestCatalog([]);
      setDoctors([]);
      setTestPackages([]);
      setReportTemplates([]);
      setLabs([]);
      setCollectionCenters([]);
      setLoading(false);
      return;
    }

    void fetchData();
    void fetchLabs();
    void fetchCollectionCenters();
  }, [fetchCollectionCenters, fetchData, fetchLabs, organizationId, organizationLoading]);

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

  const toggleFavoriteTest = (testName: string) => {
    const scopeKey = currentLab?.id || organizationId || "global";
    setFavoriteTests((prev) => {
      const next = prev.includes(testName) ? prev.filter((t) => t !== testName) : [testName, ...prev].slice(0, 20);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`favorite_tests_${scopeKey}`, JSON.stringify(next));
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

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const duplicateTests = Array.from(
      new Set(
        tests
          .filter((t) =>
            t.patient_id === selectedPatient.id &&
            selectedTests.includes(t.test_name) &&
            new Date(t.test_date) >= thirtyDaysAgo
          )
          .map((t) => t.test_name)
      )
    );

    if (duplicateTests.length > 0 && !duplicateWarningAccepted) {
      toast.warning(`Possible duplicate in last 30 days: ${duplicateTests.slice(0, 4).join(", ")}${duplicateTests.length > 4 ? "..." : ""}. Click confirm again to proceed.`);
      setDuplicateWarningAccepted(true);
      return;
    }

    setIsSubmitting(true);

    try {
      if (!organizationId) {
        throw new Error("Organization context is required before adding tests");
      }

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

      const testsToInsert = selectedTests.map((testName) => ({
        patient_id: selectedPatient.id,
        organization_id: organizationId,
        test_name: testName,
        test_date: formData.test_date,
        notes: formData.notes || null,
        status: "pending",
        created_by: userData.user?.id,
        collected_by: userData.user?.id,
        collected_at: new Date().toISOString(),
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

      const invoiceNumber = await generateScopedInvoiceNumber(organizationId);

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

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          patient_id: selectedPatient.id,
          organization_id: organizationId,
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

      const invoiceItems = invoiceItemsData.map(item => ({
        ...item,
        invoice_id: invoice.id,
        organization_id: organizationId,
      }));

      const { error: itemsError } = await supabase
        .from("invoice_items")
        .insert(invoiceItems);

      if (itemsError) throw itemsError;

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
              organization_id: organizationId,
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
    setDuplicateWarningAccepted(false);
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
      if (!organizationId) {
        throw new Error("Organization context is required before updating test results");
      }

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

      if (!hadResult && willHaveResult) {
        updateData.result_entered_by = user?.id;
        updateData.result_entered_at = new Date().toISOString();
      }

      const { error } = await (supabase as any)
        .from("patient_tests")
        .update(updateData)
        .eq("id", selectedTest.id)
        .eq("organization_id" as any, organizationId);

      if (error) throw error;

      if (!wasCompleted && willComplete) {
        try {
          const { sendAllTestsReadyNotification, sendTestResultNotification } = await import("@/services/notificationService");
          const { data: invoiceItem } = await supabase
            .from("invoice_items")
            .select("invoice_id")
            .eq("patient_test_id", selectedTest.id)
            .eq("organization_id", organizationId)
            .maybeSingle();

          if (invoiceItem?.invoice_id) {
            const { data: invoiceItems, error: invoiceItemsError } = await supabase
              .from("invoice_items")
              .select("patient_test_id, patient_tests(status,result,result_value,test_name)")
              .eq("invoice_id", invoiceItem.invoice_id)
              .eq("organization_id", organizationId);

            if (!invoiceItemsError && invoiceItems) {
              const scopedInvoiceItems = invoiceItems.filter(Boolean);

              const allCompleted = scopedInvoiceItems.every((item) => {
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
                const testNames = scopedInvoiceItems
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
    const catalogTest = testCatalog.find(t => t.name === test.test_name);
    const panelItems = normalizePanelItems(test.result_items);

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
    const matchesDate =
      (!dateFrom || (test.test_date && test.test_date >= dateFrom)) &&
      (!dateTo || (test.test_date && test.test_date <= dateTo));

    return matchesSearch && matchesStatus && matchesLab && matchesCollectionCenter && matchesDate;
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
  }, [search, statusFilter, labFilter, collectionCenterFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  const pendingCount = tests.filter(t => t.status === "pending").length;
  const inProgressCount = tests.filter(t => t.status === "in_progress").length;
  const completedCount = tests.filter(t => t.status === "completed").length;

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

  const toggleExpandPackageGroup = (groupId: string) => {
    setExpandedPackageGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
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
        created_at: test.created_at,
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

    let printedCount = 0;
    try {
      for (const patientData of Object.values(testsByPatient)) {
        const success = await generateMultiTestReportPDF(
          {
            full_name: patientData.patient.full_name,
            patient_id: patientData.patient.patient_id,
            phone: patientData.patient.phone,
            gender: patientData.patient.gender || undefined,
            date_of_birth: patientData.patient.date_of_birth || undefined,
            blood_group: patientData.patient.blood_group || undefined,
          },
          patientData.tests,
          undefined,
          printOptions,
          selectedTemplateId === "auto" ? undefined : selectedTemplateId,
          {
            organizationId: organization?.id || undefined,
            name: branding.displayName,
            tagline: branding.tagline,
            address: branding.addressLines.join(", "),
            phone: branding.phoneNumbers.join(" | "),
            email: branding.email,
            website: branding.website,
            logoUrl: branding.logoUrl,
            reportTagline: branding.reportTagline,
            reportFooterNote: branding.reportFooterNote,
          }
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
      <div className="flex flex-wrap gap-3 justify-between items-start">
        <TestFilters
          search={search}
          onSearchChange={setSearch}
          statusFilter={statusFilter}
          labFilter={labFilter}
          onLabFilterChange={setLabFilter}
          collectionCenterFilter={collectionCenterFilter}
          onCollectionCenterFilterChange={setCollectionCenterFilter}
          dateFrom={dateFrom}
          onDateFromChange={setDateFrom}
          dateTo={dateTo}
          onDateToChange={setDateTo}
          labs={labs}
          collectionCenters={collectionCenters}
          onClearFilters={() => {
            setStatusFilter("all");
            setLabFilter("all");
            setCollectionCenterFilter("all");
            setDateFrom("");
            setDateTo("");
          }}
        />

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              exportToExcel("tests", [
                { key: "patient_name", label: "Patient" },
                { key: "patient_id_code", label: "Patient ID" },
                { key: "test_name", label: "Test" },
                { key: "test_date", label: "Test Date" },
                { key: "status", label: "Status" },
                { key: "result", label: "Result" },
                { key: "result_value", label: "Value" },
                { key: "result_unit", label: "Unit" },
                { key: "is_abnormal", label: "Abnormal" },
                { key: "lab_name", label: "Lab" },
              ], filteredTests.map(t => ({
                ...t,
                patient_name: t.patients?.full_name ?? "",
                patient_id_code: t.patients?.patient_id ?? "",
                lab_name: t.labs?.name ?? "",
                test_date: t.test_date ? new Date(t.test_date).toLocaleDateString("en-IN") : "",
                is_abnormal: t.is_abnormal ? "Yes" : "No",
              })))
            }
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Export
          </Button>
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
            <TestFormDialog
              isDialogContentReady={isDialogContentReady}
              isConfirmOpen={isConfirmOpen}
              onConfirmOpenChange={setIsConfirmOpen}
              isSubmitting={isSubmitting}
              selectedPatient={selectedPatient}
              onSelectPatient={(patient) => {
                setSelectedPatient(patient);
                if (patient) {
                  setPatientSearch("");
                  const patientLabId = patient.lab_id || currentLab?.id || "";
                  let patientCollectionCenterId = patient.collection_center_id || "";

                  if (patientCollectionCenterId && patientLabId) {
                    const collectionCenter = collectionCenters.find(
                      cc => cc.id === patientCollectionCenterId && cc.lab_id === patientLabId
                    );
                    if (!collectionCenter) {
                      patientCollectionCenterId = "";
                    }
                  } else if (patientCollectionCenterId && !patientLabId) {
                    patientCollectionCenterId = "";
                  }

                  setFormData(prev => ({
                    ...prev,
                    lab_id: patientLabId,
                    collection_center_id: patientCollectionCenterId,
                  }));
                }
              }}
              patientSearch={patientSearch}
              onPatientSearchChange={setPatientSearch}
              filteredPatients={filteredPatients}
              collectionCenters={collectionCenters}
              labs={labs}
              formData={formData}
              onFormDataChange={setFormData}
              selectedTests={selectedTests}
              selectedPackageId={selectedPackageId}
              onSelectedPackageIdChange={setSelectedPackageId}
              testPackages={testPackages}
              onAddPackageTests={handleAddPackageTests}
              testSearch={testSearch}
              onTestSearchChange={setTestSearch}
              selectedCategoryFilter={selectedCategoryFilter}
              onSelectedCategoryFilterChange={setSelectedCategoryFilter}
              categories={categories}
              filteredTestsByCategory={filteredTestsByCategory}
              onToggleTestSelection={toggleTestSelection}
              onSelectAllInCategory={selectAllInCategory}
              appliedPackage={appliedPackage}
              showPackageTestsIndividually={showPackageTestsIndividually}
              onShowPackageTestsIndividuallyChange={setShowPackageTestsIndividually}
              onRemovePackage={() => {
                const packageNames = new Set(
                  testCatalog
                    .filter((test) => appliedPackage?.tests.includes(test.id))
                    .map((test) => test.name)
                );
                setSelectedTests((prev) => prev.filter((name) => !packageNames.has(name)));
                setAppliedPackage(null);
                setSelectedPackageId("none");
                setShowPackageTestsIndividually(false);
              }}
              selectedTestsTotal={selectedTestsTotal}
              recentTestSuggestions={patientTestInsights.recentTestSuggestions}
              popularTodaySuggestions={popularTodaySuggestions}
              favoriteTests={favoriteTests}
              onToggleFavoriteTest={toggleFavoriteTest}
              pendingCount={patientTestInsights.pendingCount}
              completedCount={patientTestInsights.completedCount}
              lastTestDate={patientTestInsights.lastTestDate}
              testCatalog={testCatalog}
              doctors={doctors}
              onCancel={() => setIsDialogOpen(false)}
              onSubmitConfirm={() => {
                if (isConfirmOpen) {
                  void handleSubmit();
                } else {
                  setIsConfirmOpen(true);
                }
              }}
              currentLabId={currentLab?.id}
            />
          </Dialog>
        </div>
      </div>

      {/* Result Dialog */}
      <TestResultEntry
        isOpen={isResultDialogOpen}
        onOpenChange={setIsResultDialogOpen}
        selectedTest={selectedTest}
        resultData={resultData}
        onResultDataChange={setResultData}
        usePanelResults={usePanelResults}
        onUsePanelResultsChange={setUsePanelResults}
        isSubmitting={isSubmitting}
        testCatalog={testCatalog}
        onSubmit={handleResultSubmit}
        onUpdatePanelItem={updatePanelItem}
        onAddPanelItem={addPanelItem}
        onRemovePanelItem={removePanelItem}
        getDefaultPanelItems={getDefaultPanelItems}
        getPanelAbnormal={getPanelAbnormal}
        emptyResultItem={emptyResultItem}
      />

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
                  Very light organization logo behind the report content
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
      <TestTable
        loading={loading}
        filteredTests={filteredTests}
        pagedRows={pagedRows}
        groupedRows={groupedRows}
        selectedTestIds={selectedTestIds}
        expandedPackageGroups={expandedPackageGroups}
        organizationId={organizationId}
        linkedTestIds={linkedTestIds}
        statusFilter={statusFilter}
        safePage={safePage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        onTogglePrintSelection={togglePrintSelection}
        onToggleAllSelection={toggleAllSelection}
        onTogglePackageSelection={togglePackageSelection}
        onToggleExpandPackageGroup={toggleExpandPackageGroup}
        onOpenResultDialog={openResultDialog}
        onOpenAuditDialog={openAuditDialog}
        getStatusBadge={getStatusBadge}
      />
    </div>
  );
};

export default ManageTests;
