import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Lab {
  id: string;
  name: string;
  lab_code: string;
}

interface CollectionCenter {
  id: string;
  name: string;
  code: string;
  lab_id: string;
}

interface TestFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: "all" | "pending" | "in_progress" | "completed";
  labFilter: string;
  onLabFilterChange: (value: string) => void;
  collectionCenterFilter: string;
  onCollectionCenterFilterChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  labs: Lab[];
  collectionCenters: CollectionCenter[];
  onClearFilters: () => void;
}

export const TestFilters = ({
  search,
  onSearchChange,
  statusFilter,
  labFilter,
  onLabFilterChange,
  collectionCenterFilter,
  onCollectionCenterFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  labs,
  collectionCenters,
  onClearFilters,
}: TestFiltersProps) => {
  const hasActiveFilters =
    statusFilter !== "all" ||
    labFilter !== "all" ||
    collectionCenterFilter !== "all" ||
    dateFrom ||
    dateTo;

  return (
    <div className="flex flex-wrap gap-3 flex-1">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id="tests_search"
          name="tests_search"
          placeholder="Search by test, patient..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 w-full sm:w-80"
        />
      </div>
      <Select value={labFilter} onValueChange={onLabFilterChange}>
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Filter by Lab" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Labs</SelectItem>
          {labs.map((lab) => (
            <SelectItem key={lab.id} value={lab.id}>
              {lab.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={collectionCenterFilter}
        onValueChange={onCollectionCenterFilterChange}
        disabled={labFilter === "all" || !labFilter}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Filter by Center" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Centers</SelectItem>
          {collectionCenters
            .filter((cc) => labFilter === "all" || cc.lab_id === labFilter)
            .map((center) => (
              <SelectItem key={center.id} value={center.id}>
                {center.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <div className="flex items-start gap-3">
        <DateInput
          id="tests-date-from"
          value={dateFrom}
          onChange={onDateFromChange}
          placeholder="From date"
          className="w-[150px]"
          showFormatHint
        />
        <DateInput
          id="tests-date-to"
          value={dateTo}
          onChange={onDateToChange}
          placeholder="To date"
          className="w-[150px]"
          showFormatHint
        />
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="text-muted-foreground"
          >
            Clear filters ×
          </Button>
        )}
      </div>
    </div>
  );
};
