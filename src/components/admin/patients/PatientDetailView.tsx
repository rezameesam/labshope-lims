import React from "react";
import {
  Phone,
  Mail,
  MapPin,
  Calendar,
  Droplets,
  User,
  FileText,
  Edit2,
  Receipt,
  IndianRupee,
  Clock,
  CheckCircle,
  CheckCircle2,
  Building2,
  Lock,
  ClipboardList,
  Shield,
  Printer,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatAppDate } from "@/lib/date";
import { formatPhoneForDisplay } from "@/lib/phone";

export interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  abha_number?: string | null;
  abha_address?: string | null;
  abdm_link_status?: string | null;
  abdm_linked_at?: string | null;
  abdm_last_verified_at?: string | null;
  abdm_source?: string | null;
  is_active: boolean;
  lab_id?: string | null;
  collection_center_id?: string | null;
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
  created_at: string;
}

export interface PatientTest {
  id: string;
  test_id?: string | null;
  test_name: string;
  test_date: string;
  status: string;
  result: string | null;
  result_value: number | null;
  result_unit: string | null;
  is_abnormal: boolean;
  notes?: string | null;
  result_entered_by?: string | null;
  entered_by_name?: string;
  lab_id?: string | null;
  collection_center_id?: string | null;
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

export interface BillingSummary {
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  invoiceCount: number;
}

export interface PatientDetailViewProps {
  isSheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  selectedPatient: Patient | null;
  patientTests: PatientTest[];
  billingSummary: BillingSummary | null;
  selectedTestIds: Set<string>;
  completedPatientTests: PatientTest[];
  onToggleTestSelection: (testId: string) => void;
  onSelectAllTests: () => void;
  onClearTestSelection: () => void;
  onOpenPrintDialog: () => void;
  onEditPatient: (patient: Patient) => void;
  onTogglePatientStatus: (patient: Patient) => void;
  onOpenResetDialog: () => void;
  getStatusBadge: (status: string) => React.ReactNode;
  // Reset password dialog
  resetDialogOpen: boolean;
  onResetDialogOpenChange: (open: boolean) => void;
  resetLoading: boolean;
  customResetPassword: string;
  onCustomResetPasswordChange: (value: string) => void;
  onAdminResetPassword: (mode: "email" | "temp" | "set") => void;
  // Print dialog
  printDialogOpen: boolean;
  onPrintDialogOpenChange: (open: boolean) => void;
  printOptions: { includeHeader: boolean; includeFooter: boolean; includeWatermark: boolean };
  onPrintOptionsChange: (options: { includeHeader: boolean; includeFooter: boolean; includeWatermark: boolean }) => void;
  onPrintTests: () => void;
}

const PatientDetailView = ({
  isSheetOpen,
  onSheetOpenChange,
  selectedPatient,
  patientTests,
  billingSummary,
  selectedTestIds,
  completedPatientTests,
  onToggleTestSelection,
  onSelectAllTests,
  onClearTestSelection,
  onOpenPrintDialog,
  onEditPatient,
  onTogglePatientStatus,
  onOpenResetDialog,
  getStatusBadge,
  resetDialogOpen,
  onResetDialogOpenChange,
  resetLoading,
  customResetPassword,
  onCustomResetPasswordChange,
  onAdminResetPassword,
  printDialogOpen,
  onPrintDialogOpenChange,
  printOptions,
  onPrintOptionsChange,
  onPrintTests,
}: PatientDetailViewProps) => {
  const pendingTestsCount = patientTests.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const completedTestsCount = patientTests.filter((t) => t.status === "completed").length;
  const abnormalTestsCount = patientTests.filter((t) => t.is_abnormal).length;
  const lastTest = patientTests[0] || null;

  const timelineItems = patientTests
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: t.test_name,
      date: t.test_date,
      status: t.status,
      type: "test" as const,
    }));

  if (billingSummary?.invoiceCount) {
    timelineItems.push({
      id: "billing-summary",
      title: `${billingSummary.invoiceCount} invoice(s) generated`,
      date: selectedPatient?.created_at || new Date().toISOString(),
      status: billingSummary.outstanding > 0 ? "pending" : "completed",
      type: "billing",
    });
  }

  const quickActions = [
    pendingTestsCount > 0 ? { label: `Follow up ${pendingTestsCount} pending test(s)`, severity: "warning" as const } : null,
    billingSummary && billingSummary.outstanding > 0 ? { label: `Collect outstanding ₹${billingSummary.outstanding.toLocaleString()}`, severity: "warning" as const } : null,
    abnormalTestsCount > 0 ? { label: `Review ${abnormalTestsCount} abnormal report(s)`, severity: "critical" as const } : null,
    selectedPatient && !selectedPatient.email ? { label: "Add email for report delivery", severity: "info" as const } : null,
  ].filter(Boolean) as Array<{ label: string; severity: "warning" | "critical" | "info" }>;

  return (
    <>
      {/* Patient Details Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Patient Details</SheetTitle>
          </SheetHeader>

          {selectedPatient && (
            <div className="mt-6 space-y-6">
              {/* Patient Info Card */}
              <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold">{selectedPatient.full_name}</h3>
                      <p className="text-sm font-mono text-primary">{selectedPatient.patient_id}</p>
                      <Badge
                        className={`mt-2 ${selectedPatient.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                        }`}
                      >
                        {selectedPatient.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Snapshot */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Pending Tests</p>
                  <p className="text-lg font-semibold">{pendingTestsCount}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="text-lg font-semibold">{completedTestsCount}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Abnormal</p>
                  <p className="text-lg font-semibold">{abnormalTestsCount}</p>
                </div>
                <div className="rounded-lg border p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">Last Activity</p>
                  <p className="text-sm font-semibold truncate">{lastTest ? formatAppDate(lastTest.test_date) : "No tests yet"}</p>
                </div>
              </div>

              {/* Next Best Actions */}
              {quickActions.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/40">
                  <CardContent className="pt-4 space-y-2">
                    <p className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" /> Next Best Actions
                    </p>
                    {quickActions.map((action, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        {action.severity === "critical" ? (
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                        ) : action.severity === "warning" ? (
                          <Clock className="h-4 w-4 text-amber-600" />
                        ) : (
                          <MessageSquare className="h-4 w-4 text-blue-600" />
                        )}
                        <span>{action.label}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Contact & Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </p>
                  <p className="font-medium">{formatPhoneForDisplay(selectedPatient.phone)}</p>
                </div>
                {selectedPatient.email && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </p>
                    <p className="font-medium text-sm">{selectedPatient.email}</p>
                  </div>
                )}
                {selectedPatient.date_of_birth && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Date of Birth
                    </p>
                    <p className="font-medium">{formatAppDate(selectedPatient.date_of_birth)}</p>
                  </div>
                )}
                {selectedPatient.gender && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Gender</p>
                    <p className="font-medium">{selectedPatient.gender}</p>
                  </div>
                )}
                {selectedPatient.blood_group && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Droplets className="h-3 w-3" /> Blood Group
                    </p>
                    <Badge variant="outline" className="font-mono text-lg">
                      {selectedPatient.blood_group}
                    </Badge>
                  </div>
                )}
                {(selectedPatient.abha_number || selectedPatient.abha_address) && (
                  <div className="space-y-1 col-span-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <ClipboardList className="h-3 w-3" /> ABDM Identity
                      </p>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        onClick={() => onEditPatient(selectedPatient)}
                      >
                        <Shield className="h-3 w-3" /> Re-verify
                      </button>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                      {selectedPatient.abha_number && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">ABHA Number:</span>{" "}
                          <span className="font-medium">{selectedPatient.abha_number}</span>
                        </p>
                      )}
                      {selectedPatient.abha_address && (
                        <p className="text-sm break-all">
                          <span className="text-muted-foreground">ABHA Address:</span>{" "}
                          <span className="font-medium">{selectedPatient.abha_address}</span>
                        </p>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Status:</span>{" "}
                          <span className="font-medium capitalize">
                            {(selectedPatient.abdm_link_status || "unlinked").replace(/_/g, " ")}
                          </span>
                        </p>
                        {selectedPatient.abdm_source && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Method:</span>{" "}
                            <span className="font-medium capitalize">
                              {selectedPatient.abdm_source.replace(/_/g, " ")}
                            </span>
                          </p>
                        )}
                      </div>
                      {selectedPatient.abdm_last_verified_at && (
                        <p className="text-sm">
                          <span className="text-muted-foreground">Last verified:</span>{" "}
                          <span className="font-medium">{formatAppDate(selectedPatient.abdm_last_verified_at)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {selectedPatient.address && (
                  <div className="space-y-1 col-span-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Address
                    </p>
                    <p className="font-medium">{selectedPatient.address}</p>
                  </div>
                )}
                {selectedPatient.labs && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Lab
                    </p>
                    <div>
                      <p className="font-medium">{selectedPatient.labs.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{selectedPatient.labs.lab_code}</p>
                    </div>
                  </div>
                )}
                {selectedPatient.collection_centers && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Collection Center
                    </p>
                    <div>
                      <p className="font-medium">{selectedPatient.collection_centers.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{selectedPatient.collection_centers.code}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Test History */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Test History ({patientTests.length})
                  </h4>
                  {completedPatientTests.length > 0 && (
                    <div className="flex items-center gap-2">
                      {selectedTestIds.size > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedTestIds.size} selected
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={selectedTestIds.size === completedPatientTests.length ? onClearTestSelection : onSelectAllTests}
                      >
                        {selectedTestIds.size === completedPatientTests.length ? "Deselect" : "Select All"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={onOpenPrintDialog}
                        className="gap-1"
                      >
                        <Printer className="h-4 w-4" />
                        Print {selectedTestIds.size > 0 ? `(${selectedTestIds.size})` : "All"}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {patientTests.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No tests recorded</p>
                  ) : (
                    patientTests.map((test) => (
                      <div
                        key={test.id}
                        className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        {test.status === "completed" && (
                          <Checkbox
                            checked={selectedTestIds.has(test.id)}
                            onCheckedChange={() => onToggleTestSelection(test.id)}
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{test.test_name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatAppDate(test.test_date)}</span>
                            {(test.result_value !== null && test.result_value !== undefined) || test.result ? (
                              <span className={`font-medium ${test.is_abnormal ? "text-red-600" : "text-green-600"}`}>
                                • {test.result_value !== null && test.result_value !== undefined
                                  ? `${test.result_value}${test.result_unit ? ` ${test.result_unit}` : ""}`
                                  : test.result}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {getStatusBadge(test.status)}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4" />
                  Patient Timeline
                </h4>
                <div className="space-y-2">
                  {timelineItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No recent activity</p>
                  ) : (
                    timelineItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border p-2">
                        <div>
                          <p className="text-sm font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{formatAppDate(item.date)}</p>
                        </div>
                        {getStatusBadge(item.status)}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Billing Summary */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-3">
                  <Receipt className="h-4 w-4" />
                  Billing Summary
                </h4>
                {billingSummary ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                      <div className="flex items-center gap-2">
                        <IndianRupee className="h-4 w-4 text-blue-600" />
                        <span className="text-xs text-muted-foreground">Total Billed</span>
                      </div>
                      <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                        ₹{billingSummary.totalBilled.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs text-muted-foreground">Total Paid</span>
                      </div>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                        ₹{billingSummary.totalPaid.toLocaleString()}
                      </p>
                    </div>
                    {billingSummary.outstanding > 0 && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 col-span-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-amber-600" />
                            <span className="text-sm text-amber-700 dark:text-amber-300">Outstanding Balance</span>
                          </div>
                          <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                            ₹{billingSummary.outstanding.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    )}
                    <p className="col-span-2 text-xs text-muted-foreground">
                      {billingSummary.invoiceCount} invoice(s) on record
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No billing records</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={onOpenResetDialog}
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Reset Password
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    onSheetOpenChange(false);
                    onEditPatient(selectedPatient);
                  }}
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant={selectedPatient.is_active ? "destructive" : "default"}
                  className="flex-1"
                  onClick={() => {
                    onTogglePatientStatus(selectedPatient);
                    onSheetOpenChange(false);
                  }}
                >
                  {selectedPatient.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={onResetDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Reset Patient Password
            </DialogTitle>
            <DialogDescription>
              Send a reset link, set a temporary password, or apply a custom password for the patient.
            </DialogDescription>
          </DialogHeader>
          {selectedPatient && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Choose how to reset the password for {selectedPatient.full_name}.
              </p>
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={() => onAdminResetPassword("email")}
                  disabled={resetLoading || !selectedPatient.email}
                >
                  Send Reset Link to Email
                </Button>
                {!selectedPatient.email && (
                  <p className="text-xs text-amber-600">
                    No email on file. Add an email to enable reset links.
                  </p>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onAdminResetPassword("temp")}
                  disabled={resetLoading}
                >
                  Set Temporary Password
                </Button>
                <div className="space-y-2 rounded-md border p-3">
                  <Label htmlFor="custom-reset-password">Set Custom Password</Label>
                  <Input
                    id="custom-reset-password"
                    type="text"
                    value={customResetPassword}
                    onChange={(e) => onCustomResetPasswordChange(e.target.value)}
                    placeholder="Enter new password (min 6 chars)"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => onAdminResetPassword("set")}
                    disabled={resetLoading || customResetPassword.length < 6}
                  >
                    Apply Custom Password
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Temporary password is shown once. Share it securely with the patient.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onResetDialogOpenChange(false)}
              disabled={resetLoading}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Options Dialog */}
      <Dialog open={printDialogOpen} onOpenChange={onPrintDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Print Options
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Configure options for pre-printed A4 paper. Disable header/footer to leave space for pre-printed letterhead.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="admin-include-header" className="flex flex-col gap-1">
                  <span>Include Header</span>
                  <span className="font-normal text-xs text-muted-foreground">
                    Print lab name and contact info
                  </span>
                </Label>
                <Switch
                  id="admin-include-header"
                  checked={printOptions.includeHeader}
                  onCheckedChange={(checked) =>
                    onPrintOptionsChange({ ...printOptions, includeHeader: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="admin-include-footer" className="flex flex-col gap-1">
                  <span>Include Footer</span>
                  <span className="font-normal text-xs text-muted-foreground">
                    Print generation info and disclaimer
                  </span>
                </Label>
                <Switch
                  id="admin-include-footer"
                  checked={printOptions.includeFooter}
                  onCheckedChange={(checked) =>
                    onPrintOptionsChange({ ...printOptions, includeFooter: checked })
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="admin-include-watermark" className="flex flex-col gap-1">
                  <span>Include Watermark</span>
                  <span className="font-normal text-xs text-muted-foreground">
                    Very light organization logo across the report background
                  </span>
                </Label>
                <Switch
                  id="admin-include-watermark"
                  checked={printOptions.includeWatermark}
                  onCheckedChange={(checked) =>
                    onPrintOptionsChange({ ...printOptions, includeWatermark: checked })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onPrintDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onPrintTests} className="gap-2">
              <Printer className="h-4 w-4" />
              Print {selectedTestIds.size > 0 ? `(${selectedTestIds.size})` : "All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PatientDetailView;
