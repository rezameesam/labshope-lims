import { Eye, EyeOff, Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";

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

interface EmployeeFormState extends EmployeeIdentityDraft {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  designation: string;
  department: string;
  role: "admin" | "employee" | "collector";
  photo_file: File | null;
}

interface EmployeeEditFormState extends EmployeeIdentityDraft {
  full_name: string;
  phone: string;
  designation: string;
  department: string;
  photo_file: File | null;
}

interface EmployeeFormDialogProps {
  // Add dialog (controlled by trigger)
  isDialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  formData: EmployeeFormState;
  onFormDataChange: (data: EmployeeFormState) => void;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  showPassword: boolean;
  onTogglePassword: () => void;
  employeeEmailPlaceholder: string;
  onPhotoSelection: (file: File, setState: React.Dispatch<React.SetStateAction<EmployeeFormState>>) => Promise<void>;
  onClearPhoto: (setState: React.Dispatch<React.SetStateAction<EmployeeFormState>>) => void;
  setFormData: React.Dispatch<React.SetStateAction<EmployeeFormState>>;
  formatAadhaar: (value: string) => string;
  normalizeAadhaar: (value: string) => string;
  normalizePan: (value: string) => string;
}

export const EmployeeFormDialog = ({
  isDialogOpen,
  onDialogOpenChange,
  formData,
  onFormDataChange,
  isSubmitting,
  onSubmit,
  showPassword,
  onTogglePassword,
  employeeEmailPlaceholder,
  onPhotoSelection,
  onClearPhoto,
  setFormData,
  formatAadhaar,
  normalizeAadhaar,
  normalizePan,
}: EmployeeFormDialogProps) => {
  return (
    <Dialog open={isDialogOpen} onOpenChange={onDialogOpenChange}>
      <DialogTrigger asChild>
        <Button className="bg-clinical-navy hover:bg-clinical-navy/90">
          Add Employee
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Employee</DialogTitle>
          <DialogDescription>
            Create a new employee account with login credentials
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label htmlFor="full_name">Full Name *</Label>
              <Input
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={(e) => onFormDataChange({ ...formData, full_name: e.target.value })}
                required
                placeholder="Enter full name"
                autoComplete="name"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={(e) => onFormDataChange({ ...formData, email: e.target.value })}
                required
                placeholder={employeeEmailPlaceholder}
                autoComplete="email"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label htmlFor="password">Password *</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => onFormDataChange({ ...formData, password: e.target.value })}
                  required
                  minLength={6}
                  placeholder="Minimum 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={onTogglePassword}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => onFormDataChange({ ...formData, phone: e.target.value })}
                placeholder="Phone number"
                autoComplete="tel"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Select
                name="role"
                value={formData.role}
                onValueChange={(value: "admin" | "employee" | "collector") =>
                  onFormDataChange({ ...formData, role: value })
                }
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="collector">Sample Collector</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="designation">Designation</Label>
              <Input
                id="designation"
                name="designation"
                value={formData.designation}
                onChange={(e) => onFormDataChange({ ...formData, designation: e.target.value })}
                placeholder="e.g. Lab Technician"
                autoComplete="organization-title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department</Label>
              <Input
                id="department"
                name="department"
                value={formData.department}
                onChange={(e) => onFormDataChange({ ...formData, department: e.target.value })}
                placeholder="e.g. Pathology"
                autoComplete="organization"
              />
            </div>
          </div>

          <div className="rounded-xl border border-dashed bg-muted/30 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-medium">Identity Details</h4>
                <p className="text-sm text-muted-foreground">
                  Optional private employee photo, address, Aadhaar, and PAN details.
                </p>
              </div>
              <Badge variant="secondary">Private</Badge>
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-3">
                <Label htmlFor="employee_photo">Employee Picture</Label>
                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <div className="h-24 w-24 overflow-hidden rounded-full border bg-muted flex items-center justify-center">
                      {formData.photo_preview ? (
                        <img
                          src={formData.photo_preview}
                          alt="Employee preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Camera className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <div className="space-y-2 w-full">
                      <Input
                        id="employee_photo"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            await onPhotoSelection(file, setFormData);
                          } catch (error: any) {
                            toast.error(error.message || "Failed to load employee picture");
                          } finally {
                            e.target.value = "";
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => document.getElementById("employee_photo")?.click()}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {formData.photo_preview ? "Change Picture" : "Upload Picture"}
                      </Button>
                      {formData.photo_preview && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => onClearPhoto(setFormData)}
                        >
                          Remove Picture
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground break-all">
                      {formData.photo_name || "No image selected"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG, or WebP. Must be less than 1 MB.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="aadhaar_number">Aadhaar Number</Label>
                  <Input
                    id="aadhaar_number"
                    inputMode="numeric"
                    value={formatAadhaar(formData.aadhaar_number)}
                    onChange={(e) => onFormDataChange({
                      ...formData,
                      aadhaar_number: normalizeAadhaar(e.target.value),
                    })}
                    placeholder="1234 5678 9012"
                  />
                  <p className="text-xs text-muted-foreground">12 digits, optional.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pan_number">PAN Number</Label>
                  <Input
                    id="pan_number"
                    value={formData.pan_number}
                    onChange={(e) => onFormDataChange({
                      ...formData,
                      pan_number: normalizePan(e.target.value),
                    })}
                    placeholder="ABCDE1234F"
                  />
                  <p className="text-xs text-muted-foreground">10 characters, optional.</p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="employee_address">Address</Label>
                  <Textarea
                    id="employee_address"
                    value={formData.address}
                    onChange={(e) => onFormDataChange({
                      ...formData,
                      address: e.target.value,
                    })}
                    placeholder="Enter employee address"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">Optional. Stored privately in Supabase.</p>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Stored in Supabase with restricted access. Only admins and the employee themselves should be able to view them.
            </p>
          </div>

          <Button
            type="submit"
            className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Employee"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// Edit Dialog
interface EmployeeEditDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editFormData: EmployeeEditFormState;
  onEditFormDataChange: (data: EmployeeEditFormState) => void;
  isSubmitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  canManageEmployeeRecords: boolean;
  canEditSelectedEmployeePhone: boolean;
  canViewSelectedEmployeeIdentity: boolean;
  onPhotoSelection: (file: File, setState: React.Dispatch<React.SetStateAction<EmployeeEditFormState>>) => Promise<void>;
  onClearPhoto: (setState: React.Dispatch<React.SetStateAction<EmployeeEditFormState>>) => void;
  setEditFormData: React.Dispatch<React.SetStateAction<EmployeeEditFormState>>;
  formatAadhaar: (value: string) => string;
  normalizeAadhaar: (value: string) => string;
  normalizePan: (value: string) => string;
}

export const EmployeeEditDialog = ({
  isOpen,
  onOpenChange,
  editFormData,
  onEditFormDataChange,
  isSubmitting,
  onSubmit,
  canManageEmployeeRecords,
  canEditSelectedEmployeePhone,
  canViewSelectedEmployeeIdentity,
  onPhotoSelection,
  onClearPhoto,
  setEditFormData,
  formatAadhaar,
  normalizeAadhaar,
  normalizePan,
}: EmployeeEditDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit_full_name">Full Name *</Label>
            <Input
              id="edit_full_name"
              value={editFormData.full_name}
              onChange={(e) => onEditFormDataChange({ ...editFormData, full_name: e.target.value })}
              required
              disabled={!canManageEmployeeRecords}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit_phone">Phone</Label>
            <Input
              id="edit_phone"
              type="tel"
              value={editFormData.phone}
              onChange={(e) => onEditFormDataChange({ ...editFormData, phone: e.target.value })}
              disabled={!canEditSelectedEmployeePhone}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit_designation">Designation</Label>
              <Input
                id="edit_designation"
                value={editFormData.designation}
                onChange={(e) => onEditFormDataChange({ ...editFormData, designation: e.target.value })}
                disabled={!canManageEmployeeRecords}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_department">Department</Label>
              <Input
                id="edit_department"
                value={editFormData.department}
                onChange={(e) => onEditFormDataChange({ ...editFormData, department: e.target.value })}
                disabled={!canManageEmployeeRecords}
              />
            </div>
          </div>

          {canManageEmployeeRecords && canViewSelectedEmployeeIdentity && (
            <div className="rounded-xl border border-dashed bg-muted/30 p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-medium">Identity Details</h4>
                  <p className="text-sm text-muted-foreground">
                    Optional private photo, address, Aadhaar, and PAN details.
                  </p>
                </div>
                <Badge variant="secondary">Private</Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <div className="space-y-3">
                  <Label htmlFor="edit_employee_photo">Employee Picture</Label>
                  <div className="rounded-xl border bg-background p-4">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="h-24 w-24 overflow-hidden rounded-full border bg-muted flex items-center justify-center">
                        {editFormData.photo_preview ? (
                          <img
                            src={editFormData.photo_preview}
                            alt="Employee preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Camera className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <div className="space-y-2 w-full">
                        <Input
                          id="edit_employee_photo"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              await onPhotoSelection(file, setEditFormData);
                            } catch (error: any) {
                              toast.error(error.message || "Failed to load employee picture");
                            } finally {
                              e.target.value = "";
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => document.getElementById("edit_employee_photo")?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {editFormData.photo_preview ? "Change Picture" : "Upload Picture"}
                        </Button>
                        {editFormData.photo_preview && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => onClearPhoto(setEditFormData)}
                          >
                            Remove Picture
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground break-all">
                        {editFormData.photo_name || "No image selected"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        JPG, PNG, or WebP. Must be less than 1 MB.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit_aadhaar_number">Aadhaar Number</Label>
                    <Input
                      id="edit_aadhaar_number"
                      inputMode="numeric"
                      value={formatAadhaar(editFormData.aadhaar_number)}
                      onChange={(e) => onEditFormDataChange({
                        ...editFormData,
                        aadhaar_number: normalizeAadhaar(e.target.value),
                      })}
                      placeholder="1234 5678 9012"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit_pan_number">PAN Number</Label>
                    <Input
                      id="edit_pan_number"
                      value={editFormData.pan_number}
                      onChange={(e) => onEditFormDataChange({
                        ...editFormData,
                        pan_number: normalizePan(e.target.value),
                      })}
                      placeholder="ABCDE1234F"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="edit_employee_address">Address</Label>
                    <Textarea
                      id="edit_employee_address"
                      value={editFormData.address}
                      onChange={(e) => onEditFormDataChange({
                        ...editFormData,
                        address: e.target.value,
                      })}
                      placeholder="Enter employee address"
                      rows={4}
                    />
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Stored in Supabase with restricted access. Only admins and the employee themselves should be able to view them.
              </p>
            </div>
          )}
          <Button
            type="submit"
            className="w-full bg-clinical-navy hover:bg-clinical-navy/90"
            disabled={isSubmitting || !canEditSelectedEmployeePhone}
          >
            {isSubmitting ? "Saving..." : canManageEmployeeRecords ? "Save Changes" : "Save Phone Number"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
