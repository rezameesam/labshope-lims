import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";

interface ResultsFilterProps {
  startDate: string;
  endDate: string;
  searchQuery: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onSearchQueryChange: (query: string) => void;
  onClearDates: () => void;
}

export function ResultsFilter({
  startDate,
  endDate,
  searchQuery,
  onStartDateChange,
  onEndDateChange,
  onSearchQueryChange,
  onClearDates,
}: ResultsFilterProps) {
  return (
    <div className="mb-4 space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by test name..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">From Date</Label>
          <DateInput value={startDate} onChange={onStartDateChange} className="w-full sm:w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To Date</Label>
          <DateInput value={endDate} onChange={onEndDateChange} className="w-full sm:w-40" />
        </div>
        {(startDate || endDate) && (
          <Button variant="ghost" size="sm" onClick={onClearDates} className="w-full sm:w-auto">
            Clear Dates
          </Button>
        )}
      </div>
    </div>
  );
}
