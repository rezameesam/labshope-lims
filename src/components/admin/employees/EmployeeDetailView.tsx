import { Edit2, Mail, Phone, Building, Shield, Camera, IdCard, CreditCard, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Input } from "@/components/ui/input";
import { formatAppDate } from "@/lib/date";

interface Employee {
  id: string;
  user_id: string;
  employee_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  department: string | null;
  is_active: boolean;
  created_at: string;
  role?: string;
}

interface EmployeeIdentityDraft {
  photo_name: string;
  photo_preview: string;
  photo_path: string | null;
  photo_content_type: string | null;
  photo_size_bytes: number | null;
  aadhaar_number: string;
  pan_number: string;
  address: string;
}

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
}

interface EmployeeDetailViewProps {
  isSheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  selectedEmployee: Employee | null;
  selectedEmployeeIdentityDraft: EmployeeIdentityDraft;
  canViewSelectedEmployeeIdentity: boolean;
  getRoleBadge: (role: string) => React.ReactNode;
  formatAadhaar: (value: string) => string;
  maskDocumentNumber: (value: string, visibleDigits?: number) => string;
  customRoles: CustomRole[];
  employeeCustomRoles: Set<string>;
  onOpenEditDialog: () => void;
  onToggleStatus: (employee: Employee) => void;
  onOpenRoleDialog: () => void;
  // Delete dialog
  isDeleteDialogOpen: boolean;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onDelete: () => void;
  isSubmitting: boolean;
  // Reset password dialog
  isResetDialogOpen: boolean;
  onResetDialogOpenChange: (open: boolean) => void;
  customResetPassword: string;
  onCustomResetPasswordChange: (value: string) => void;
  resetLoading: boolean;
  onAdminResetPassword: (mode: "email" | "temp" | "set") => void;
  // Role dialog
  isRoleDialogOpen: boolean;
  onRoleDialogOpenChange: (open: boolean) => void;
  onEmployeeCustomRolesChange: (roles: Set<string>) => void;
  isAssigningRoles: boolean;
  onSaveRoles: () => void;
}

