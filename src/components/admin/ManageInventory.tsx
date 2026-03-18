import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { exportToExcel } from "@/lib/exportToExcel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ShoppingCart, TrendingDown, Wrench, Settings, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/contexts/OrganizationContext";
import { InventoryFilters } from "./inventory/InventoryFilters";
import { InventorySummary } from "./inventory/InventorySummary";
import { InventoryItemsTable, PurchasesTable, UsageTable, MaintenanceTable, AlertsTable } from "./inventory/InventoryTable";
import { InventoryFormDialog } from "./inventory/InventoryFormDialog";
import { PurchaseDialog, UsageDialog, MaintenanceDialog, CategoryDialog } from "./inventory/InventoryStockDialog";

interface InventoryCategory { id: string; name: string; type: string; description: string | null; }
interface InventoryItem { id: string; name: string; description: string | null; type: string; sku: string | null; unit: string; current_stock: number; min_stock_level: number; unit_price: number; supplier: string | null; location: string | null; is_active: boolean; category_id: string | null; category?: InventoryCategory; }
interface InventoryPurchase { id: string; item_id: string; quantity: number; unit_cost: number; total_cost: number; supplier: string | null; invoice_number: string | null; purchase_date: string; notes: string | null; item?: InventoryItem; }
interface InventoryUsage { id: string; item_id: string; patient_test_id: string | null; quantity: number; unit_cost: number | null; total_cost: number | null; usage_date: string; notes: string | null; item?: InventoryItem; }
interface EquipmentMaintenance { id: string; item_id: string; maintenance_type: string; scheduled_date: string | null; completed_date: string | null; cost: number | null; vendor: string | null; notes: string | null; status: string; item?: InventoryItem; }

