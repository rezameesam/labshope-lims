import { CalendarClock, Droplet, Mail, MapPin, Phone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatAppDate } from "@/lib/date";
import { formatPhoneForDisplay } from "@/lib/phone";

const MAX_PATIENT_ADDRESS_LENGTH = 250;

const formatDate = (value?: string | null) => {
  if (!value) return "Not provided";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not provided";
  return formatAppDate(parsed);
};

interface Patient {
  full_name: string;
  phone: string;
  email?: string | null;
  blood_group?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  address?: string | null;
}

interface PatientProfileTabProps {
  patient: Patient;
  addressInput: string;
  setAddressInput: (v: string) => void;
  addressDialogOpen: boolean;
  setAddressDialogOpen: (v: boolean) => void;
  onAddressUpdate: (e: React.FormEvent) => void;
  updatingAddress: boolean;
}

export const PatientProfileTab = ({
  patient,
  addressInput,
  setAddressInput,
  addressDialogOpen,
  setAddressDialogOpen,
  onAddressUpdate,
  updatingAddress,
}: PatientProfileTabProps) => {
  const fields = [
    { icon: User, label: "Full Name", value: patient.full_name, tone: "text-foreground" },
    { icon: Phone, label: "Phone Number", value: formatPhoneForDisplay(patient.phone), tone: "text-foreground" },
    { icon: Mail, label: "Email", value: patient.email || "Not provided", tone: "text-foreground" },
    { icon: Droplet, label: "Blood Group", value: patient.blood_group || "Not specified", tone: "text-primary" },
    { icon: User, label: "Gender", value: patient.gender || "Not specified", tone: "text-foreground" },
    { icon: CalendarClock, label: "Date of Birth", value: formatDate(patient.date_of_birth), tone: "text-foreground" },
  ];

  return (
    <>
      <Card className="rounded-3xl border border-border bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Personal information
          </CardTitle>
          <CardDescription>Your details currently stored in the patient record.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          {fields.map((item) => (
            <div key={item.label} className="rounded-2xl border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-muted p-2 shadow-sm">
                  <item.icon className={`h-5 w-5 ${item.tone}`} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="mt-1 font-medium text-foreground">{item.value}</p>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-border bg-muted/40 p-4 md:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-muted p-2 shadow-sm">
                  <MapPin className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Address</p>
                  <p className="mt-1 font-medium text-foreground">{patient.address || "Not provided"}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setAddressDialogOpen(true)}>
                Edit Address
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Update Address
            </DialogTitle>
            <DialogDescription>
              Keep your address up to date for home collection requests and patient record accuracy.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onAddressUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="patient-address">Address</Label>
              <textarea
                id="patient-address"
                name="patient_address"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value.slice(0, MAX_PATIENT_ADDRESS_LENGTH))}
                rows={4}
                className="flex min-h-[112px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                autoComplete="street-address"
                required
              />
              <p className="text-xs text-muted-foreground">
                {addressInput.length}/{MAX_PATIENT_ADDRESS_LENGTH} characters
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddressDialogOpen(false)}
                disabled={updatingAddress}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatingAddress}>
                {updatingAddress ? "Saving..." : "Save Address"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
