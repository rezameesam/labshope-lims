import { Edit, Trash2, ShoppingCart, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DataPagination } from "@/components/ui/data-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAppDate } from "@/lib/date";

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

interface InventoryTableProps {
  pagedItems: InventoryItem[];
  filteredItems: InventoryItem[];
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onEditItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
}

interface PurchasesTableProps {
  purchases: InventoryPurchase[];
}

interface UsageTableProps {
  usages: InventoryUsage[];
}

interface MaintenanceTableProps {
  maintenances: EquipmentMaintenance[];
  getStatusBadge: (status: string) => React.ReactNode;
}

interface AlertsTableProps {
  items: InventoryItem[];
  onReorder: (item: InventoryItem) => void;
}

export const InventoryItemsTable = ({
  pagedItems,
  filteredItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onEditItem,
  onDeleteItem,
}: InventoryTableProps) => {
  return (
    <CardContent>
      <div className="overflow-x-auto">
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
            {pagedItems.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{item.name}</p>
                    {item.sku && <p className="text-xs text-muted-foreground">Barcode: {item.sku}</p>}
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
                    <Button variant="ghost" size="sm" onClick={() => onEditItem(item)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDeleteItem(item.id)} className="text-red-600">
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
      </div>
      <DataPagination
        total={filteredItems.length}
        page={currentPage}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </CardContent>
  );
};

export const PurchasesTable = ({ purchases }: PurchasesTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Purchase History</CardTitle>
        <CardDescription>Track all inventory purchases from vendors</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
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
                  <TableCell>{formatAppDate(purchase.purchase_date)}</TableCell>
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
        </div>
      </CardContent>
    </Card>
  );
};

export const UsageTable = ({ usages }: UsageTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage History</CardTitle>
        <CardDescription>Track inventory consumption and costs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
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
                  <TableCell>{formatAppDate(usage.usage_date)}</TableCell>
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
        </div>
      </CardContent>
    </Card>
  );
};

export const MaintenanceTable = ({ maintenances, getStatusBadge }: MaintenanceTableProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipment Maintenance</CardTitle>
        <CardDescription>Schedule and track equipment maintenance</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
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
                  <TableCell>{maintenance.scheduled_date ? formatAppDate(maintenance.scheduled_date) : "-"}</TableCell>
                  <TableCell>{maintenance.completed_date ? formatAppDate(maintenance.completed_date) : "-"}</TableCell>
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
        </div>
      </CardContent>
    </Card>
  );
};

export const AlertsTable = ({ items, onReorder }: AlertsTableProps) => {
  const alertItems = items
    .filter(item => (item.current_stock || 0) <= (item.min_stock_level || 0) && item.is_active)
    .sort((a, b) => {
      const aDeficit = (a.min_stock_level || 0) - (a.current_stock || 0);
      const bDeficit = (b.min_stock_level || 0) - (b.current_stock || 0);
      return bDeficit - aDeficit;
    });

  return (
    <div className="space-y-4">
      {/* Low Stock Alerts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Low Stock Alerts
              </CardTitle>
              <CardDescription>Items below minimum stock level</CardDescription>
            </div>
            <Badge variant="destructive">
              {alertItems.length} items
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {alertItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>All items are well stocked!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Current Stock</TableHead>
                    <TableHead className="text-right">Min Level</TableHead>
                    <TableHead className="text-right">Deficit</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alertItems.map((item) => {
                    const deficit = (item.min_stock_level || 0) - (item.current_stock || 0);
                    const isOutOfStock = (item.current_stock || 0) === 0;
                    return (
                      <TableRow key={item.id} className={isOutOfStock ? "bg-red-50 dark:bg-red-950/20" : "bg-amber-50 dark:bg-amber-950/20"}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isOutOfStock && <AlertTriangle className="h-4 w-4 text-red-500" />}
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.category ? (
                            <Badge variant="outline">{item.category.name}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={isOutOfStock ? "font-bold text-red-600" : "font-medium text-amber-600"}>
                            {item.current_stock || 0} {item.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.min_stock_level || 0} {item.unit}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={isOutOfStock ? "destructive" : "outline"} className="font-semibold">
                            {deficit} {item.unit}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.supplier || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onReorder(item)}
                          >
                            <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                            Reorder
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stock Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">
                  {items.filter(item => (item.current_stock || 0) === 0 && item.is_active).length}
                </p>
                <p className="text-xs text-muted-foreground">Out of Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">
                  {items.filter(item => (item.current_stock || 0) > 0 && (item.current_stock || 0) <= (item.min_stock_level || 0) && item.is_active).length}
                </p>
                <p className="text-xs text-muted-foreground">Low Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <AlertTriangle className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {items.filter(item => (item.current_stock || 0) > (item.min_stock_level || 0) && item.is_active).length}
                </p>
                <p className="text-xs text-muted-foreground">Well Stocked</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
