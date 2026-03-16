import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";

interface Props {
  organizationId: string;
  patientId: string;
  patientTestId?: string;
  invoiceId?: string;
  careContextReference: string;
  careContextDisplay: string;
  abhaAddress: string | null;
  initialLinked?: boolean;
  onLinked?: () => void;
}

export function AbdmCareContextButton({
  organizationId,
  patientId,
  patientTestId,
  invoiceId,
  careContextReference,
  careContextDisplay,
  abhaAddress,
  initialLinked = false,
  onLinked,
}: Props) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [linked, setLinked]   = useState(initialLinked);

  useEffect(() => { setLinked(initialLinked); }, [initialLinked]);

  async function handleLink() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/abdm-link-care-context`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            organization_id: organizationId,
            patient_id: patientId,
            patient_test_id: patientTestId,
            invoice_id: invoiceId,
            care_context_reference: careContextReference,
            care_context_display: careContextDisplay,
            hi_type: "DiagnosticReport",
          }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Linking failed");

      setLinked(true);
      setOpen(false);
      toast.success("Report linked to patient's ABHA successfully");
      onLinked?.();
    } catch (e: any) {
      toast.error(e.message || "Failed to link care context");
    } finally {
      setLoading(false);
    }
  }

  if (!abhaAddress) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button variant="outline" size="sm" disabled className="gap-1.5 opacity-50">
              <Link2 className="h-3.5 w-3.5" />
              Link to ABHA
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Patient needs an ABHA address to link care context</TooltipContent>
      </Tooltip>
    );
  }

  if (linked) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5 text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Linked to ABHA
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Link2 className="h-3.5 w-3.5" />
        Link to ABHA
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Link Report to ABHA</DialogTitle>
            <DialogDescription>
              This will link the report to the patient's ABHA account so it appears in their health locker.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
            <p><span className="font-medium">Report:</span> {careContextDisplay}</p>
            <p><span className="font-medium">Reference:</span> {careContextReference}</p>
            <p><span className="font-medium">ABHA:</span> {abhaAddress}</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleLink()} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Link Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
