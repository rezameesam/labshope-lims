import { Search, FileSpreadsheet, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface EmployeeFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  filterStatus: "all" | "active" | "inactive";
  onFilterStatusChange: (value: "all" | "active" | "inactive") => void;
  filterRole: "all" | "admin" | "employee" | "collector";
  onFilterRoleChange: (value: "all" | "admin" | "employee" | "collector") => void;
  onExport: () => void;
  onAddClick: () => void;
  addDisabled?: boolean;
  addDisabledReason?: string;
}

const EmployeeFilters = ({
  search,
  onSearchChange,
  filterStatus,
  onFilterStatusChange,
  filterRole,
  onFilterRoleChange,
  onExport,
  onAddClick,
  addDisabled = false,
  addDisabledReason,
}: EmployeeFiltersProps) => {
  return (
    <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
      <div className="flex flex-col sm:flex-row gap-4 flex-1">
        <div className="relative max-w-sm">
          <Label htmlFor="employee-search" className="sr-only">
            Search employees
          </Label>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="employee-search"
            name="employee_search"
            placeholder="Search by name, email, or ID..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 w-full sm:w-80"
            autoComplete="off"
          />
        </div>
        <Tabs value={filterStatus} onValueChange={(v) => onFilterStatusChange(v as any)} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="inactive">Inactive</TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={filterRole} onValueChange={(v) => onFilterRoleChange(v as any)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admins</SelectItem>
            <SelectItem value="employee">Employees</SelectItem>
            <SelectItem value="collector">Collectors</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onExport}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export
        </Button>
        <Button
          onClick={onAddClick}
          className="bg-clinical-navy hover:bg-clinical-navy/90"
          disabled={addDisabled}
          title={addDisabledReason}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Employee
        </Button>
      </div>
      {addDisabledReason ? (
        <p className="w-full text-sm text-amber-700">{addDisabledReason}</p>
      ) : null}
    </div>
  );
};

export default EmployeeFilters;