export const EmployeeDetailView = ({
  isSheetOpen,
  onSheetOpenChange,
  selectedEmployee,
  selectedEmployeeIdentityDraft,
  canViewSelectedEmployeeIdentity,
  getRoleBadge,
  formatAadhaar,
  maskDocumentNumber,
  customRoles,
  employeeCustomRoles,
  onOpenEditDialog,
  onToggleStatus,
  onOpenRoleDialog,
  isDeleteDialogOpen,
  onDeleteDialogOpenChange,
  onDelete,
  isSubmitting,
  isResetDialogOpen,
  onResetDialogOpenChange,
  customResetPassword,
  onCustomResetPasswordChange,
  resetLoading,
  onAdminResetPassword,
  isRoleDialogOpen,
  onRoleDialogOpenChange,
  onEmployeeCustomRolesChange,
  isAssigningRoles,
  onSaveRoles,
}: EmployeeDetailViewProps) => {
  return (
    <>
      {/* Employee Details Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={onSheetOpenChange}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle>Employee Details</SheetTitle>
          </SheetHeader>

          {selectedEmployee && (
            <ScrollArea className="mt-6 flex-1 pr-4">
              <div className="space-y-6 pb-6">
                <Card className="border-0 shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
                        {selectedEmployeeIdentityDraft.photo_preview ? (
                          <img
                            src={selectedEmployeeIdentityDraft.photo_preview}
                            alt={selectedEmployee.full_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User className="h-8 w-8 text-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold">{selectedEmployee.full_name}</h3>
                        <p className="text-sm font-mono text-primary">{selectedEmployee.employee_id}</p>
                        <div className="flex gap-2 mt-2">
                          {getRoleBadge(selectedEmployee.role || 'employee')}
                          <Badge
                            className={selectedEmployee.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                            }
                          >
                            {selectedEmployee.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium">{selectedEmployee.email}</p>
                    </div>
                  </div>

                  {selectedEmployee.phone && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-medium">{selectedEmployee.phone}</p>
                      </div>
                    </div>
                  )}

                  {selectedEmployee.department && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Department</p>
                        <p className="font-medium">{selectedEmployee.department}</p>
                      </div>
                    </div>
                  )}

                  {selectedEmployee.designation && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Designation</p>
                        <p className="font-medium">{selectedEmployee.designation}</p>
                      </div>
                    </div>
                  )}

                  {canViewSelectedEmployeeIdentity && (
                    <div className="space-y-3 rounded-xl border border-dashed p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">Identity Details</p>
                          <p className="text-xs text-muted-foreground">
                            Stored privately in Supabase. Restricted to admins and the employee themselves.
                          </p>
                        </div>
                        <Badge variant="secondary">Private</Badge>
                      </div>

                      {selectedEmployeeIdentityDraft.photo_name && (
                        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                          <Camera className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Picture</p>
                            <p className="font-medium">{selectedEmployeeIdentityDraft.photo_name}</p>
                          </div>
                        </div>
                      )}

                      {selectedEmployeeIdentityDraft.address && (
                        <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-3">
                          <Building className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Address</p>
                            <p className="font-medium whitespace-pre-wrap">{selectedEmployeeIdentityDraft.address}</p>
                          </div>
                        </div>
                      )}

                      {selectedEmployeeIdentityDraft.aadhaar_number && (
                        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                          <IdCard className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Aadhaar</p>
                            <p className="font-medium">
                              {maskDocumentNumber(formatAadhaar(selectedEmployeeIdentityDraft.aadhaar_number))}
                            </p>
                          </div>
                        </div>
                      )}

                      {selectedEmployeeIdentityDraft.pan_number && (
                        <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">PAN</p>
                            <p className="font-medium">
                              {maskDocumentNumber(selectedEmployeeIdentityDraft.pan_number)}
                            </p>
                          </div>
                        </div>
                      )}

                      {!selectedEmployeeIdentityDraft.photo_name &&
                        !selectedEmployeeIdentityDraft.address &&
                        !selectedEmployeeIdentityDraft.aadhaar_number &&
                        !selectedEmployeeIdentityDraft.pan_number && (
                          <p className="text-sm text-muted-foreground">
                            No private identity details saved yet.
                          </p>
                        )}
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground pt-4 border-t">
                    Joined: {formatAppDate(selectedEmployee.created_at)}
                  </div>
                </div>

                {/* Custom Roles Section */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base font-semibold">Custom Roles</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Assign additional roles with specific permissions
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onOpenRoleDialog}
                    >
                      <Shield className="h-4 w-4 mr-2" />
                      Manage Roles
                    </Button>
                  </div>
                  {employeeCustomRoles.size > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {customRoles
                        .filter(role => employeeCustomRoles.has(role.id))
                        .map(role => (
                          <Badge key={role.id} variant="secondary" className="text-xs">
                            {role.name}
                          </Badge>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No custom roles assigned</p>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={onOpenEditDialog}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant={selectedEmployee.is_active ? "destructive" : "default"}
                    className="flex-1"
                    onClick={() => {
                      onToggleStatus(selectedEmployee);
                      onSheetOpenChange(false);
                    }}
                  >
                    {selectedEmployee.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={onDeleteDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {selectedEmployee?.full_name}'s account. They will no longer be able to access the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={onResetDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Employee Password</DialogTitle>
            <DialogDescription>
              Choose how to reset password for {selectedEmployee?.full_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              className="w-full"
              disabled={resetLoading || !selectedEmployee?.email}
              onClick={() => onAdminResetPassword("email")}
            >
              {resetLoading ? "Processing..." : "Send Reset Link by Email"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={resetLoading}
              onClick={() => onAdminResetPassword("temp")}
            >
              {resetLoading ? "Processing..." : "Set Temporary Password"}
            </Button>
            <div className="space-y-2 border rounded-md p-3">
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
                disabled={resetLoading || customResetPassword.length < 6}
                onClick={() => onAdminResetPassword("set")}
              >
                {resetLoading ? "Processing..." : "Apply Custom Password"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Temporary password is shown once. Share it securely with the employee.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign Custom Roles Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={onRoleDialogOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Assign Custom Roles</DialogTitle>
            <DialogDescription>
              Select custom roles for {selectedEmployee?.full_name}. Users can have multiple roles, and permissions are cumulative.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 border rounded-lg p-4 min-h-[300px] max-h-[400px]">
            <div className="space-y-3">
              {customRoles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No custom roles available. Create roles in the "Roles & Permissions" section first.
                </p>
              ) : (
                customRoles.map((role) => (
                  <div
                    key={role.id}
                    className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`role-${role.id}`}
                      checked={employeeCustomRoles.has(role.id)}
                      onCheckedChange={(checked) => {
                        const newRoles = new Set(employeeCustomRoles);
                        if (checked) {
                          newRoles.add(role.id);
                        } else {
                          newRoles.delete(role.id);
                        }
                        onEmployeeCustomRolesChange(newRoles);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor={`role-${role.id}`}
                        className="font-medium cursor-pointer"
                      >
                        {role.name}
                      </Label>
                      {role.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {role.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onRoleDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={onSaveRoles}
              className="bg-clinical-navy hover:bg-clinical-navy/90"
              disabled={isAssigningRoles}
            >
              {isAssigningRoles ? "Saving..." : "Save Roles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