const ManageInventory = () => {
  const { user } = useAuth();
  const { organization, loading: organizationLoading } = useOrganization();
  const organizationId = organization?.id ?? null;
  const purchaseQuantityInputRef = useRef<HTMLInputElement>(null);

  // Data state
  const [activeTab, setActiveTab] = useState("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
  const [usages, setUsages] = useState<InventoryUsage[]>([]);
  const [maintenances, setMaintenances] = useState<EquipmentMaintenance[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Dialog state
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [isUsageDialogOpen, setIsUsageDialogOpen] = useState(false);
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Form state
  const [itemForm, setItemForm] = useState({ name: "", description: "", type: "supply", sku: "", unit: "pcs", current_stock: 0, min_stock_level: 0, unit_price: 0, supplier: "", location: "", category_id: "" });
  const [purchaseForm, setPurchaseForm] = useState({ item_id: "", quantity: 0, unit_cost: 0, supplier: "", invoice_number: "", purchase_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
  const [purchaseBarcode, setPurchaseBarcode] = useState("");
  const [purchaseBarcodeStatus, setPurchaseBarcodeStatus] = useState<{ type: "idle" | "matched" | "not_found"; message: string }>({ type: "idle", message: "" });
  const [usageForm, setUsageForm] = useState({ item_id: "", quantity: 0, usage_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
  const [maintenanceForm, setMaintenanceForm] = useState({ item_id: "", maintenance_type: "", scheduled_date: format(new Date(), "yyyy-MM-dd"), cost: 0, vendor: "", notes: "", status: "scheduled" });
  const [categoryForm, setCategoryForm] = useState({ name: "", type: "supply", description: "" });

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    if (!organizationId) { setItems([]); setCategories([]); setPurchases([]); setUsages([]); setMaintenances([]); setLoading(false); return; }
    try {
      const [itemsRes, categoriesRes] = await Promise.all([
        supabase.from("inventory_items").select("*").eq("organization_id" as any, organizationId).order("name"),
        supabase.from("inventory_categories").select("*").eq("organization_id" as any, organizationId).order("name"),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      const categoryMap = new Map(categoriesRes.data?.map(c => [c.id, c]) || []);
      const itemsWithCategories = (itemsRes.data || []).map(item => ({ ...item, category: item.category_id ? categoryMap.get(item.category_id) : undefined }));
      const itemIds = itemsWithCategories.map(i => i.id);

      let purchasesData: InventoryPurchase[] = [], usagesData: InventoryUsage[] = [], maintenancesData: EquipmentMaintenance[] = [];
      if (itemIds.length > 0) {
        const [pRes, uRes, mRes] = await Promise.all([
          supabase.from("inventory_purchases").select("*").in("item_id", itemIds).order("purchase_date", { ascending: false }).limit(100),
          supabase.from("inventory_usage").select("*").in("item_id", itemIds).order("usage_date", { ascending: false }).limit(100),
          supabase.from("equipment_maintenance").select("*").in("item_id", itemIds).order("scheduled_date", { ascending: false }),
        ]);
        if (pRes.error) throw pRes.error; if (uRes.error) throw uRes.error; if (mRes.error) throw mRes.error;
        purchasesData = (pRes.data || []) as InventoryPurchase[];
        usagesData = (uRes.data || []) as InventoryUsage[];
        maintenancesData = (mRes.data || []) as EquipmentMaintenance[];
      }

      const itemMap = new Map(itemsWithCategories.map(i => [i.id, i]));
      setItems(itemsWithCategories);
      setCategories(categoriesRes.data || []);
      setPurchases(purchasesData.map(p => ({ ...p, item: itemMap.get(p.item_id) })));
      setUsages(usagesData.map(u => ({ ...u, item: itemMap.get(u.item_id) })));
      setMaintenances(maintenancesData.map(m => ({ ...m, item: itemMap.get(m.item_id) })));
    } catch (error) { console.error("Error fetching inventory data:", error); toast.error("Failed to load inventory data"); }
    finally { setLoading(false); }
  }, [organizationId]);

  useEffect(() => {
    if (organizationLoading) return;
    if (!organizationId) { setItems([]); setCategories([]); setPurchases([]); setUsages([]); setMaintenances([]); setLoading(false); return; }
    void fetchData();
  }, [fetchData, organizationId, organizationLoading]);

  // ── Derived state ──
  const filteredItems = useMemo(() => items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || item.sku?.toLowerCase().includes(searchQuery.toLowerCase()) || item.supplier?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && (typeFilter === "all" || item.type === typeFilter);
  }), [items, searchQuery, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  const lowStockItems = useMemo(() => items.filter(i => i.current_stock <= i.min_stock_level && i.is_active), [items]);
  const equipmentItems = useMemo(() => items.filter(i => i.type === "equipment"), [items]);
  const selectedPurchaseItem = useMemo(() => items.find(i => i.id === purchaseForm.item_id) || null, [items, purchaseForm.item_id]);
  const totalValue = items.reduce((sum, i) => sum + i.current_stock * i.unit_price, 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + p.total_cost, 0);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, typeFilter]);
  useEffect(() => { if (currentPage !== safePage) setCurrentPage(safePage); }, [currentPage, safePage]);
  useEffect(() => {
    if (!purchaseForm.item_id) return;
    const matched = items.find(i => i.id === purchaseForm.item_id);
    if (!matched) return;
    if (matched.sku) setPurchaseBarcode(matched.sku);
    setPurchaseBarcodeStatus({ type: "matched", message: `${matched.name}${matched.supplier ? ` from ${matched.supplier}` : ""} selected.` });
  }, [items, purchaseForm.item_id]);

  // ── Reset helpers ──
  const resetItemForm = () => setItemForm({ name: "", description: "", type: "supply", sku: "", unit: "pcs", current_stock: 0, min_stock_level: 0, unit_price: 0, supplier: "", location: "", category_id: "" });
  const resetPurchaseForm = () => { setPurchaseForm({ item_id: "", quantity: 0, unit_cost: 0, supplier: "", invoice_number: "", purchase_date: format(new Date(), "yyyy-MM-dd"), notes: "" }); setPurchaseBarcode(""); setPurchaseBarcodeStatus({ type: "idle", message: "" }); };
  const resetUsageForm = () => setUsageForm({ item_id: "", quantity: 0, usage_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
  const resetMaintenanceForm = () => setMaintenanceForm({ item_id: "", maintenance_type: "", scheduled_date: format(new Date(), "yyyy-MM-dd"), cost: 0, vendor: "", notes: "", status: "scheduled" });
  const resetCategoryForm = () => setCategoryForm({ name: "", type: "supply", description: "" });

  // ── Handlers ──
  const handleItemSubmit = async () => {
    if (!organizationId) { toast.error("Organization context required"); return; }
    try {
      if (editingItem) {
        const { error } = await supabase.from("inventory_items").update({ ...itemForm, organization_id: organizationId, category_id: itemForm.category_id || null }).eq("id", editingItem.id).eq("organization_id" as any, organizationId);
        if (error) throw error; toast.success("Item updated");
      } else {
        const { error } = await supabase.from("inventory_items").insert({ ...itemForm, organization_id: organizationId, category_id: itemForm.category_id || null });
        if (error) throw error; toast.success("Item added");
      }
      setIsItemDialogOpen(false); setEditingItem(null); resetItemForm(); fetchData();
    } catch (error) { console.error("Error saving item:", error); toast.error("Failed to save item"); }
  };

  const handlePurchaseSubmit = async () => {
    if (!organizationId) { toast.error("Organization context required"); return; }
    try {
      const total_cost = purchaseForm.quantity * purchaseForm.unit_cost;
      const { error } = await supabase.from("inventory_purchases").insert({ ...purchaseForm, organization_id: organizationId, total_cost, purchased_by: user?.id });
      if (error) throw error;
      const item = items.find(i => i.id === purchaseForm.item_id);
      if (item) await supabase.from("inventory_items").update({ current_stock: item.current_stock + purchaseForm.quantity }).eq("id", purchaseForm.item_id).eq("organization_id" as any, organizationId);
      toast.success("Purchase recorded"); setIsPurchaseDialogOpen(false); resetPurchaseForm(); fetchData();
    } catch (error) { console.error("Error recording purchase:", error); toast.error("Failed to record purchase"); }
  };

  const handleUsageSubmit = async () => {
    if (!organizationId) { toast.error("Organization context required"); return; }
    try {
      const item = items.find(i => i.id === usageForm.item_id);
      if (!item) { toast.error("Item not found"); return; }
      if (usageForm.quantity > item.current_stock) { toast.error("Insufficient stock"); return; }
      const { error } = await supabase.from("inventory_usage").insert({ ...usageForm, organization_id: organizationId, unit_cost: item.unit_price, total_cost: usageForm.quantity * item.unit_price, recorded_by: user?.id });
      if (error) throw error;
      await supabase.from("inventory_items").update({ current_stock: item.current_stock - usageForm.quantity }).eq("id", usageForm.item_id).eq("organization_id" as any, organizationId);
      toast.success("Usage recorded"); setIsUsageDialogOpen(false); resetUsageForm(); fetchData();
    } catch (error) { console.error("Error recording usage:", error); toast.error("Failed to record usage"); }
  };

  const handleMaintenanceSubmit = async () => {
    if (!organizationId) { toast.error("Organization context required"); return; }
    try {
      const { error } = await supabase.from("equipment_maintenance").insert({ ...maintenanceForm, cost: maintenanceForm.cost || null, organization_id: organizationId, performed_by: user?.id });
      if (error) throw error;
      toast.success("Maintenance scheduled"); setIsMaintenanceDialogOpen(false); resetMaintenanceForm(); fetchData();
    } catch (error) { console.error("Error scheduling maintenance:", error); toast.error("Failed to schedule maintenance"); }
  };

  const handleCategorySubmit = async () => {
    if (!organizationId) { toast.error("Organization context required"); return; }
    try {
      const { error } = await supabase.from("inventory_categories").insert({ ...categoryForm, organization_id: organizationId });
      if (error) throw error;
      toast.success("Category added"); setIsCategoryDialogOpen(false); resetCategoryForm(); fetchData();
    } catch (error) { console.error("Error adding category:", error); toast.error("Failed to add category"); }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    if (!organizationId) { toast.error("Organization context required"); return; }
    try {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id).eq("organization_id" as any, organizationId);
      if (error) throw error; toast.success("Item deleted"); fetchData();
    } catch (error) { console.error("Error deleting item:", error); toast.error("Failed to delete item"); }
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setItemForm({ name: item.name, description: item.description || "", type: item.type, sku: item.sku || "", unit: item.unit, current_stock: item.current_stock, min_stock_level: item.min_stock_level, unit_price: item.unit_price, supplier: item.supplier || "", location: item.location || "", category_id: item.category_id || "" });
    setIsItemDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, JSX.Element> = {
      scheduled: <Badge className="bg-blue-100 text-blue-700">Scheduled</Badge>,
      in_progress: <Badge className="bg-yellow-100 text-yellow-700">In Progress</Badge>,
      completed: <Badge className="bg-green-100 text-green-700">Completed</Badge>,
      cancelled: <Badge className="bg-gray-100 text-gray-700">Cancelled</Badge>,
    };
    return map[status] || <Badge variant="outline">{status}</Badge>;
  };

  const handlePurchaseBarcodeLookup = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) { setPurchaseBarcodeStatus({ type: "idle", message: "" }); return; }
    const matched = items.find(i => (i.sku || "").trim().toLowerCase() === code.toLowerCase());
    if (!matched) { setPurchaseForm(c => ({ ...c, item_id: "" })); setPurchaseBarcodeStatus({ type: "not_found", message: "Barcode not registered. Add the item once, then future scans will auto-fill it." }); return; }
    setPurchaseForm(c => ({ ...c, item_id: matched.id, supplier: c.supplier || matched.supplier || "", unit_cost: c.unit_cost || matched.unit_price || 0 }));
    setPurchaseBarcode(matched.sku || code);
    setPurchaseBarcodeStatus({ type: "matched", message: `${matched.name}${matched.supplier ? ` from ${matched.supplier}` : ""} selected.` });
    window.setTimeout(() => { purchaseQuantityInputRef.current?.focus(); purchaseQuantityInputRef.current?.select(); }, 0);
  };

  const openNewItemFromBarcode = () => {
    setEditingItem(null);
    setItemForm({ name: "", description: "", type: "supply", sku: purchaseBarcode.trim(), unit: "pcs", current_stock: 0, min_stock_level: 0, unit_price: 0, supplier: "", location: "", category_id: "" });
    setIsItemDialogOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><div className="animate-pulse text-muted-foreground">Loading inventory...</div></div>;
  }

  return (
    <div className="space-y-6">
      <InventorySummary totalItems={items.length} totalValue={totalValue} lowStockItems={lowStockItems} totalPurchases={totalPurchases} />

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => { setEditingItem(null); resetItemForm(); setIsItemDialogOpen(true); }} className="bg-clinical-navy hover:bg-clinical-navy/90"><Plus className="h-4 w-4 mr-2" />Add Item</Button>
        <Button variant="outline" onClick={() => { resetPurchaseForm(); setIsPurchaseDialogOpen(true); }}><ShoppingCart className="h-4 w-4 mr-2" />Record Purchase</Button>
        <Button variant="outline" onClick={() => { resetUsageForm(); setIsUsageDialogOpen(true); }}><TrendingDown className="h-4 w-4 mr-2" />Record Usage</Button>
        <Button variant="outline" onClick={() => { resetMaintenanceForm(); setIsMaintenanceDialogOpen(true); }}><Wrench className="h-4 w-4 mr-2" />Schedule Maintenance</Button>
        <Button variant="outline" onClick={() => { resetCategoryForm(); setIsCategoryDialogOpen(true); }}><Settings className="h-4 w-4 mr-2" />Add Category</Button>
        <Button variant="outline" onClick={() => exportToExcel("inventory", [
          { key: "name", label: "Name" }, { key: "type", label: "Type" }, { key: "sku", label: "SKU" },
          { key: "unit", label: "Unit" }, { key: "current_stock", label: "Stock" },
          { key: "min_stock_level", label: "Min Level" }, { key: "unit_price", label: "Unit Price" },
          { key: "supplier", label: "Supplier" }, { key: "location", label: "Location" },
        ], items)}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />Export
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="items">Inventory Items</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="alerts">Low Stock Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-4 space-y-4">
          <InventoryFilters searchQuery={searchQuery} onSearchChange={setSearchQuery} typeFilter={typeFilter} onTypeFilterChange={setTypeFilter} />
          <InventoryItemsTable pagedItems={pagedItems} filteredItems={filteredItems} currentPage={safePage} pageSize={pageSize} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} onEditItem={openEditItem} onDeleteItem={handleDeleteItem} />
        </TabsContent>

        <TabsContent value="purchases" className="mt-4"><PurchasesTable purchases={purchases} /></TabsContent>
        <TabsContent value="usage" className="mt-4"><UsageTable usages={usages} /></TabsContent>
        <TabsContent value="maintenance" className="mt-4"><MaintenanceTable maintenances={maintenances} getStatusBadge={getStatusBadge} /></TabsContent>
        <TabsContent value="alerts" className="mt-4"><AlertsTable items={lowStockItems} onReorder={(item) => { resetPurchaseForm(); setPurchaseForm(f => ({ ...f, item_id: item.id })); setIsPurchaseDialogOpen(true); }} /></TabsContent>
      </Tabs>

      <InventoryFormDialog isOpen={isItemDialogOpen} onOpenChange={setIsItemDialogOpen} editingItem={editingItem} itemForm={itemForm} onItemFormChange={setItemForm} categories={categories} onSubmit={handleItemSubmit} />
      <PurchaseDialog isOpen={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen} purchaseForm={purchaseForm} onPurchaseFormChange={setPurchaseForm} purchaseBarcode={purchaseBarcode} onPurchaseBarcodeChange={setPurchaseBarcode} purchaseBarcodeStatus={purchaseBarcodeStatus} onBarcodeLookup={handlePurchaseBarcodeLookup} onOpenNewItemFromBarcode={openNewItemFromBarcode} items={items} selectedPurchaseItem={selectedPurchaseItem} onSubmit={handlePurchaseSubmit} purchaseQuantityInputRef={purchaseQuantityInputRef} />
      <UsageDialog isOpen={isUsageDialogOpen} onOpenChange={setIsUsageDialogOpen} usageForm={usageForm} onUsageFormChange={setUsageForm} items={items} onSubmit={handleUsageSubmit} />
      <MaintenanceDialog isOpen={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen} maintenanceForm={maintenanceForm} onMaintenanceFormChange={setMaintenanceForm} equipmentItems={equipmentItems} onSubmit={handleMaintenanceSubmit} />
      <CategoryDialog isOpen={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen} categoryForm={categoryForm} onCategoryFormChange={setCategoryForm} onSubmit={handleCategorySubmit} />
    </div>
  );
};

export default ManageInventory;
