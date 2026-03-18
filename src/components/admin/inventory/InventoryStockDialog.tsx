import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
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

interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  current_stock: number;
  unit_price: number;
  supplier: string | null;
}

interface PurchaseForm {
  item_id: string;
  quantity: number;
  unit_cost: number;
  supplier: string;
  invoice_number: string;
  purchase_date: string;
  notes: string;
}

interface UsageForm {
  item_id: string;
  quantity: number;
  usage_date: string;
  notes: string;
}

interface MaintenanceForm {
  item_id: string;
  maintenance_type: string;
  scheduled_date: string;
  cost: number;
  vendor: string;
  notes: string;
  status: string;
}

interface CategoryForm {
  name: string;
  type: string;
  description: string;
}

// Purchase Dialog
interface PurchaseDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseForm: PurchaseForm;
  onPurchaseFormChange: (form: PurchaseForm) => void;
  purchaseBarcode: string;
  onPurchaseBarcodeChange: (value: string) => void;
  purchaseBarcodeStatus: { type: "idle" | "matched" | "not_found"; message: string };
  onBarcodeLookup: (code: string) => void;
  onOpenNewItemFromBarcode: () => void;
  items: InventoryItem[];
  selectedPurchaseItem: InventoryItem | null;
  onSubmit: () => void;
  purchaseQuantityInputRef: React.RefObject<HTMLInputElement>;
}

export const PurchaseDialog = ({
  isOpen,
  onOpenChange,
  purchaseForm,
  onPurchaseFormChange,
  purchaseBarcode,
  onPurchaseBarcodeChange,
  purchaseBarcodeStatus,
  onBarcodeLookup,
  onOpenNewItemFromBarcode,
  items,
  selectedPurchaseItem,
  onSubmit,
  purchaseQuantityInputRef,
}: PurchaseDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Purchase</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Scan Barcode / SKU</Label>
            <div className="flex gap-2">
              <Input
                value={purchaseBarcode}
                onChange={(e) => {
                  onPurchaseBarcodeChange(e.target.value);
                  onPurchaseFormChange({ ...purchaseForm, item_id: "" });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onBarcodeLookup(purchaseBarcode);
                  }
                }}
                onBlur={() => {
                  if (purchaseBarcode.trim()) {
                    onBarcodeLookup(purchaseBarcode);
                  }
                }}
                placeholder="Scan barcode here"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => onBarcodeLookup(purchaseBarcode)}
              >
                Find Item
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Most USB barcode scanners type into this field and press Enter automatically.
            </p>
            {purchaseBarcodeStatus.type !== "idle" && (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  purchaseBarcodeStatus.type === "matched"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span>{purchaseBarcodeStatus.message}</span>
                  {purchaseBarcodeStatus.type === "not_found" && purchaseBarcode.trim() && (
                    <Button type="button" variant="outline" size="sm" onClick={onOpenNewItemFromBarcode}>
                      Add Item
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Item *</Label>
            <Select value={purchaseForm.item_id} onValueChange={(v) => onPurchaseFormChange({ ...purchaseForm, item_id: v })}>
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
          {selectedPurchaseItem && (
            <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Item</p>
                <p className="font-medium">{selectedPurchaseItem.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Supplier</p>
                <p className="font-medium">{selectedPurchaseItem.supplier || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Current Stock</p>
                <p className="font-medium">
                  {selectedPurchaseItem.current_stock} {selectedPurchaseItem.unit}
                </p>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                ref={purchaseQuantityInputRef}
                type="number"
                value={purchaseForm.quantity}
                onChange={(e) => onPurchaseFormChange({ ...purchaseForm, quantity: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit Cost (₹) *</Label>
              <Input
                type="number"
                value={purchaseForm.unit_cost}
                onChange={(e) => onPurchaseFormChange({ ...purchaseForm, unit_cost: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Input
                value={purchaseForm.supplier}
                onChange={(e) => onPurchaseFormChange({ ...purchaseForm, supplier: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input
                value={purchaseForm.invoice_number}
                onChange={(e) => onPurchaseFormChange({ ...purchaseForm, invoice_number: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Purchase Date *</Label>
            <DateInput
              value={purchaseForm.purchase_date}
              onChange={(value) => onPurchaseFormChange({ ...purchaseForm, purchase_date: value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={purchaseForm.notes}
              onChange={(e) => onPurchaseFormChange({ ...purchaseForm, notes: e.target.value })}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>Record Purchase</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Usage Dialog
interface UsageDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  usageForm: UsageForm;
  onUsageFormChange: (form: UsageForm) => void;
  items: InventoryItem[];
  onSubmit: () => void;
}

export const UsageDialog = ({
  isOpen,
  onOpenChange,
  usageForm,
  onUsageFormChange,
  items,
  onSubmit,
}: UsageDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Usage</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Item *</Label>
            <Select value={usageForm.item_id} onValueChange={(v) => onUsageFormChange({ ...usageForm, item_id: v })}>
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
                onChange={(e) => onUsageFormChange({ ...usageForm, quantity: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Usage Date *</Label>
              <DateInput
                value={usageForm.usage_date}
                onChange={(value) => onUsageFormChange({ ...usageForm, usage_date: value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={usageForm.notes}
              onChange={(e) => onUsageFormChange({ ...usageForm, notes: e.target.value })}
              placeholder="e.g., Used for patient test, routine check, etc."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>Record Usage</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Maintenance Dialog
interface MaintenanceDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  maintenanceForm: MaintenanceForm;
  onMaintenanceFormChange: (form: MaintenanceForm) => void;
  equipmentItems: InventoryItem[];
  onSubmit: () => void;
}

export const MaintenanceDialog = ({
  isOpen,
  onOpenChange,
  maintenanceForm,
  onMaintenanceFormChange,
  equipmentItems,
  onSubmit,
}: MaintenanceDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Maintenance</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Equipment *</Label>
            <Select value={maintenanceForm.item_id} onValueChange={(v) => onMaintenanceFormChange({ ...maintenanceForm, item_id: v })}>
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
                onChange={(e) => onMaintenanceFormChange({ ...maintenanceForm, maintenance_type: e.target.value })}
                placeholder="e.g., Calibration, Service"
              />
            </div>
            <div className="space-y-2">
              <Label>Scheduled Date *</Label>
              <DateInput
                value={maintenanceForm.scheduled_date}
                onChange={(value) => onMaintenanceFormChange({ ...maintenanceForm, scheduled_date: value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Estimated Cost (₹)</Label>
              <Input
                type="number"
                value={maintenanceForm.cost}
                onChange={(e) => onMaintenanceFormChange({ ...maintenanceForm, cost: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Input
                value={maintenanceForm.vendor}
                onChange={(e) => onMaintenanceFormChange({ ...maintenanceForm, vendor: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={maintenanceForm.notes}
              onChange={(e) => onMaintenanceFormChange({ ...maintenanceForm, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Category Dialog
interface CategoryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  categoryForm: CategoryForm;
  onCategoryFormChange: (form: CategoryForm) => void;
  onSubmit: () => void;
}

export const CategoryDialog = ({
  isOpen,
  onOpenChange,
  categoryForm,
  onCategoryFormChange,
  onSubmit,
}: CategoryDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Category</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Category Name *</Label>
            <Input
              value={categoryForm.name}
              onChange={(e) => onCategoryFormChange({ ...categoryForm, name: e.target.value })}
              placeholder="Category name"
            />
          </div>
          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={categoryForm.type} onValueChange={(v) => onCategoryFormChange({ ...categoryForm, type: v })}>
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
              onChange={(e) => onCategoryFormChange({ ...categoryForm, description: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>Add Category</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
