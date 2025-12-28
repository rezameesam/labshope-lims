import { useState, useEffect, useMemo } from "react";
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  ShoppingCart,
  TrendingDown,
  Wrench,
  AlertTriangle,
  Filter,
  ArrowUpDown,
  IndianRupee,
  Calendar,
  Box,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface InventoryCategory {
  id: string;
  name: string;
  type: string;
  description: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  type: string;
  sku: string | null;
  unit: string;
  current_stock: number;
  min_stock_level: number;
  unit_price: number;
  supplier: string | null;
  location: string | null;
  is_active: boolean;
  category_id: string | null;
  category?: InventoryCategory;
}

interface InventoryPurchase {
  id: string;
  item_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  supplier: string | null;
  invoice_number: string | null;
  purchase_date: string;
  notes: string | null;
  item?: InventoryItem;
}

interface InventoryUsage {
  id: string;
  item_id: string;
  patient_test_id: string | null;
  quantity: number;
  unit_cost: number | null;
  total_cost: number | null;
  usage_date: string;
  notes: string | null;
  item?: InventoryItem;
}

interface EquipmentMaintenance {
  id: string;
  item_id: string;
  maintenance_type: string;
  scheduled_date: string | null;
  completed_date: string | null;
  cost: number | null;
  vendor: string | null;
  notes: string | null;
  status: string;
  item?: InventoryItem;
}

