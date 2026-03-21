import { Search, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { Patient, Test, TestCategory, TestPackage, Doctor } from "./types";

interface FormData {
  test_date: string;
  notes: string;
  referred_by: string;
  custom_doctor_name: string;
  lab_id: string;
  collection_center_id: string;
}

interface Lab {
  id: string;
  name: string;
  lab_code: string;
}

interface CollectionCenter {
  id: string;
  name: string;
  code: string;
  lab_id: string;
}

interface TestFormDialogProps {
  isDialogContentReady: boolean;
  isConfirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  selectedPatient: Patient | null;
  onSelectPatient: (patient: Patient | null) => void;
  patientSearch: string;
  onPatientSearchChange: (value: string) => void;
  filteredPatients: Patient[];
  collectionCenters: CollectionCenter[];
  labs: Lab[];
  formData: FormData;
  onFormDataChange: (data: FormData) => void;
  selectedTests: string[];
  selectedPackageId: string;
  onSelectedPackageIdChange: (id: string) => void;
  testPackages: TestPackage[];
  onAddPackageTests: () => void;
  testSearch: string;
  onTestSearchChange: (value: string) => void;
  selectedCategoryFilter: string;
  onSelectedCategoryFilterChange: (value: string) => void;
  categories: TestCategory[];
  filteredTestsByCategory: Record<string, Test[]>;
  onToggleTestSelection: (testName: string) => void;
  onSelectAllInCategory: (categoryTests: Test[]) => void;
  appliedPackage: TestPackage | null;
  showPackageTestsIndividually: boolean;
  onShowPackageTestsIndividuallyChange: (value: boolean) => void;
  onRemovePackage: () => void;
  selectedTestsTotal: number;
  recentTestSuggestions: string[];
  pendingCount: number;
  completedCount: number;
  lastTestDate: string;
  testCatalog: Test[];
  doctors: Doctor[];
  onCancel: () => void;
  onSubmitConfirm: () => void;
  currentLabId?: string;
}

export const TestFormDialog = ({
  isDialogContentReady,
  isConfirmOpen,
  onConfirmOpenChange,
  isSubmitting,
  selectedPatient,
  onSelectPatient,
  patientSearch,
  onPatientSearchChange,
  filteredPatients,
  collectionCenters,
  labs,
  formData,
  onFormDataChange,
  selectedTests,
  selectedPackageId,
  onSelectedPackageIdChange,
  testPackages,
  onAddPackageTests,
  testSearch,
  onTestSearchChange,
  selectedCategoryFilter,
  onSelectedCategoryFilterChange,
  categories,
  filteredTestsByCategory,
  onToggleTestSelection,
  onSelectAllInCategory,
  appliedPackage,
  showPackageTestsIndividually,
  onShowPackageTestsIndividuallyChange,
  onRemovePackage,
  selectedTestsTotal,
  recentTestSuggestions,
  pendingCount,
  completedCount,
  lastTestDate,
  testCatalog,
  doctors,
  onCancel,
  onSubmitConfirm,
}: TestFormDialogProps) => {
  return (
    <>
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
                        <div className="space-y-2">
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
                              onClick={() => onSelectPatient(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-md border p-2 bg-background">
                              <p className="text-muted-foreground">Pending</p>
                              <p className="font-semibold">{pendingCount}</p>
                            </div>
                            <div className="rounded-md border p-2 bg-background">
                              <p className="text-muted-foreground">Completed</p>
                              <p className="font-semibold">{completedCount}</p>
                            </div>
                            <div className="rounded-md border p-2 bg-background">
                              <p className="text-muted-foreground">Last Test</p>
                              <p className="font-semibold">{lastTestDate || "—"}</p>
                            </div>
                          </div>
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
                              onChange={(e) => onPatientSearchChange(e.target.value)}
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
                                        onSelectPatient(patient);
                                        onPatientSearchChange("");
                                        // Auto-populate lab and collection center from patient
                                        const patientLabId = patient.lab_id || "";
                                        let patientCollectionCenterId = patient.collection_center_id || "";

                                        // Verify collection center belongs to the patient's lab
                                        if (patientCollectionCenterId && patientLabId) {
                                          const collectionCenter = collectionCenters.find(
                                            (cc) =>
                                              cc.id === patientCollectionCenterId &&
                                              cc.lab_id === patientLabId
                                          );
                                          if (!collectionCenter) {
                                            patientCollectionCenterId = ""; // Clear if doesn't match
                                          }
                                        } else if (patientCollectionCenterId && !patientLabId) {
                                          patientCollectionCenterId = ""; // Clear if no lab selected
                                        }

                                        onFormDataChange({
                                          ...formData,
                                          lab_id: patientLabId,
                                          collection_center_id: patientCollectionCenterId,
                                        });
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="lab_id">Lab</Label>
                          <Select
                            name="lab_id"
                            value={formData.lab_id || "none"}
                            onValueChange={(value) =>
                              onFormDataChange({
                                ...formData,
                                lab_id: value === "none" ? "" : value,
                                collection_center_id: "",
                              })
                            }
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
                            onValueChange={(value) =>
                              onFormDataChange({
                                ...formData,
                                collection_center_id: value === "none" ? "" : value,
                              })
                            }
                            disabled={!formData.lab_id}
                          >
                            <SelectTrigger id="collection_center_id">
                              <SelectValue
                                placeholder={
                                  formData.lab_id
                                    ? "Select center (optional)"
                                    : "Select lab first"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {collectionCenters
                                .filter((cc) => cc.lab_id === formData.lab_id)
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
                        <Select
                          name="test_package_id"
                          value={selectedPackageId}
                          onValueChange={onSelectedPackageIdChange}
                        >
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
                        onClick={onAddPackageTests}
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
                          onChange={(e) => onTestSearchChange(e.target.value)}
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
                          onValueChange={onSelectedCategoryFilterChange}
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

                    {recentTestSuggestions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">Quick add from patient history</p>
                        <div className="flex flex-wrap gap-2">
                          {recentTestSuggestions.map((testName) => {
                            const active = selectedTests.includes(testName);
                            return (
                              <Badge
                                key={testName}
                                variant={active ? "default" : "secondary"}
                                className="cursor-pointer"
                                onClick={() => onToggleTestSelection(testName)}
                              >
                                {active ? "✓ " : ""}{testName}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
                            Object.entries(filteredTestsByCategory).map(
                              ([category, categoryTests]) => (
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
                                      onClick={() => onSelectAllInCategory(categoryTests)}
                                    >
                                      {categoryTests.every((t) =>
                                        selectedTests.includes(t.name)
                                      )
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
                                          onCheckedChange={() =>
                                            onToggleTestSelection(test.name)
                                          }
                                        />
                                        <div className="flex-1">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium">{test.name}</span>
                                            {test.test_id && (
                                              <Badge
                                                variant="outline"
                                                className="font-mono text-[10px]"
                                              >
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
                              )
                            )
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
                            Package: {appliedPackage.name} (₹{appliedPackage.price || 0}) •{" "}
                            {appliedPackage.tests.length} tests
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Show tests</span>
                            <Switch
                              checked={showPackageTestsIndividually}
                              onCheckedChange={onShowPackageTestsIndividuallyChange}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={onRemovePackage}
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
                                    onClick={() => onToggleTestSelection(testName)}
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
                      <p className="text-xs text-muted-foreground">Click a test to remove it.</p>
                    </div>
                  </div>

                  {/* Referred By Section */}
                  <div className="space-y-2">
                    <Label htmlFor="referred_by">Referred By</Label>
                    <Select
                      name="referred_by"
                      value={formData.referred_by}
                      onValueChange={(value) =>
                        onFormDataChange({ ...formData, referred_by: value, custom_doctor_name: "" })
                      }
                    >
                      <SelectTrigger id="referred_by">
                        <SelectValue placeholder="Select referral source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">Self</SelectItem>
                        {doctors.map((doctor) => (
                          <SelectItem key={doctor.id} value={doctor.id}>
                            Dr. {doctor.name}{" "}
                            {doctor.specialization ? `(${doctor.specialization})` : ""}
                            {doctor.commission_percentage
                              ? ` - ${doctor.commission_percentage}%`
                              : ""}
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
                        onChange={(e) =>
                          onFormDataChange({ ...formData, custom_doctor_name: e.target.value })
                        }
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
                        onChange={(value) => onFormDataChange({ ...formData, test_date: value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Input
                        id="notes"
                        value={formData.notes}
                        onChange={(e) =>
                          onFormDataChange({ ...formData, notes: e.target.value })
                        }
                        placeholder="Any notes..."
                      />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}

          <div className="border-t px-4 py-3 flex items-center justify-between shrink-0">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-clinical-navy hover:bg-clinical-navy/90"
              disabled={isSubmitting || !selectedPatient || selectedTests.length === 0}
              onClick={onSubmitConfirm}
            >
              Add {selectedTests.length} Test{selectedTests.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </form>
      </DialogContent>

      <AlertDialog open={isConfirmOpen} onOpenChange={onConfirmOpenChange}>
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
                  {selectedPatient.full_name} • {selectedPatient.patient_id} •{" "}
                  {selectedPatient.phone}
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
                          <Badge variant="secondary">{appliedPackage.name} (Package)</Badge>
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
              onClick={onSubmitConfirm}
              disabled={isSubmitting || !selectedPatient || selectedTests.length === 0}
            >
              {isSubmitting ? "Adding..." : "Create Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
