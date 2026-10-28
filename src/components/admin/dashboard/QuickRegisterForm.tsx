import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  User,
  UserPlus,
  X,
  Plus,
  Star,
  Loader2,
  Phone,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DateInput } from "@/components/ui/date-input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useLab } from "@/contexts/LabContext";
import { useOffline } from "@/contexts/OfflineContext";
import { searchPatients } from "@/lib/offline/sync";
import { useLive } from "@/lib/offline/useLive";
import {
  DEFAULT_COUNTRY_CODE,
  PHONE_COUNTRY_OPTIONS,
  buildStoragePhoneNumber,
  getPhoneLookupVariants,
} from "@/lib/phone";

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
}

interface CatalogTest {
  id: string;
  test_id: string | null;
  name: string;
  price: number | null;
  category_id: string | null;
}

interface TestCategory {
  id: string;
  name: string;
}

interface TestPackage {
  id: string;
  name: string;
  price: number | null;
  tests: string[];
}

interface Doctor {
  id: string;
  name: string;
  specialization: string | null;
  commission_percentage: number | null;
}

type QuickRegisterFormProps = {
  onNavigate?: (tabId: string) => void;
};

const QuickRegisterForm = ({ onNavigate }: QuickRegisterFormProps) => {
  const { user, isCollector } = useAuth();
  const { organization } = useOrganization();
  const { currentLab } = useLab();
  const organizationId = organization?.id ?? null;

  // Patient state
  const [patientSearch, setPatientSearch] = useState("");
  const [matchedPatients, setMatchedPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [searchingPatients, setSearchingPatients] = useState(false);

  // New patient fields
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientCountryCode, setNewPatientCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [newPatientGender, setNewPatientGender] = useState("");
  const [newPatientDob, setNewPatientDob] = useState("");

  // Test selection state
  const [testCatalog, setTestCatalog] = useState<CatalogTest[]>([]);
  const [categories, setCategories] = useState<TestCategory[]>([]);
  const [testPackages, setTestPackages] = useState<TestPackage[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [testSearch, setTestSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [selectedPackageId, setSelectedPackageId] = useState("none");
  const [appliedPackage, setAppliedPackage] = useState<TestPackage | null>(null);
  const [referredBy, setReferredBy] = useState("self");
  const [customDoctorName, setCustomDoctorName] = useState("");
  const [testDate, setTestDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [favoriteTests, setFavoriteTests] = useState<string[]>([]);

  // Labs
  const [labs, setLabs] = useState<Array<{ id: string; name: string; lab_code: string }>>([]);
  const [collectionCenters, setCollectionCenters] = useState<Array<{ id: string; name: string; code: string; lab_id: string }>>([]);
  const [labId, setLabId] = useState(currentLab?.id || "");
  const [collectionCenterId, setCollectionCenterId] = useState("");

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTestSection, setShowTestSection] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Auto-select first lab if none is set (required by RLS)
  useEffect(() => {
    if (!labId && labs.length > 0) {
      setLabId(currentLab?.id || labs[0].id);
    }
  }, [labs, currentLab?.id, labId]);

  // Catalog comes from the local database: instant, and works offline.
  const { db, registerVisit: registerVisitOffline } = useOffline();
  const liveTests = useLive(db ? () => db.tests.toArray() : null, [db], null as CatalogTest[] | null);
  const liveCategories = useLive(db ? () => db.categories.toArray() : null, [db], [] as TestCategory[]);
  const livePackages = useLive(db ? () => db.packages.toArray() : null, [db], [] as TestPackage[]);
  const liveDoctors = useLive(db ? () => db.doctors.toArray() : null, [db], [] as Doctor[]);
  const liveLabs = useLive(db ? () => db.labs.toArray() : null, [db], [] as Array<{ id: string; name: string; lab_code: string }>);
  const liveCenters = useLive(
    db ? () => db.centers.toArray() : null,
    [db],
    [] as Array<{ id: string; name: string; code: string; lab_id: string }>,
  );

  useEffect(() => {
    if (liveTests === null) return;
    setTestCatalog(liveTests);
    setCategories(liveCategories);
    setTestPackages(livePackages);
    setDoctors(liveDoctors);
    setLabs(liveLabs);
    setCollectionCenters(liveCenters);
    setDataLoaded(true);
  }, [liveTests, liveCategories, livePackages, liveDoctors, liveLabs, liveCenters]);

  // Load favorites
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
    }
  }, [currentLab?.id, organizationId]);

  // Patient search runs against the local copy, so results appear as you type.
  useEffect(() => {
    if (!patientSearch.trim() || !db) {
      setMatchedPatients([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingPatients(true);
      try {
        const found = await searchPatients(db, patientSearch, 30);
        // Collectors only see the patients they registered themselves.
        const visible = isCollector && user?.id ? found.filter((p) => p.created_by === user.id) : found;
        if (!cancelled) setMatchedPatients(visible.slice(0, 8));
      } catch (error) {
        console.error("Patient search error:", error);
      } finally {
        if (!cancelled) setSearchingPatients(false);
      }
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientSearch, db, isCollector, user?.id]);

  const testCatalogByName = useMemo(
    () => new Map(testCatalog.map((t) => [t.name, t] as const)),
    [testCatalog],
  );

  // Filter tests by search & category
  const filteredTestsByCategory = useMemo(() => {
    const grouped: Record<string, CatalogTest[]> = {};

    testCatalog.forEach((test) => {
      // Apply search filter
      if (testSearch && !test.name.toLowerCase().includes(testSearch.toLowerCase())) return;

      const category = test.category_id
        ? categories.find((c) => c.id === test.category_id)?.name || "Other"
        : "Other Tests";

      // Apply category filter
      if (selectedCategoryFilter !== "all" && category !== selectedCategoryFilter) return;

      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(test);
    });

    return grouped;
  }, [testCatalog, categories, testSearch, selectedCategoryFilter]);

  const selectedTestsTotal = useMemo(() => {
    const packageTestNames = appliedPackage
      ? new Set(
          testCatalog
            .filter((t) => appliedPackage.tests.includes(t.id))
            .map((t) => t.name),
        )
      : new Set<string>();

    let total = 0;
    selectedTests.forEach((name) => {
      if (appliedPackage && packageTestNames.has(name)) return;
      const test = testCatalogByName.get(name);
      total += test?.price || 0;
    });
    if (appliedPackage && selectedTests.some((n) => packageTestNames.has(n))) {
      total += appliedPackage.price || 0;
    }
    return total;
  }, [selectedTests, testCatalog, testCatalogByName, appliedPackage]);

  const toggleTestSelection = (testName: string) => {
    setSelectedTests((prev) =>
      prev.includes(testName) ? prev.filter((n) => n !== testName) : [...prev, testName],
    );
  };

  const handleAddPackageTests = () => {
    const pkg = testPackages.find((p) => p.id === selectedPackageId);
    if (!pkg) return;

    const packageTestNames = testCatalog
      .filter((t) => pkg.tests.includes(t.id))
      .map((t) => t.name);

    setSelectedTests((prev) => Array.from(new Set([...prev, ...packageTestNames])));
    setAppliedPackage(pkg);
    toast.success(`Added ${packageTestNames.length} tests from ${pkg.name}`);
  };

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setIsNewPatient(false);
    setPatientSearch("");
    setMatchedPatients([]);

    // Auto-populate lab
    if (patient.lab_id) {
      setLabId(patient.lab_id);
      if (patient.collection_center_id) {
        const cc = collectionCenters.find(
          (c) => c.id === patient.collection_center_id && c.lab_id === patient.lab_id,
        );
        setCollectionCenterId(cc ? patient.collection_center_id : "");
      }
    }
  };

  const handleNewPatientMode = () => {
    setIsNewPatient(true);
    setSelectedPatient(null);
    // Pre-fill name from search query
    setNewPatientName(patientSearch.trim());
    setPatientSearch("");
    setMatchedPatients([]);
  };

  const resetForm = () => {
    setSelectedPatient(null);
    setIsNewPatient(false);
    setPatientSearch("");
    setNewPatientName("");
    setNewPatientPhone("");
    setNewPatientCountryCode(DEFAULT_COUNTRY_CODE);
    setNewPatientGender("");
    setNewPatientDob("");
    setSelectedTests([]);
    setTestSearch("");
    setSelectedCategoryFilter("all");
    setSelectedPackageId("none");
    setAppliedPackage(null);
    setReferredBy("self");
    setCustomDoctorName("");
    setTestDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setLabId(currentLab?.id || labs[0]?.id || "");
    setCollectionCenterId("");
  };

  const handleSubmit = async () => {
    if (!organizationId) {
      toast.error("Organization context required");
      return;
    }

    if (!selectedPatient && !isNewPatient) {
      toast.error("Please select or create a patient");
      return;
    }

    if (isNewPatient && !newPatientName.trim()) {
      toast.error("Patient name is required");
      return;
    }

    if (isNewPatient && !newPatientPhone.trim()) {
      toast.error("Patient phone is required");
      return;
    }

    if (isNewPatient && newPatientPhone.replace(/\D/g, "").length !== 10) {
      toast.error("Phone number must be exactly 10 digits");
      return;
    }

    if (!labId) {
      toast.error("Please select a lab before submitting");
      return;
    }

    if (selectedTests.length === 0) {
      toast.error("Please select at least one test");
      return;
    }

    setIsSubmitting(true);

    try {
      let patientInput: Parameters<typeof registerVisitOffline>[0]["patient"];
      if (isNewPatient) {
        const normalizedPhone = buildStoragePhoneNumber(newPatientCountryCode, newPatientPhone);
        if (!normalizedPhone) {
          toast.error("Please enter a valid phone number");
          setIsSubmitting(false);
          return;
        }
        patientInput = {
          new: {
            full_name: newPatientName.trim(),
            phone: normalizedPhone,
            phoneVariants: getPhoneLookupVariants(normalizedPhone, newPatientCountryCode),
            gender: newPatientGender || null,
            date_of_birth: newPatientDob || null,
          },
        };
      } else {
        const existing = selectedPatient ? await db?.patients.get(selectedPatient.id) : undefined;
        if (!existing) {
          toast.error("No patient selected");
          setIsSubmitting(false);
          return;
        }
        patientInput = { existing };
      }

      const packageTestNames = appliedPackage
        ? new Set(
            testCatalog
              .filter((t) => appliedPackage.tests.includes(t.id))
              .map((t) => t.name),
          )
        : new Set<string>();
      const hasPackageTests = appliedPackage
        ? selectedTests.some((n) => packageTestNames.has(n))
        : false;

      const outcome = await registerVisitOffline({
        labId: labId || null,
        collectionCenterId: collectionCenterId || null,
        testDate,
        notes: notes || null,
        createdBy: user?.id ?? null,
        patient: patientInput,
        tests: selectedTests.map((testName) => ({
          test_name: testName,
          price: testCatalogByName.get(testName)?.price || 0,
          in_package: hasPackageTests && packageTestNames.has(testName),
        })),
        package:
          hasPackageTests && appliedPackage
            ? { id: appliedPackage.id, name: appliedPackage.name, price: appliedPackage.price || 0 }
            : null,
        referral:
          referredBy !== "self" && referredBy !== "custom"
            ? { doctor_id: referredBy, custom_name: customDoctorName || null }
            : null,
      });

      if (outcome.status === "failed") {
        toast.error(outcome.error);
        setIsSubmitting(false);
        return;
      }

      const matched = outcome.reusedPatient || (outcome.status === "synced" && outcome.result.patient_matched);
      if (isNewPatient && matched) {
        toast.info("A patient with this phone already exists. Using the existing record.");
      }

      const total = outcome.status === "synced" ? outcome.result.total_amount : outcome.item.total_amount;
      if (outcome.status === "synced") {
        toast.success(
          `${selectedTests.length} test(s) assigned. Invoice ${outcome.result.invoice_number} created (${"\u20B9"}${total}).`,
        );
      } else {
        toast.success(
          `Saved (${"\u20B9"}${total}). It will upload automatically and the invoice number appears once synced.`,
        );
      }
      resetForm();

      // Notify PendingResultsWidget to refresh
      window.dispatchEvent(new Event("quick-register-submitted"));
    } catch (error: any) {
      console.error("Quick register error:", error);
      toast.error(error.message || "Failed to register");
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasPatient = !!selectedPatient || isNewPatient;

  return (
    <Card className="shadow-md border-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Quick Register + Assign Tests
            </CardTitle>
            <CardDescription>
              Create or find a patient and assign tests in one step
            </CardDescription>
          </div>
          {hasPatient && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetForm}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" /> Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: Patient Selection / Creation */}
        {!hasPatient ? (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Patient</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or ID..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="pl-10"
                autoFocus
              />
              {searchingPatients && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {patientSearch.trim() && (
              <div className="border rounded-lg overflow-hidden">
                {matchedPatients.length > 0 && (
                  <div className="divide-y">
                    {matchedPatients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => handleSelectPatient(patient)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-muted text-left transition-colors"
                      >
                        <div className="p-1.5 rounded-full bg-primary/10">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {patient.full_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {patient.patient_id} &middot; {patient.phone}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleNewPatientMode}
                  className="w-full flex items-center gap-3 p-3 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-left transition-colors border-t bg-muted/30"
                >
                  <div className="p-1.5 rounded-full bg-emerald-500/10">
                    <Plus className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-emerald-700 dark:text-emerald-400">
                      Register new patient
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {patientSearch.trim() ? `"${patientSearch.trim()}"` : "Create new record"}
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>
        ) : selectedPatient ? (
          /* Selected existing patient */
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg border">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{selectedPatient.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedPatient.patient_id} &middot; {selectedPatient.phone}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedPatient(null);
                setPatientSearch("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : isNewPatient ? (
          /* New patient form */
          <div className="space-y-3 p-3 border rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <UserPlus className="h-4 w-4" /> New Patient
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsNewPatient(false);
                  setPatientSearch("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qr_name" className="text-xs">
                  Full Name *
                </Label>
                <Input
                  id="qr_name"
                  value={newPatientName}
                  onChange={(e) => setNewPatientName(e.target.value)}
                  placeholder="Patient name"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr_phone" className="text-xs">
                  Phone *
                </Label>
                <div className="flex gap-1.5">
                  <Select
                    value={newPatientCountryCode}
                    onValueChange={setNewPatientCountryCode}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHONE_COUNTRY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          +{opt.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="qr_phone"
                    value={newPatientPhone}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setNewPatientPhone(digits);
                    }}
                    placeholder="10 digit number"
                    className="flex-1"
                    inputMode="numeric"
                    maxLength={10}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr_gender" className="text-xs">
                  Gender
                </Label>
                <Select value={newPatientGender} onValueChange={setNewPatientGender}>
                  <SelectTrigger id="qr_gender">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr_dob" className="text-xs">
                  Date of Birth
                </Label>
                <DateInput
                  id="qr_dob"
                  value={newPatientDob}
                  onChange={setNewPatientDob}
                  captionLayout="dropdown-buttons"
                  fromYear={1920}
                  toYear={new Date().getFullYear()}
                  toDate={new Date()}
                />
              </div>
            </div>
          </div>
        ) : null}

        {/* Step 2: Test Selection (shown once patient is selected/being created) */}
        {hasPatient && (
          <Collapsible open={showTestSection} onOpenChange={setShowTestSection}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between py-2 text-sm font-medium hover:text-primary transition-colors"
              >
                <span className="flex items-center gap-2">
                  Select Tests
                  {selectedTests.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedTests.length}
                    </Badge>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {showTestSection ? "Collapse" : "Expand"}
                </span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
              {/* Quick favorites bar */}
              {favoriteTests.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {favoriteTests.slice(0, 8).map((testName) => {
                    const active = selectedTests.includes(testName);
                    return (
                      <Badge
                        key={testName}
                        variant={active ? "default" : "secondary"}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleTestSelection(testName)}
                      >
                        <Star className="h-3 w-3 mr-1 fill-amber-400 text-amber-500" />
                        {active ? <span className="mr-1">&check;</span> : null}
                        {testName}
                      </Badge>
                    );
                  })}
                </div>
              )}

              {/* Package selection */}
              <div className="flex gap-2">
                <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select package (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Package</SelectItem>
                    {testPackages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} ({"\u20B9"}{pkg.price || 0})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddPackageTests}
                  disabled={selectedPackageId === "none"}
                >
                  Add
                </Button>
              </div>

              {/* Search and filter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tests..."
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                    className="pl-10 h-9 text-sm"
                  />
                </div>
                <Select
                  value={selectedCategoryFilter}
                  onValueChange={setSelectedCategoryFilter}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Test catalog list */}
              <ScrollArea className="h-48 border rounded-lg">
                <div className="p-2 space-y-3">
                  {Object.entries(filteredTestsByCategory).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No tests found
                    </p>
                  ) : (
                    Object.entries(filteredTestsByCategory).map(
                      ([category, categoryTests]) => (
                        <div key={category} className="space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
                            {category}
                          </p>
                          {categoryTests.map((test) => (
                            <Label
                              key={test.id}
                              htmlFor={`qr_test_${test.id}`}
                              className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer transition-colors text-sm"
                            >
                              <Checkbox
                                id={`qr_test_${test.id}`}
                                checked={selectedTests.includes(test.name)}
                                onCheckedChange={() => toggleTestSelection(test.name)}
                              />
                              <span className="flex-1">{test.name}</span>
                              {test.price != null && (
                                <span className="text-xs text-muted-foreground">
                                  {"\u20B9"}{test.price}
                                </span>
                              )}
                            </Label>
                          ))}
                        </div>
                      ),
                    )
                  )}
                </div>
              </ScrollArea>

              {/* Selected tests summary */}
              {selectedTests.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {selectedTests.length} test(s) selected
                    </span>
                    <span className="font-medium">{"\u20B9"}{selectedTestsTotal}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTests.map((name) => (
                      <Badge
                        key={name}
                        variant="secondary"
                        className="cursor-pointer text-xs hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => toggleTestSelection(name)}
                      >
                        {name} <X className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qr_referred_by" className="text-xs">
                    Referred By
                  </Label>
                  <Select
                    value={referredBy}
                    onValueChange={(v) => {
                      setReferredBy(v);
                      setCustomDoctorName("");
                    }}
                  >
                    <SelectTrigger id="qr_referred_by" className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">Self</SelectItem>
                      {doctors.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          Dr. {d.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {labs.length > 1 && (
                  <div className="space-y-1.5">
                    <Label htmlFor="qr_lab" className="text-xs">
                      Lab *
                    </Label>
                    <Select
                      value={labId}
                      onValueChange={(v) => {
                        setLabId(v);
                        setCollectionCenterId("");
                      }}
                    >
                      <SelectTrigger id="qr_lab" className={`h-9 text-sm ${!labId ? "border-destructive" : ""}`}>
                        <SelectValue placeholder="Select lab" />
                      </SelectTrigger>
                      <SelectContent>
                        {labs.map((lab) => (
                          <SelectItem key={lab.id} value={lab.id}>
                            {lab.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {referredBy === "custom" && (
                <Input
                  placeholder="Enter doctor's name..."
                  value={customDoctorName}
                  onChange={(e) => setCustomDoctorName(e.target.value)}
                  className="h-9 text-sm"
                />
              )}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Submit */}
        {hasPatient && (
          <Button
            className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
            disabled={isSubmitting || selectedTests.length === 0}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {isNewPatient ? "Register Patient & " : ""}
                Assign {selectedTests.length} Test{selectedTests.length !== 1 ? "s" : ""}{" "}
                {selectedTestsTotal > 0 && `(${"\u20B9"}${selectedTestsTotal})`}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default QuickRegisterForm;
