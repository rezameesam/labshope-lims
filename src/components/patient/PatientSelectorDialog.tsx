import { User, Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface Patient {
  id: string;
  patient_id: string;
  full_name: string;
  phone: string;
  date_of_birth: string | null;
  gender: string | null;
}

interface PatientSelectorDialogProps {
  open: boolean;
  patients: Patient[];
  phoneNumber: string;
  onSelect: (patientId: string) => void;
}

const PatientSelectorDialog = ({
  open,
  patients,
  phoneNumber,
  onSelect,
}: PatientSelectorDialogProps) => {
  const calculateAge = (dateOfBirth: string | null) => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Multiple Accounts Found
          </DialogTitle>
          <DialogDescription className="pt-2">
            The phone number <strong>+91-{phoneNumber}</strong> is registered with multiple patient
            accounts. Please select which patient you are:
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-3">
            {patients.map((patient) => {
              const age = calculateAge(patient.date_of_birth);
              return (
                <Card
                  key={patient.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors border-2 hover:border-primary"
                  onClick={() => onSelect(patient.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-primary/10">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-lg">{patient.full_name}</p>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span className="font-mono">{patient.patient_id}</span>
                            {age !== null && (
                              <>
                                <span>•</span>
                                <span>{age} years old</span>
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
                      <Button variant="outline" size="sm">
                        Select
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            <strong>Why multiple accounts?</strong> This happens when family members (e.g., minors,
            elderly) share the same contact number. Each person has their own patient record for
            accurate medical history tracking.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PatientSelectorDialog;

