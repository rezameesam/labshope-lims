import { useState, useEffect, useCallback } from "react";
import {
  Plus, Edit2, ToggleLeft, ToggleRight, Search, BookOpenCheck, ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ACCOUNT_TYPES, ACCOUNT_THEME, getTheme, fmt, type AccountType } from "./constants";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
}

interface Props {
  onOpenLedger?: (account: { id: string; code: string; name: string; type: string }) => void;
}

const ChartOfAccounts = ({ onOpenLedger }: Props) => {
  const { organization } = useOrganization();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [saving, setSaving] = useState(false);

  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<string>("asset");
  const [formDescription, setFormDescription] = useState("");
  const [formParentId, setFormParentId] = useState<string>("none");

  const fetchAccounts = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("accounts")
      .select("*")
      .eq("organization_id", organization.id)
      .order("code");
    if (error) toast.error("Failed to load accounts");
    else setAccounts(data || []);
    setLoading(false);
  }, [organization?.id]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const seedDefaults = async () => {
    if (!organization?.id) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("seed_default_accounts", { org_id: organization.id });
    if (error) toast.error("Failed to seed default accounts");
    else { toast.success("Default accounts created"); fetchAccounts(); }
    setSaving(false);
  };

  const openCreate = () => {
    setEditingAccount(null);
    setFormCode(""); setFormName(""); setFormType("asset"); setFormDescription(""); setFormParentId("none");
    setDialogOpen(true);
  };

  const openEdit = (e: React.MouseEvent, account: Account) => {
    e.stopPropagation();
    setEditingAccount(account);
    setFormCode(account.code); setFormName(account.name); setFormType(account.type);
    setFormDescription(account.description || ""); setFormParentId(account.parent_id || "none");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!organization?.id || !formCode.trim() || !formName.trim()) {
      toast.error("Code and Name are required"); return;
    }
    setSaving(true);
    const payload = {
      organization_id: organization.id,
      code: formCode.trim(), name: formName.trim(), type: formType,
      description: formDescription.trim() || null,
      parent_id: formParentId === "none" ? null : formParentId,
    };
    if (editingAccount) {
      const { error } = await (supabase as any).from("accounts").update(payload).eq("id", editingAccount.id);
      if (error) toast.error(error.message);
      else { toast.success("Account updated"); setDialogOpen(false); fetchAccounts(); }
    } else {
      const { error } = await (supabase as any).from("accounts").insert(payload);
      if (error) toast.error(error.message);
      else { toast.success("Account created"); setDialogOpen(false); fetchAccounts(); }
    }
    setSaving(false);
  };

  const toggleActive = async (e: React.MouseEvent, account: Account) => {
    e.stopPropagation();
    const { error } = await (supabase as any).from("accounts").update({ is_active: !account.is_active }).eq("id", account.id);
    if (error) toast.error(error.message); else fetchAccounts();
  };

  const filtered = accounts.filter((a) => {
    const q = search.toLowerCase();
    const matchesSearch = a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q);
    const matchesType = filterType === "all" || a.type === filterType;
    return matchesSearch && matchesType;
  });

  const groupedByType = ACCOUNT_TYPES
    .map((type) => ({ type, accounts: filtered.filter((a) => a.type === type) }))
    .filter((g) => g.accounts.length > 0);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search accounts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {ACCOUNT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{ACCOUNT_THEME[t].pluralLabel}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          {accounts.length === 0 && !loading && (
            <Button variant="outline" onClick={seedDefaults} disabled={saving}>
              <BookOpenCheck className="h-4 w-4 mr-2" /> Seed Defaults
            </Button>
          )}
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Add Account</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground animate-pulse">Loading accounts...</div>
      ) : groupedByType.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No accounts found. Create accounts or seed defaults to get started.</CardContent></Card>
      ) : (
        <div className="space-y-5">
          {groupedByType.map(({ type, accounts: accts }) => {
            const theme = getTheme(type);
            const Icon = theme.icon;
            return (
              <div key={type}>
                {/* Section header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-5 w-1 rounded-full ${theme.accent}`} />
                  <Icon className={`h-4 w-4 ${theme.text}`} />
                  <h3 className={`text-sm font-semibold ${theme.text}`}>{theme.pluralLabel}</h3>
                  <Badge className={`${theme.badge} text-xs ml-1`}>{accts.length}</Badge>
                </div>
                {/* Account cards */}
                <div className="grid gap-2">
                  {accts.map((account) => (
                    <div
                      key={account.id}
                      onClick={() => onOpenLedger?.({ id: account.id, code: account.code, name: account.name, type: account.type })}
                      className={`group flex items-center gap-3 rounded-lg border p-3 transition-all cursor-pointer
                        ${account.is_active ? `${theme.cardBg} ${theme.border} hover:shadow-sm` : "bg-muted/30 border-muted opacity-60"}
                      `}
                    >
                      {/* Color dot */}
                      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${account.is_active ? theme.dot : "bg-muted-foreground/30"}`} />
                      {/* Code */}
                      <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{account.code}</span>
                      {/* Name + desc */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{account.name}</p>
                        {account.description && (
                          <p className="text-xs text-muted-foreground truncate">{account.description}</p>
                        )}
                      </div>
                      {/* Status badge */}
                      {!account.is_active && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Inactive</Badge>
                      )}
                      {/* Actions */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => openEdit(e, account)} title="Edit">
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => toggleActive(e, account)} title={account.is_active ? "Deactivate" : "Activate"}>
                          {account.is_active ? <ToggleRight className="h-3.5 w-3.5 text-emerald-600" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      {/* Chevron */}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "New Account"}</DialogTitle>
            <DialogDescription>{editingAccount ? "Update the account details below." : "Add a new account to your chart of accounts."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code</Label>
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="e.g. 1001" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((t) => {
                      const th = ACCOUNT_THEME[t];
                      return (
                        <SelectItem key={t} value={t}>
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${th.dot}`} />
                            {th.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Account name" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional description" rows={2} />
            </div>
            <div>
              <Label>Parent Account</Label>
              <Select value={formParentId} onValueChange={setFormParentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top-level)</SelectItem>
                  {accounts.filter((a) => a.type === formType && a.id !== editingAccount?.id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : editingAccount ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChartOfAccounts;
