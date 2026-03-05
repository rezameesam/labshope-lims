import { AlertTriangle, User } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { formatPhoneForDisplay } from "@/lib/phone";

interface ExistingPatient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  date_of_birth: string | null;
  gender: string | null;
}

interface DuplicatePhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingPatients: ExistingPatient[];
  phoneNumber: string;
  onContinue: () => void;
  onCancel: () => void;
}

const DuplicatePhoneDialog = ({
  open,
  onOpenChange,
  existingPatients,
  phoneNumber,
  onContinue,
  onCancel,
}: DuplicatePhoneDialogProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <AlertDialogTitle>Phone Number Already Registered</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="pt-2">
            The phone number <strong>{formatPhoneForDisplay(phoneNumber)}</strong> is already registered with{" "}
            {existingPatients.length} patient{existingPatients.length > 1 ? "s" : ""}. This is common
            when registering family members (e.g., minors, elderly) who share the same contact number.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <p className="text-sm font-medium mb-3 text-muted-foreground">
            Existing patient{existingPatients.length > 1 ? "s" : ""} with this phone:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {existingPatients.map((patient) => (
              <Card key={patient.id} className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-amber-100">
                        <User className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium">{patient.full_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span className="font-mono">{patient.patient_id}</span>
                          {patient.date_of_birth && (
                            <>
                              <span>•</span>
                              <span>
                                {new Date().getFullYear() -
                                  new Date(patient.date_of_birth).getFullYear()}{" "}
                                years
                              </span>
                            </>
                          )}
                          {patient.gender && (
                            <>
                              <span>•</span>
                              <span>{patient.gender}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> You can proceed to create a new patient with this phone number.
            This is useful for:
          </p>
          <ul className="text-sm text-blue-700 mt-2 ml-4 list-disc space-y-1">
            <li>Registering minors who share a parent's phone</li>
            <li>Registering elderly patients who use a family member's phone</li>
            <li>Family members who share a single contact number</li>
          </ul>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue} className="bg-amber-500 hover:bg-amber-600">
            Continue Creating New Patient
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DuplicatePhoneDialog;
