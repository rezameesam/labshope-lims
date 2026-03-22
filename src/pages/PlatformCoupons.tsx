import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Loader2, Plus, Tag, XCircle } from "lucide-react";
import PlatformRoute from "@/components/platform/PlatformRoute";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataPagination } from "@/components/ui/data-pagination";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface CouponCode {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  applicable_plans: string[] | null;
  max_uses: number | null;
  uses_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  note: string | null;
  created_at: string;
}

const PLAN_OPTIONS = ["starter", "growth", "premium"] as const;

const defaultForm = {
  code: "",
  discount_type: "percent" as "percent" | "fixed",
  discount_value: "",
  applicable_plans_all: true,
  applicable_plans: [] as string[],
  max_uses: "",
  valid_until: "",
  note: "",
};

function formatDiscount(c: CouponCode) {
  return c.discount_type === "percent"
    ? `${c.discount_value}%`
    : `₹${c.discount_value}`;
}

function formatPlans(plans: string[] | null) {
  if (!plans || plans.length === 0) return "All plans";
  return plans.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ");
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PlatformCoupons() {
  const { user } = useAuth();

  const [coupons, setCoupons] = useState<CouponCode[]>([]);
  const [fetching, setFetching] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [sort, setSort] = useState<{ col: keyof CouponCode; dir: "asc" | "desc" }>({
    col: "created_at",
    dir: "desc",
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const fetchCoupons = async () => {
    setFetching(true);
    const { data, error } = await (supabase as any)
      .from("platform_coupon_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load coupon codes.");
    } else {
      setCoupons((data as CouponCode[]) ?? []);
    }
    setFetching(false);
  };

  useEffect(() => {
    void fetchCoupons();
  }, []);

  const sortedCoupons = useMemo(() => {
    return [...coupons].sort((a, b) => {
      const av = a[sort.col] ?? "";
      const bv = b[sort.col] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [coupons, sort]);

  useEffect(() => { setPage(1); }, [sort]);

  const pagedCoupons = useMemo(
    () => sortedCoupons.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedCoupons, page],
  );

  const handleSort = (col: keyof CouponCode) => {
    setSort((prev) =>
      prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }
    );
  };

  const SortIcon = ({ col }: { col: keyof CouponCode }) => {
    if (sort.col !== col) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" />;
    return sort.dir === "asc"
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };

  const handleOpenDialog = () => {
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const handleToggleActive = async (coupon: CouponCode) => {
    setTogglingId(coupon.id);
    const { error } = await (supabase as any)
      .from("platform_coupon_codes")
      .update({ is_active: !coupon.is_active })
      .eq("id", coupon.id);

    if (error) {
      toast.error("Failed to update coupon status.");
    } else {
      toast.success(`Coupon ${coupon.is_active ? "deactivated" : "activated"}.`);
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, is_active: !c.is_active } : c))
      );
    }
    setTogglingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const code = form.code.trim().toUpperCase();
    if (!code) { toast.error("Coupon code is required."); return; }
    const discountValue = parseFloat(form.discount_value);
    if (!form.discount_value || isNaN(discountValue) || discountValue <= 0) {
      toast.error("Discount value must be a positive number."); return;
    }
    if (form.discount_type === "percent" && discountValue > 100) {
      toast.error("Percent discount cannot exceed 100."); return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      code,
      discount_type: form.discount_type,
      discount_value: discountValue,
      applicable_plans: form.applicable_plans_all ? null : form.applicable_plans.length > 0 ? form.applicable_plans : null,
      max_uses: form.max_uses ? parseInt(form.max_uses, 10) : null,
      valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
      note: form.note.trim() || null,
      created_by: user?.id ?? null,
    };

    const { error } = await (supabase as any)
      .from("platform_coupon_codes")
      .insert(payload);

    if (error) {
      toast.error("Failed to create coupon.");
    } else {
      toast.success(`Coupon "${code}" created.`);
      setDialogOpen(false);
      void fetchCoupons();
    }

    setSaving(false);
  };

  const togglePlan = (plan: string) => {
    setForm((prev) => {
      const already = prev.applicable_plans.includes(plan);
      return {
        ...prev,
        applicable_plans: already
          ? prev.applicable_plans.filter((p) => p !== plan)
          : [...prev.applicable_plans, plan],
      };
    });
  };

  return (
    <PlatformRoute>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium mb-1">
            <Tag className="h-4 w-4" />
            <span>Coupons</span>
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground tracking-tight">
            Discount Codes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage coupon codes for plan discounts.
          </p>
        </div>
        <Button onClick={handleOpenDialog} className="gap-2">
          <Plus className="h-4 w-4" />
          New Coupon
        </Button>
      </div>

      {/* Table card */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {fetching ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading coupons…
          </div>
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Tag className="h-8 w-8 opacity-30" />
            <p className="text-sm">No coupon codes yet. Create your first one.</p>
          </div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 border-b border-border">
                {(
                  [
                    { label: "Code", col: "code", className: "pl-6" },
                    { label: "Discount", col: "discount_value" },
                    { label: "Plans", col: "applicable_plans" },
                    { label: "Uses", col: "uses_count" },
                    { label: "Valid Until", col: "valid_until" },
                    { label: "Status", col: "is_active" },
                    { label: "Created", col: "created_at" },
                  ] as { label: string; col: keyof CouponCode; className?: string }[]
                ).map(({ label, col, className }) => (
                  <TableHead key={col} className={`font-semibold text-foreground/80 ${className ?? ""}`}>
                    <button
                      type="button"
                      onClick={() => handleSort(col)}
                      className="inline-flex items-center hover:text-foreground transition-colors"
                    >
                      {label}
                      <SortIcon col={col} />
                    </button>
                  </TableHead>
                ))}
                <TableHead className="font-semibold text-foreground/80 pr-6 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedCoupons.map((coupon) => (
                <TableRow key={coupon.id} className="border-b border-slate-100 last:border-0">
                  <TableCell className="pl-6">
                    <span className="font-mono text-sm font-semibold tracking-widest text-slate-800">
                      {coupon.code}
                    </span>
                    {coupon.note && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[160px]">{coupon.note}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-lg bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                      {formatDiscount(coupon)}
                      <span className="ml-1 font-normal text-indigo-500">
                        {coupon.discount_type === "percent" ? "off" : "flat"}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatPlans(coupon.applicable_plans)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {coupon.uses_count}
                    {coupon.max_uses !== null ? ` / ${coupon.max_uses}` : " / ∞"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(coupon.valid_until)}
                  </TableCell>
                  <TableCell>
                    {coupon.is_active ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(coupon.created_at)}
                  </TableCell>
                  <TableCell className="pr-6 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleToggleActive(coupon)}
                      disabled={togglingId === coupon.id}
                      className={
                        coupon.is_active
                          ? "text-muted-foreground hover:text-red-600 hover:bg-red-50"
                          : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
                      }
                    >
                      {togglingId === coupon.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : coupon.is_active ? (
                        <>
                          <XCircle className="h-3.5 w-3.5 mr-1.5" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          Activate
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataPagination
            total={sortedCoupons.length}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
          </>
        )}
      </div>

      {/* New Coupon Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Coupon Code</DialogTitle>
            <DialogDescription>
              Create a discount code for plan sign-ups. Codes are stored in uppercase.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 pt-1">
            {/* Code */}
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">
                Code <span className="text-red-500">*</span>
              </Label>
              <Input
                id="coupon-code"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. LAUNCH50"
                className="font-mono tracking-widest uppercase"
                autoComplete="off"
                required
              />
            </div>

            {/* Discount type + value */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-discount-type">
                  Discount type <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.discount_type}
                  onValueChange={(v) => setForm((p) => ({ ...p, discount_type: v as "percent" | "fixed" }))}
                >
                  <SelectTrigger id="coupon-discount-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="fixed">Fixed amount (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-discount-value">
                  Value <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="coupon-discount-value"
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={form.discount_type === "percent" ? "100" : undefined}
                  value={form.discount_value}
                  onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))}
                  placeholder={form.discount_type === "percent" ? "e.g. 20" : "e.g. 2000"}
                  required
                />
              </div>
            </div>

            {/* Applicable plans */}
            <div className="space-y-2">
              <Label>Applicable plans</Label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="coupon-plans-all"
                    checked={form.applicable_plans_all}
                    onCheckedChange={(checked) =>
                      setForm((p) => ({ ...p, applicable_plans_all: Boolean(checked), applicable_plans: [] }))
                    }
                  />
                  <label htmlFor="coupon-plans-all" className="text-sm cursor-pointer text-foreground/80">
                    All plans
                  </label>
                </div>
                {!form.applicable_plans_all && (
                  <div className="ml-1 flex gap-4 flex-wrap">
                    {PLAN_OPTIONS.map((plan) => (
                      <div key={plan} className="flex items-center gap-2">
                        <Checkbox
                          id={`coupon-plan-${plan}`}
                          checked={form.applicable_plans.includes(plan)}
                          onCheckedChange={() => togglePlan(plan)}
                        />
                        <label
                          htmlFor={`coupon-plan-${plan}`}
                          className="text-sm cursor-pointer text-foreground/80 capitalize"
                        >
                          {plan}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Max uses + valid until */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-max-uses">
                  Max uses <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="coupon-max-uses"
                  type="number"
                  min="1"
                  step="1"
                  value={form.max_uses}
                  onChange={(e) => setForm((p) => ({ ...p, max_uses: e.target.value }))}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-valid-until">
                  Valid until <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="coupon-valid-until"
                  type="date"
                  value={form.valid_until}
                  onChange={(e) => setForm((p) => ({ ...p, valid_until: e.target.value }))}
                />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="coupon-note">
                Note <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="coupon-note"
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="e.g. Launch campaign discount"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Coupon
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PlatformRoute>
  );
}
