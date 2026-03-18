import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface InventoryCategory {
  id: string;
  name: string;
  type: string;
  description: string | null;
}

interface ItemForm {
  name: string;
  description: string;
  type: string;
  sku: string;
  unit: string;
  current_stock: number;
  min_stock_level: number;
  unit_price: number;
  supplier: string;
  location: string;
  category_id: string;
}

interface InventoryFormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: { id: string } | null;
  itemForm: ItemForm;
  onItemFormChange: (form: ItemForm) => void;
  categories: InventoryCategory[];
  onSubmit: () => void;
}

export const InventoryFormDialog = ({
  isOpen,
  onOpenChange,
  editingItem,
  itemForm,
  onItemFormChange,
  categories,
  onSubmit,
}: InventoryFormDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingItem ? "Edit Item" : "Add New Item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inventory-item-name">Name *</Label>
              <Input
                id="inventory-item-name"
                name="name"
                value={itemForm.name}
                onChange={(e) => onItemFormChange({ ...itemForm, name: e.target.value })}
                placeholder="Item name"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-item-type">Type *</Label>
              <Select name="type" value={itemForm.type} onValueChange={(v) => onItemFormChange({ ...itemForm, type: v })}>
                <SelectTrigger id="inventory-item-type">
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
              <Label htmlFor="inventory-item-sku">Barcode / SKU</Label>
              <Input
                id="inventory-item-sku"
                name="sku"
                value={itemForm.sku}
                onChange={(e) => onItemFormChange({ ...itemForm, sku: e.target.value })}
                placeholder="Scan or enter barcode"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-item-category">Category</Label>
              <Select name="category_id" value={itemForm.category_id} onValueChange={(v) => onItemFormChange({ ...itemForm, category_id: v })}>
                <SelectTrigger id="inventory-item-category">
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
              <Label htmlFor="inventory-item-unit">Unit</Label>
              <Input
                id="inventory-item-unit"
                name="unit"
                value={itemForm.unit}
                onChange={(e) => onItemFormChange({ ...itemForm, unit: e.target.value })}
                placeholder="pcs, ml, etc"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-item-current-stock">Current Stock</Label>
              <Input
                id="inventory-item-current-stock"
                name="current_stock"
                type="number"
                value={itemForm.current_stock}
                onChange={(e) => onItemFormChange({ ...itemForm, current_stock: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-item-min-stock-level">Min Stock Level</Label>
              <Input
                id="inventory-item-min-stock-level"
                name="min_stock_level"
                type="number"
                value={itemForm.min_stock_level}
                onChange={(e) => onItemFormChange({ ...itemForm, min_stock_level: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inventory-item-unit-price">Unit Price (₹)</Label>
              <Input
                id="inventory-item-unit-price"
                name="unit_price"
                type="number"
                value={itemForm.unit_price}
                onChange={(e) => onItemFormChange({ ...itemForm, unit_price: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inventory-item-supplier">Supplier</Label>
              <Input
                id="inventory-item-supplier"
                name="supplier"
                value={itemForm.supplier}
                onChange={(e) => onItemFormChange({ ...itemForm, supplier: e.target.value })}
                placeholder="Supplier name"
                autoComplete="organization"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inventory-item-location">Location</Label>
            <Input
              id="inventory-item-location"
              name="location"
              value={itemForm.location}
              onChange={(e) => onItemFormChange({ ...itemForm, location: e.target.value })}
              placeholder="Storage location"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inventory-item-description">Description</Label>
            <Textarea
              id="inventory-item-description"
              name="description"
              value={itemForm.description}
              onChange={(e) => onItemFormChange({ ...itemForm, description: e.target.value })}
              placeholder="Item description"
              autoComplete="off"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit}>{editingItem ? "Update" : "Add"} Item</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