const ManageInventory = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<InventoryCategory[]>([]);
  const [purchases, setPurchases] = useState<InventoryPurchase[]>([]);
  const [usages, setUsages] = useState<InventoryUsage[]>([]);
  const [maintenances, setMaintenances] = useState<EquipmentMaintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Dialog states
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [isUsageDialogOpen, setIsUsageDialogOpen] = useState(false);
  const [isMaintenanceDialogOpen, setIsMaintenanceDialogOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Form states
  const [itemForm, setItemForm] = useState({
    name: "",
    description: "",
    type: "supply",
    sku: "",
    unit: "pcs",
    current_stock: 0,
    min_stock_level: 0,
    unit_price: 0,
    supplier: "",
    location: "",
    category_id: "",
  });

  const [purchaseForm, setPurchaseForm] = useState({
    item_id: "",
    quantity: 0,
    unit_cost: 0,
    supplier: "",
    invoice_number: "",
    purchase_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  const [usageForm, setUsageForm] = useState({
    item_id: "",
    quantity: 0,
    usage_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });

  const [maintenanceForm, setMaintenanceForm] = useState({
    item_id: "",
    maintenance_type: "",
    scheduled_date: format(new Date(), "yyyy-MM-dd"),
    cost: 0,
    vendor: "",
    notes: "",
    status: "scheduled",
  });

  const [categoryForm, setCategoryForm] = useState({
    name: "",
    type: "supply",
    description: "",
  });

  const fetchData = async () => {
    try {
      const [itemsRes, categoriesRes, purchasesRes, usagesRes, maintenancesRes] = await Promise.all([
        supabase.from("inventory_items").select("*").order("name"),
        supabase.from("inventory_categories").select("*").order("name"),
        supabase.from("inventory_purchases").select("*").order("purchase_date", { ascending: false }).limit(100),
        supabase.from("inventory_usage").select("*").order("usage_date", { ascending: false }).limit(100),
        supabase.from("equipment_maintenance").select("*").order("scheduled_date", { ascending: false }),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (purchasesRes.error) throw purchasesRes.error;
      if (usagesRes.error) throw usagesRes.error;
      if (maintenancesRes.error) throw maintenancesRes.error;

      // Map categories to items
      const categoryMap = new Map(categoriesRes.data?.map(c => [c.id, c]) || []);
      const itemsWithCategories = (itemsRes.data || []).map(item => ({
        ...item,
        category: item.category_id ? categoryMap.get(item.category_id) : undefined,
      }));

      // Map items to purchases, usages, maintenances
      const itemMap = new Map(itemsWithCategories.map(i => [i.id, i]));
      const purchasesWithItems = (purchasesRes.data || []).map(p => ({
        ...p,
        item: itemMap.get(p.item_id),
      }));
      const usagesWithItems = (usagesRes.data || []).map(u => ({
        ...u,
        item: itemMap.get(u.item_id),
      }));
      const maintenancesWithItems = (maintenancesRes.data || []).map(m => ({
        ...m,
        item: itemMap.get(m.item_id),
      }));

      setItems(itemsWithCategories);
      setCategories(categoriesRes.data || []);
      setPurchases(purchasesWithItems);
      setUsages(usagesWithItems);
      setMaintenances(maintenancesWithItems);
    } catch (error) {
      console.error("Error fetching inventory data:", error);
      toast.error("Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.supplier?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [items, searchQuery, typeFilter]);

  const lowStockItems = useMemo(() => {
    return items.filter(item => item.current_stock <= item.min_stock_level && item.is_active);
  }, [items]);

  const equipmentItems = useMemo(() => {
    return items.filter(item => item.type === "equipment");
  }, [items]);

  // Stats
  const totalItems = items.length;
  const totalValue = items.reduce((sum, item) => sum + (item.current_stock * item.unit_price), 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + p.total_cost, 0);
  const totalUsageCost = usages.reduce((sum, u) => sum + (u.total_cost || 0), 0);

  // Handlers
  const handleItemSubmit = async () => {
    try {
      if (editingItem) {
        const { error } = await supabase
          .from("inventory_items")
          .update({
            ...itemForm,
            category_id: itemForm.category_id || null,
          })
          .eq("id", editingItem.id);
        if (error) throw error;
        toast.success("Item updated successfully");
      } else {
        const { error } = await supabase
          .from("inventory_items")
          .insert({
            ...itemForm,
            category_id: itemForm.category_id || null,
          });
        if (error) throw error;
        toast.success("Item added successfully");
      }
      setIsItemDialogOpen(false);
      setEditingItem(null);
      resetItemForm();
      fetchData();
    } catch (error) {
      console.error("Error saving item:", error);
      toast.error("Failed to save item");
    }
  };

  const handlePurchaseSubmit = async () => {
    try {
      const total_cost = purchaseForm.quantity * purchaseForm.unit_cost;
      const { error } = await supabase.from("inventory_purchases").insert({
        ...purchaseForm,
        total_cost,
        purchased_by: user?.id,
      });
      if (error) throw error;

      // Update stock
      const item = items.find(i => i.id === purchaseForm.item_id);
      if (item) {
        await supabase
          .from("inventory_items")
          .update({ current_stock: item.current_stock + purchaseForm.quantity })
          .eq("id", purchaseForm.item_id);
      }

      toast.success("Purchase recorded successfully");
      setIsPurchaseDialogOpen(false);
      resetPurchaseForm();
      fetchData();
    } catch (error) {
      console.error("Error recording purchase:", error);
      toast.error("Failed to record purchase");
    }
  };

  const handleUsageSubmit = async () => {
    try {
      const item = items.find(i => i.id === usageForm.item_id);
      if (!item) {
        toast.error("Item not found");
        return;
      }

      if (usageForm.quantity > item.current_stock) {
        toast.error("Insufficient stock");
        return;
      }

      const total_cost = usageForm.quantity * item.unit_price;
      const { error } = await supabase.from("inventory_usage").insert({
        ...usageForm,
        unit_cost: item.unit_price,
        total_cost,
        recorded_by: user?.id,
      });
      if (error) throw error;

      // Update stock
      await supabase
        .from("inventory_items")
        .update({ current_stock: item.current_stock - usageForm.quantity })
        .eq("id", usageForm.item_id);

      toast.success("Usage recorded successfully");
      setIsUsageDialogOpen(false);
      resetUsageForm();
      fetchData();
    } catch (error) {
      console.error("Error recording usage:", error);
      toast.error("Failed to record usage");
    }
  };

  const handleMaintenanceSubmit = async () => {
    try {
      const { error } = await supabase.from("equipment_maintenance").insert({
        ...maintenanceForm,
        cost: maintenanceForm.cost || null,
        performed_by: user?.id,
      });
      if (error) throw error;
      toast.success("Maintenance scheduled successfully");
      setIsMaintenanceDialogOpen(false);
      resetMaintenanceForm();
      fetchData();
    } catch (error) {
      console.error("Error scheduling maintenance:", error);
      toast.error("Failed to schedule maintenance");
    }
  };

  const handleCategorySubmit = async () => {
    try {
      const { error } = await supabase.from("inventory_categories").insert(categoryForm);
      if (error) throw error;
      toast.success("Category added successfully");
      setIsCategoryDialogOpen(false);
      resetCategoryForm();
      fetchData();
    } catch (error) {
      console.error("Error adding category:", error);
      toast.error("Failed to add category");
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id);
      if (error) throw error;
      toast.success("Item deleted successfully");
      fetchData();
    } catch (error) {
      console.error("Error deleting item:", error);
      toast.error("Failed to delete item");
    }
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description || "",
      type: item.type,
      sku: item.sku || "",
      unit: item.unit,
      current_stock: item.current_stock,
      min_stock_level: item.min_stock_level,
      unit_price: item.unit_price,
      supplier: item.supplier || "",
      location: item.location || "",
      category_id: item.category_id || "",
    });
    setIsItemDialogOpen(true);
  };

  const resetItemForm = () => {
    setItemForm({
      name: "",
      description: "",
      type: "supply",
      sku: "",
      unit: "pcs",
      current_stock: 0,
      min_stock_level: 0,
      unit_price: 0,
      supplier: "",
      location: "",
      category_id: "",
    });
  };

  const resetPurchaseForm = () => {
    setPurchaseForm({
      item_id: "",
      quantity: 0,
      unit_cost: 0,
      supplier: "",
      invoice_number: "",
      purchase_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
  };

  const resetUsageForm = () => {
    setUsageForm({
      item_id: "",
      quantity: 0,
      usage_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
  };

  const resetMaintenanceForm = () => {
    setMaintenanceForm({
      item_id: "",
      maintenance_type: "",
      scheduled_date: format(new Date(), "yyyy-MM-dd"),
      cost: 0,
      vendor: "",
      notes: "",
      status: "scheduled",
    });
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      name: "",
      type: "supply",
      description: "",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "scheduled":
        return <Badge className="bg-blue-100 text-blue-700">Scheduled</Badge>;
      case "in_progress":
        return <Badge className="bg-yellow-100 text-yellow-700">In Progress</Badge>;
      case "completed":
        return <Badge className="bg-green-100 text-green-700">Completed</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-100 text-gray-700">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading inventory...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">{totalItems}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Stock Value</p>
                <p className="text-2xl font-bold">₹{totalValue.toLocaleString()}</p>
              </div>
              <IndianRupee className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Low Stock Items</p>
                <p className="text-2xl font-bold">{lowStockItems.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Purchases</p>
                <p className="text-2xl font-bold">₹{totalPurchases.toLocaleString()}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Low Stock Alert
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map(item => (
                <Badge key={item.id} variant="outline" className="border-amber-500 text-amber-700">
                  {item.name}: {item.current_stock} {item.unit}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <TabsList>
            <TabsTrigger value="items" className="gap-2">
              <Box className="h-4 w-4" />
              Items
            </TabsTrigger>
            <TabsTrigger value="purchases" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Purchases
            </TabsTrigger>
            <TabsTrigger value="usage" className="gap-2">
              <TrendingDown className="h-4 w-4" />
              Usage
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-2">
              <Wrench className="h-4 w-4" />
              Maintenance
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsCategoryDialogOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Categories
            </Button>
            {activeTab === "items" && (
              <Button size="sm" onClick={() => { resetItemForm(); setEditingItem(null); setIsItemDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            )}
            {activeTab === "purchases" && (
              <Button size="sm" onClick={() => { resetPurchaseForm(); setIsPurchaseDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Record Purchase
              </Button>
            )}
            {activeTab === "usage" && (
              <Button size="sm" onClick={() => { resetUsageForm(); setIsUsageDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Record Usage
              </Button>
            )}
            {activeTab === "maintenance" && (
              <Button size="sm" onClick={() => { resetMaintenanceForm(); setIsMaintenanceDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Schedule Maintenance
              </Button>
            )}
          </div>
        </div>

        {/* Items Tab */}
        <TabsContent value="items">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="supply">Supplies</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Stock</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{item.type}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.category?.name || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={item.current_stock <= item.min_stock_level ? "text-red-600 font-semibold" : ""}>
                          {item.current_stock} {item.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">₹{item.unit_price.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{item.supplier || "-"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditItem(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteItem(item.id)} className="text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No items found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchases Tab */}
        <TabsContent value="purchases">
          <Card>
            <CardHeader>
              <CardTitle>Purchase History</CardTitle>
              <CardDescription>Track all inventory purchases from vendors</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Invoice #</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell>{format(new Date(purchase.purchase_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-medium">{purchase.item?.name || "-"}</TableCell>
                      <TableCell className="text-center">{purchase.quantity}</TableCell>
                      <TableCell className="text-right">₹{purchase.unit_cost.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">₹{purchase.total_cost.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{purchase.supplier || "-"}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{purchase.invoice_number || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {purchases.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No purchases recorded
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle>Usage History</CardTitle>
              <CardDescription>Track inventory consumption and costs</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-center">Quantity</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total Cost</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usages.map((usage) => (
                    <TableRow key={usage.id}>
                      <TableCell>{format(new Date(usage.usage_date), "dd MMM yyyy")}</TableCell>
                      <TableCell className="font-medium">{usage.item?.name || "-"}</TableCell>
                      <TableCell className="text-center">{usage.quantity}</TableCell>
                      <TableCell className="text-right">₹{(usage.unit_cost || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-semibold">₹{(usage.total_cost || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground">{usage.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {usages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No usage recorded
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Maintenance Tab */}
        <TabsContent value="maintenance">
          <Card>
            <CardHeader>
              <CardTitle>Equipment Maintenance</CardTitle>
              <CardDescription>Schedule and track equipment maintenance</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Equipment</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Scheduled Date</TableHead>
                    <TableHead>Completed Date</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Vendor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenances.map((maintenance) => (
                    <TableRow key={maintenance.id}>
                      <TableCell className="font-medium">{maintenance.item?.name || "-"}</TableCell>
                      <TableCell>{maintenance.maintenance_type}</TableCell>
                      <TableCell>{maintenance.scheduled_date ? format(new Date(maintenance.scheduled_date), "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell>{maintenance.completed_date ? format(new Date(maintenance.completed_date), "dd MMM yyyy") : "-"}</TableCell>
                      <TableCell className="text-center">{getStatusBadge(maintenance.status)}</TableCell>
                      <TableCell className="text-right">{maintenance.cost ? `₹${maintenance.cost.toLocaleString()}` : "-"}</TableCell>
                      <TableCell className="text-muted-foreground">{maintenance.vendor || "-"}</TableCell>
                    </TableRow>
                  ))}
                  {maintenances.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No maintenance records
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Item Dialog */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={itemForm.name}
                  onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                  placeholder="Item name"
                />
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={itemForm.type} onValueChange={(v) => setItemForm({ ...itemForm, type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="supply">Supply</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={itemForm.sku}
                  onChange={(e) => setItemForm({ ...itemForm, sku: e.target.value })}
                  placeholder="SKU code"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={itemForm.category_id} onValueChange={(v) => setItemForm({ ...itemForm, category_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c.type === itemForm.type).map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input
                  value={itemForm.unit}
                  onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
                  placeholder="pcs, ml, etc"
                />
              </div>
              <div className="space-y-2">
                <Label>Current Stock</Label>
                <Input
                  type="number"
                  value={itemForm.current_stock}
                  onChange={(e) => setItemForm({ ...itemForm, current_stock: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Min Stock Level</Label>
                <Input
                  type="number"
                  value={itemForm.min_stock_level}
                  onChange={(e) => setItemForm({ ...itemForm, min_stock_level: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unit Price (₹)</Label>
                <Input
                  type="number"
                  value={itemForm.unit_price}
                  onChange={(e) => setItemForm({ ...itemForm, unit_price: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input
                  value={itemForm.supplier}
                  onChange={(e) => setItemForm({ ...itemForm, supplier: e.target.value })}
                  placeholder="Supplier name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={itemForm.location}
                onChange={(e) => setItemForm({ ...itemForm, location: e.target.value })}
                placeholder="Storage location"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="Item description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleItemSubmit}>{editingItem ? "Update" : "Add"} Item</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase Dialog */}
      <Dialog open={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Purchase</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={purchaseForm.item_id} onValueChange={(v) => setPurchaseForm({ ...purchaseForm, item_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={purchaseForm.quantity}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Cost (₹) *</Label>
                <Input
                  type="number"
                  value={purchaseForm.unit_cost}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, unit_cost: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input
                  value={purchaseForm.supplier}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Invoice Number</Label>
                <Input
                  value={purchaseForm.invoice_number}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, invoice_number: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Purchase Date *</Label>
              <Input
                type="date"
                value={purchaseForm.purchase_date}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={purchaseForm.notes}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
              />
            </div>
            {purchaseForm.quantity > 0 && purchaseForm.unit_cost > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-xl font-bold">₹{(purchaseForm.quantity * purchaseForm.unit_cost).toLocaleString()}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPurchaseDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePurchaseSubmit}>Record Purchase</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage Dialog */}
      <Dialog open={isUsageDialogOpen} onOpenChange={setIsUsageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Usage</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Item *</Label>
              <Select value={usageForm.item_id} onValueChange={(v) => setUsageForm({ ...usageForm, item_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} (Stock: {item.current_stock} {item.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  value={usageForm.quantity}
                  onChange={(e) => setUsageForm({ ...usageForm, quantity: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Usage Date *</Label>
                <Input
                  type="date"
                  value={usageForm.usage_date}
                  onChange={(e) => setUsageForm({ ...usageForm, usage_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={usageForm.notes}
                onChange={(e) => setUsageForm({ ...usageForm, notes: e.target.value })}
                placeholder="e.g., Used for patient test, routine check, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUsageDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUsageSubmit}>Record Usage</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Maintenance Dialog */}
      <Dialog open={isMaintenanceDialogOpen} onOpenChange={setIsMaintenanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Maintenance</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Equipment *</Label>
              <Select value={maintenanceForm.item_id} onValueChange={(v) => setMaintenanceForm({ ...maintenanceForm, item_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select equipment" />
                </SelectTrigger>
                <SelectContent>
                  {equipmentItems.map(item => (
                    <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Maintenance Type *</Label>
                <Input
                  value={maintenanceForm.maintenance_type}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, maintenance_type: e.target.value })}
                  placeholder="e.g., Calibration, Service"
                />
              </div>
              <div className="space-y-2">
                <Label>Scheduled Date *</Label>
                <Input
                  type="date"
                  value={maintenanceForm.scheduled_date}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, scheduled_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estimated Cost (₹)</Label>
                <Input
                  type="number"
                  value={maintenanceForm.cost}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input
                  value={maintenanceForm.vendor}
                  onChange={(e) => setMaintenanceForm({ ...maintenanceForm, vendor: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={maintenanceForm.notes}
                onChange={(e) => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMaintenanceDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMaintenanceSubmit}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Category Name *</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="Category name"
              />
            </div>
            <div className="space-y-2">
              <Label>Type *</Label>
              <Select value={categoryForm.type} onValueChange={(v) => setCategoryForm({ ...categoryForm, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supply">Supply</SelectItem>
                  <SelectItem value="equipment">Equipment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCategorySubmit}>Add Category</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ManageInventory;
