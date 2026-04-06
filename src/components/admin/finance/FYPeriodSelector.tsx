import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  getFinancialYear, getRecentFinancialYears, getCurrentQuarter,
  type FinancialYear,
} from "@/lib/date";

interface Props {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
}

const FYPeriodSelector = ({ dateFrom, dateTo, onDateFromChange, onDateToChange }: Props) => {
  const currentFY = getFinancialYear();
  const recentFYs = getRecentFinancialYears(3);
  const currentQ = getCurrentQuarter();

  const applyPeriod = (start: string, end: string) => {
    onDateFromChange(start);
    onDateToChange(end);
  };

  // Check which button is active
  const isActive = (start: string, end: string) => dateFrom === start && dateTo === end;

  return (
    <div className="space-y-3">
      {/* Quick period buttons */}
      <div className="flex flex-wrap gap-1.5">
        {recentFYs.map((fy) => (
          <Button
            key={fy.label}
            variant={isActive(fy.start, fy.end) ? "default" : "outline"}
            size="sm"
            className="text-xs h-7 px-2.5"
            onClick={() => applyPeriod(fy.start, fy.end)}
          >
            FY {fy.label}
          </Button>
        ))}
        <span className="w-px bg-border mx-0.5" />
        <Button
          variant={isActive(currentQ.start, currentQ.end) ? "default" : "outline"}
          size="sm"
          className="text-xs h-7 px-2.5"
          onClick={() => applyPeriod(currentQ.start, currentQ.end)}
        >
          {currentQ.label}
        </Button>
      </div>

      {/* Date pickers */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">From</Label>
          <DatePicker value={dateFrom} onChange={onDateFromChange} className="w-[220px]" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <DatePicker value={dateTo} onChange={onDateToChange} className="w-[220px]" />
        </div>
      </div>

      {/* Current FY indicator */}
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <CalendarIcon className="h-3 w-3" />
        Current Financial Year: <span className="font-medium">FY {currentFY.label}</span> (01/04/{currentFY.start.slice(0, 4)} – 31/03/{currentFY.end.slice(0, 4)})
      </p>
    </div>
  );
};

export default FYPeriodSelector;
