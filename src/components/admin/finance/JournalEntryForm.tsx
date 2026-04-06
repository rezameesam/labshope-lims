import { useState, useEffect } from "react";
import {
  Plus, Trash2, Save, X, Landmark, TrendingDown, TrendingUp, ArrowLeftRight,
  Banknote, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/hooks/useAuth";
import { todayIST } from "@/lib/date";
import { DatePicker } from "@/components/ui/date-picker";
import { getTheme } from "./constants";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface EntryLine {
  id: string;
  account_id: string;
  description: string;
  debit: string;
  credit: string;
}

let lineCounter = 0;
const newLine = (): EntryLine => ({
  id: `line-${++lineCounter}`,
  account_id: "",
  description: "",
  debit: "",
  credit: "",
});

interface Props {
  onSaved?: () => void;
  onCancel?: () => void;
}

// ── Quick template definitions ──────────────────────────────────
interface QuickTemplate {
  id: string;
  label: string;
  description: string;
  icon: typeof Landmark;
  color: string;
  /** Account filter for "from" side */
  fromTypes: string[];
  fromLabel: string;
  /** Account filter for "to" side */
  toTypes: string[];
  toLabel: string;
  /** Which side gets the debit? "from" or "to" */
  debitSide: "from" | "to";
  autoDescription: (from: Account | undefined, to: Account | undefined, amount: string) => string;
}

const TEMPLATES: QuickTemplate[] = [
  {
    id: "capital",
    label: "Capital Investment",
    description: "Owner puts money into the business",
    icon: Landmark,
    color: "text-violet-600 dark:text-violet-400",
    fromTypes: ["equity"],
    fromLabel: "Capital Account",
    toTypes: ["asset"],
    toLabel: "Money Goes To",
    debitSide: "to",
    autoDescription: (_f, _t, amt) => `Capital investment of ${amt}`,
  },
  {
    id: "income",
    label: "Record Income",
    description: "Receive money from a patient or client",
    icon: TrendingUp,
    color: "text-emerald-600 dark:text-emerald-400",
    fromTypes: ["revenue"],
    fromLabel: "Revenue Type",
    toTypes: ["asset"],
    toLabel: "Money Goes To",
    debitSide: "to",
    autoDescription: (f, _t, amt) => `Income — ${f?.name || "Revenue"} — ${amt}`,
  },
  {
    id: "expense",
    label: "Record Expense",
    description: "Pay for an expense from cash or bank",
    icon: TrendingDown,
    color: "text-amber-600 dark:text-amber-400",
    fromTypes: ["asset"],
    fromLabel: "Pay From",
    toTypes: ["expense"],
    toLabel: "Expense Type",
    debitSide: "to",
    autoDescription: (_, t, amt) => `Expense — ${t?.name || "Expense"} — ${amt}`,
  },
  {
    id: "transfer",
    label: "Transfer Between Accounts",
    description: "Move money from one account to another",
    icon: ArrowLeftRight,
    color: "text-blue-600 dark:text-blue-400",
    fromTypes: ["asset"],
    fromLabel: "From Account",
    toTypes: ["asset"],
    toLabel: "To Account",
    debitSide: "to",
    autoDescription: (f, t, amt) => `Transfer — ${f?.name || ""} to ${t?.name || ""} — ${amt}`,
  },
];

const JournalEntryForm = ({ onSaved, onCancel }: Props) => {
  const { organization } = useOrganization();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);

  // Quick template state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [tplFromAccount, setTplFromAccount] = useState("");
  const [tplToAccount, setTplToAccount] = useState("");
  const [tplAmount, setTplAmount] = useState("");
  const [tplDate, setTplDate] = useState(todayIST());
  const [tplReference, setTplReference] = useState("");

  // Advanced form state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [entryDate, setEntryDate] = useState(todayIST());
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<EntryLine[]>([newLine(), newLine()]);

  useEffect(() => {
    if (!organization?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("accounts")
        .select("id, code, name, type")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("code");
      setAccounts(data || []);
    })();
  }, [organization?.id]);

  // ── Save helper (shared by template + advanced) ──────────────
  const postEntry = async (date: string, desc: string, ref: string, entryLines: { account_id: string; description: string; debit: number; credit: number }[]) => {
    if (!organization?.id) return;
    setLoading(true);

    const { count } = await (supabase as any)
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id);
    const entryNumber = `JE-${String((count || 0) + 1).padStart(5, "0")}`;

    const { data: entry, error: entryError } = await (supabase as any)
      .from("journal_entries")
      .insert({
        organization_id: organization.id,
        entry_number: entryNumber,
        entry_date: date,
        description: desc,
        reference: ref || null,
        status: "posted",
        created_by: user?.id,
      })
      .select("id")
      .single();

    if (entryError) { toast.error(entryError.message); setLoading(false); return; }

    const { error: linesError } = await (supabase as any)
      .from("journal_entry_lines")
      .insert(entryLines.map((l) => ({ journal_entry_id: entry.id, ...l })));

    if (linesError) {
      toast.error(linesError.message);
      await (supabase as any).from("journal_entries").delete().eq("id", entry.id);
    } else {
      toast.success(`Journal Entry ${entryNumber} created`);
      onSaved?.();
    }
    setLoading(false);
  };

  // ── Quick template submit ────────────────────────────────────
  const handleTemplateSubmit = async () => {
    const tpl = TEMPLATES.find((t) => t.id === selectedTemplate);
    if (!tpl) return;
    const amount = parseFloat(tplAmount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (!tplFromAccount || !tplToAccount) { toast.error("Select both accounts"); return; }
    if (tplFromAccount === tplToAccount) { toast.error("From and To accounts must be different"); return; }

    const fromAcc = accounts.find((a) => a.id === tplFromAccount);
    const toAcc = accounts.find((a) => a.id === tplToAccount);
    const desc = tpl.autoDescription(fromAcc, toAcc, tplAmount);

    const entryLines = tpl.debitSide === "to"
      ? [
          { account_id: tplToAccount, description: "", debit: amount, credit: 0 },
          { account_id: tplFromAccount, description: "", debit: 0, credit: amount },
        ]
      : [
          { account_id: tplFromAccount, description: "", debit: amount, credit: 0 },
          { account_id: tplToAccount, description: "", debit: 0, credit: amount },
        ];

    await postEntry(tplDate, desc, tplReference, entryLines);

    // Reset
    setTplAmount("");
    setTplFromAccount("");
    setTplToAccount("");
    setTplReference("");
    setSelectedTemplate(null);
  };

  // ── Advanced form helpers ────────────────────────────────────
  const updateLine = (id: string, field: keyof EntryLine, value: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, [field]: value };
        if (field === "debit" && value) next.credit = "";
        if (field === "credit" && value) next.debit = "";
        return next;
      })
    );
  };

  const autoBalance = () => {
    setLines((prev) => {
      const totalD = prev.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
      const totalC = prev.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
      const diff = totalD - totalC;
      if (Math.abs(diff) < 0.01) return prev;
      const emptyLines = prev.filter((l) => !l.debit && !l.credit);
      if (emptyLines.length !== 1) return prev;
      const target = emptyLines[0];
      return prev.map((l) => {
        if (l.id !== target.id) return l;
        if (diff > 0) return { ...l, credit: String(diff), debit: "" };
        return { ...l, debit: String(-diff), credit: "" };
      });
    });
  };

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const handleAdvancedSave = async () => {
    if (!description.trim()) { toast.error("Description is required"); return; }
    if (!isBalanced) { toast.error("Debits and credits must be equal"); return; }
    const validLines = lines.filter((l) => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length < 2) { toast.error("At least 2 lines required"); return; }

    await postEntry(
      entryDate,
      description.trim(),
      reference.trim(),
      validLines.map((l) => ({
        account_id: l.account_id,
        description: l.description.trim(),
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
      }))
    );
    setDescription("");
    setReference("");
    setLines([newLine(), newLine()]);
  };

  // ── Account select filtered by type ──────────────────────────
  const renderAccountSelect = (value: string, onChange: (v: string) => void, filterTypes: string[], label: string) => {
    const filtered = accounts.filter((a) => filterTypes.includes(a.type));
    const grouped = filterTypes
      .map((type) => ({
        type,
        label: getTheme(type).pluralLabel,
        dot: getTheme(type).dot,
        items: filtered.filter((a) => a.type === type),
      }))
      .filter((g) => g.items.length > 0);

    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>
          {grouped.map((g) => (
            <div key={g.type}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${g.dot}`} />
                {g.label}
              </div>
              {g.items.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const accountsByType = ["asset", "liability", "equity", "revenue", "expense"].map((type) => ({
    type,
    label: type.charAt(0).toUpperCase() + type.slice(1),
    items: accounts.filter((a) => a.type === type),
  })).filter((g) => g.items.length > 0);

  const activeTpl = TEMPLATES.find((t) => t.id === selectedTemplate);

  return (
    <div className="space-y-4">
      {/* ── Quick Templates ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Banknote className="h-4 w-4" />
            Quick Entry
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Template buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              const active = selectedTemplate === tpl.id;
              return (
                <button
                  key={tpl.id}
                  onClick={() => setSelectedTemplate(active ? null : tpl.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all text-sm
                    ${active
                      ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                      : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                >
                  <Icon className={`h-5 w-5 ${tpl.color}`} />
                  <span className="font-medium leading-tight">{tpl.label}</span>
                  <span className="text-[10px] text-muted-foreground leading-tight">{tpl.description}</span>
                </button>
              );
            })}
          </div>

          {/* Template form */}
          {activeTpl && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">{activeTpl.fromLabel}</Label>
                  {renderAccountSelect(tplFromAccount, setTplFromAccount, activeTpl.fromTypes, activeTpl.fromLabel)}
                </div>
                <div>
                  <Label className="text-xs">{activeTpl.toLabel}</Label>
                  {renderAccountSelect(tplToAccount, setTplToAccount, activeTpl.toTypes, activeTpl.toLabel)}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tplAmount}
                    onChange={(e) => setTplAmount(e.target.value)}
                    placeholder="0.00"
                    className="text-right font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">Date</Label>
                  <DatePicker value={tplDate} onChange={setTplDate} />
                </div>
                <div>
                  <Label className="text-xs">Reference (optional)</Label>
                  <Input value={tplReference} onChange={(e) => setTplReference(e.target.value)} placeholder="Receipt #, etc." />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setSelectedTemplate(null)}>Cancel</Button>
                <Button size="sm" onClick={handleTemplateSubmit} disabled={loading}>
                  <Save className="h-4 w-4 mr-1" />
                  {loading ? "Posting..." : "Post Entry"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Advanced Journal Entry (collapsible) ─────────────── */}
      <Card>
        <CardHeader className="pb-0">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full text-left"
          >
            <CardTitle className="text-sm text-muted-foreground">Advanced: Manual Journal Entry</CardTitle>
            {showAdvanced ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </CardHeader>

        {showAdvanced && (
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Label>Date</Label>
                <DatePicker value={entryDate} onChange={setEntryDate} />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Reagent purchase" />
              </div>
              <div>
                <Label>Reference</Label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Invoice #, receipt #, etc." />
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Account</TableHead>
                    <TableHead className="hidden sm:table-cell">Memo</TableHead>
                    <TableHead className="w-32 text-right">Debit</TableHead>
                    <TableHead className="w-32 text-right">Credit</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Select value={line.account_id} onValueChange={(v) => updateLine(line.id, "account_id", v)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accountsByType.map((group) => (
                              <div key={group.type}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                                  {group.label}
                                </div>
                                {group.items.map((a) => (
                                  <SelectItem key={a.id} value={a.id}>
                                    {a.code} - {a.name}
                                  </SelectItem>
                                ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(line.id, "description", e.target.value)}
                          placeholder="Line memo"
                          className="h-9"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debit}
                          onChange={(e) => updateLine(line.id, "debit", e.target.value)}
                          onBlur={autoBalance}
                          placeholder={line.credit ? "—" : "0.00"}
                          className={`h-9 text-right ${line.credit ? "opacity-40" : ""}`}
                          disabled={!!line.credit}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.credit}
                          onChange={(e) => updateLine(line.id, "credit", e.target.value)}
                          onBlur={autoBalance}
                          placeholder={line.debit ? "—" : "0.00"}
                          className={`h-9 text-right ${line.debit ? "opacity-40" : ""}`}
                          disabled={!!line.debit}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine(line.id)}
                          disabled={lines.length <= 2}
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-right font-semibold">
                      Totals
                      {!isBalanced && totalDebit > 0 && (
                        <span className="ml-2 text-destructive text-xs font-normal">
                          (Difference: {Math.abs(totalDebit - totalCredit).toFixed(2)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {totalDebit.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {totalCredit.toFixed(2)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-between">
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
              <div className="flex gap-2">
                {onCancel && (
                  <Button variant="outline" onClick={onCancel}>
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                )}
                <Button onClick={handleAdvancedSave} disabled={loading || !isBalanced}>
                  <Save className="h-4 w-4 mr-1" />
                  {loading ? "Saving..." : "Post Entry"}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default JournalEntryForm;
