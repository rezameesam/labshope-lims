import * as React from "react";
import { CalendarIcon } from "lucide-react";
import { isValid } from "date-fns";

import { cn } from "@/lib/utils";
import { formatDateInputDisplay, parseDateInputValue, formatAppDate } from "@/lib/date";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Input } from "./input";

interface DatePickerProps {
  /** Stored value in yyyy-MM-dd format */
  value: string;
  /** Called with yyyy-MM-dd string or "" */
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Show month/year dropdown selectors (useful for DOB pickers) */
  captionLayout?: "buttons" | "dropdown" | "dropdown-buttons";
  /** Earliest selectable year (required when captionLayout includes dropdown) */
  fromYear?: number;
  /** Latest selectable year (required when captionLayout includes dropdown) */
  toYear?: number;
  /** Disable dates after this date (e.g. new Date() for no-future) */
  toDate?: Date;
  /** Disable dates before this date */
  fromDate?: Date;
}

const CURRENT_YEAR = new Date().getFullYear();

const DatePicker = ({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  className,
  disabled,
  captionLayout = "dropdown-buttons",
  fromYear = 1920,
  toYear = CURRENT_YEAR + 5,
  toDate,
  fromDate,
}: DatePickerProps) => {
  const [open, setOpen] = React.useState(false);
  const [displayValue, setDisplayValue] = React.useState(() => formatDateInputDisplay(value));

  React.useEffect(() => {
    setDisplayValue(formatDateInputDisplay(value));
  }, [value]);

  // Convert yyyy-MM-dd to Date for calendar
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const d = new Date(value + "T00:00:00");
    return isValid(d) ? d : undefined;
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = formatDateInputDisplay(e.target.value);
    setDisplayValue(next);
    const parsed = parseDateInputValue(next);
    if (!next) { onChange(""); return; }
    if (parsed) onChange(parsed);
  };

  const handleBlur = () => {
    const parsed = parseDateInputValue(displayValue);
    setDisplayValue(parsed ? formatDateInputDisplay(parsed) : formatDateInputDisplay(value));
  };

  const handleCalendarSelect = (day: Date | undefined) => {
    if (!day) { onChange(""); setOpen(false); return; }
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const d = String(day.getDate()).padStart(2, "0");
    onChange(`${y}-${m}-${d}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative flex gap-1 items-center", className)}>
        <Input
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 pr-9"
        />
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={disabled}
            type="button"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0" align="end">
        {/* Show selected date in dd/mm/yyyy at top of calendar */}
        {selectedDate && (
          <div className="px-3 pt-2 pb-0 text-center">
            <p className="text-xs text-muted-foreground">
              Selected: <span className="font-mono font-medium text-foreground">{formatAppDate(value)}</span>
            </p>
          </div>
        )}
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleCalendarSelect}
          defaultMonth={selectedDate}
          captionLayout={captionLayout}
          fromYear={fromYear}
          toYear={toYear}
          toDate={toDate}
          fromDate={fromDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
};

DatePicker.displayName = "DatePicker";

export { DatePicker };
