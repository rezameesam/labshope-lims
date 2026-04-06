import { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Search, ToggleLeft, ToggleRight, Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";

interface ExternalLab {
  id: string;
  name: string;
  code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

const ManageExternalLabs = () => {
  const { organization } = useOrganization();
  const [labs, setLabs] = useState<ExternalLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalLab | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formGst, setFormGst] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const fetchLabs = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("external_labs").select("*").eq("organization_id", organization.id).order("name");
    if (error) toast.error("Failed to load external labs");
    else setLabs(data || []);
    setLoading(false);
  }, [organization?.id]);

  useEffect(() => { fetchLabs(); }, [fetchLabs]);

  const openCreate = () => {
    setEditing(null);
    setFormName(""); setFormCode(""); setFormContact(""); setFormPhone("");
    setFormEmail(""); setFormAddress(""); setFormGst(""); setFormNotes("");
    setDialogOpen(true);
  };

  const openEdit = (lab: ExternalLab) => {
    setEditing(lab);
    setFormName(lab.name); setFormCode(lab.code || ""); setFormContact(lab.contact_person || "");
    setFormPhone(lab.phone || ""); setFormEmail(lab.email || ""); setFormAddress(lab.address || "");
    setFormGst(lab.gst_number || ""); setFormNotes(lab.notes || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!organization?.id || !formName.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const payload = {
      organization_id: organization.id,
      name: formName.trim(),
      code: formCode.trim() || null,
      contact_person: formContact.trim() || null,
      phone: formPhone.trim() || null,
      email: formEmail.trim() || null,
      address: formAddress.trim() || null,
      gst_number: formGst.trim() || null,
      notes: formNotes.trim() || null,
    };
    if (editing) {
      const { error } = await (supabase as any).from("external_labs").update(payload).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { toast.success("External lab updated"); setDialogOpen(false); fetchLabs(); }
    } else {
      const { error } = await (supabase as any).from("external_labs").insert(payload);
      if (error) toast.error(error.message);
      else { toast.success("External lab added"); setDialogOpen(false); fetchLabs(); }
    }
    setSaving(false);
  };

  const toggleActive = async (lab: ExternalLab) => {
    const { error } = await (supabase as any).from("external_labs").update({ is_active: !lab.is_active }).eq("id", lab.id);
    if (error) toast.error(error.message); else fetchLabs();
  };

  const filtered = labs.filter((l) => {
    const q = search.toLowerCase();
    return l.name.toLowerCase().includes(q) || (l.code || "").toLowerCase().includes(q) || (l.contact_person || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search external labs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Add External Lab</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              {labs.length === 0 ? "No external labs yet. Add one to start outsourcing tests." : "No labs match your search."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Contact</TableHead>
                    <TableHead className="hidden md:table-cell">Phone</TableHead>
                    <TableHead className="hidden lg:table-cell">GST</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((lab) => (
                    <TableRow key={lab.id} className={!lab.is_active ? "opacity-50" : ""}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{lab.name}</p>
                          {lab.code && <p className="text-xs text-muted-foreground font-mono">{lab.code}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">{lab.contact_person || "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{lab.phone || "—"}</TableCell>
                      <TableCell className="hidden lg:table-cell text-sm font-mono">{lab.gst_number || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={lab.is_active ? "default" : "secondary"} className="text-xs">
                          {lab.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(lab)} title="Edit"><Edit2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => toggleActive(lab)} title={lab.is_active ? "Deactivate" : "Activate"}>
                            {lab.is_active ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              {editing ? "Edit External Lab" : "Add External Lab"}
            </DialogTitle>
            <DialogDescription>
              External labs are labs you outsource tests to. This helps track costs and payables.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Lab Name *</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Metro Diagnostics" />
              </div>
              <div>
                <Label>Code</Label>
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="e.g. METRO" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Contact Person</Label>
                <Input value={formContact} onChange={(e) => setFormContact(e.target.value)} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email</Label>
                <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div>
                <Label>GST Number</Label>
                <Input value={formGst} onChange={(e) => setFormGst(e.target.value)} placeholder="e.g. 29ABCDE1234F1Z5" />
              </div>
            </div>
            <div>
              <Label>Address</Label>
              <Textarea value={formAddress} onChange={(e) => setFormAddress(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} placeholder="Payment terms, turnaround time, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Add Lab"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageExternalLabs;
