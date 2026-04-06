import { useState, useEffect } from "react";
import { Building, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/hooks/useAuth";
import type { PatientTest } from "./types";

interface ExternalLab {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
}

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  test: PatientTest | null;
  onOutsourced: () => void;
}

const OutsourceDialog = ({ isOpen, onOpenChange, test, onOutsourced }: Props) => {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const [externalLabs, setExternalLabs] = useState<ExternalLab[]>([]);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [cost, setCost] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!organization?.id || !isOpen) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("external_labs")
        .select("id, name, code, is_active")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("name");
      setExternalLabs(data || []);
    })();
  }, [organization?.id, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setSelectedLabId("");
      setCost("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!test || !selectedLabId) { toast.error("Select an external lab"); return; }
    const costNum = parseFloat(cost);
    if (!costNum || costNum <= 0) { toast.error("Enter a valid cost"); return; }

    setSaving(true);

    // First seed outsource accounts if they don't exist
    await (supabase as any).rpc("seed_outsource_accounts", { org_id: organization?.id });

    const { error } = await (supabase as any)
      .from("patient_tests")
      .update({
        external_lab_id: selectedLabId,
        outsource_cost: costNum,
        outsourced_at: new Date().toISOString(),
        outsourced_by: user?.id,
      })
      .eq("id", test.id);

    if (error) {
      toast.error(error.message);
    } else {
      const labName = externalLabs.find((l) => l.id === selectedLabId)?.name || "External Lab";
      toast.success(`"${test.test_name}" outsourced to ${labName}`);
      onOutsourced();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Outsource Test
          </DialogTitle>
          <DialogDescription>
            Send this test to an external lab for processing. A journal entry will be created automatically.
          </DialogDescription>
        </DialogHeader>

        {test && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="font-medium">{test.test_name}</p>
              <p className="text-sm text-muted-foreground">
                Patient: {test.patients?.full_name} ({test.patients?.patient_id})
              </p>
            </div>

            <div>
              <Label>External Lab *</Label>
              <Select value={selectedLabId} onValueChange={setSelectedLabId}>
                <SelectTrigger><SelectValue placeholder="Select external lab" /></SelectTrigger>
                <SelectContent>
                  {externalLabs.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No external labs found. Add one in Manage → External Labs.
                    </div>
                  ) : externalLabs.map((lab) => (
                    <SelectItem key={lab.id} value={lab.id}>
                      <span className="flex items-center gap-2">
                        <Building className="h-3.5 w-3.5 text-muted-foreground" />
                        {lab.name}
                        {lab.code && <span className="text-xs text-muted-foreground font-mono">({lab.code})</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Cost Price (what you pay the external lab) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
                className="text-right font-mono"
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              This will create a journal entry: Debit Outsourcing Expense, Credit Outsource Payable.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            <Send className="h-4 w-4 mr-1" />
            {saving ? "Outsourcing..." : "Outsource Test"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OutsourceDialog;
