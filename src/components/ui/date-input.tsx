import * as React from "react";

import { formatDateInputDisplay, parseDateInputValue } from "@/lib/date";

import { Input } from "./input";

type DateInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  showFormatHint?: boolean;
};

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, min, max, placeholder = "dd/mm/yyyy", inputMode = "numeric", showFormatHint = false, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => formatDateInputDisplay(value));

    React.useEffect(() => {
      setDisplayValue(formatDateInputDisplay(value));
    }, [value]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextDisplayValue = formatDateInputDisplay(event.target.value);
      setDisplayValue(nextDisplayValue);

      const parsedValue = parseDateInputValue(nextDisplayValue);
      if (!nextDisplayValue) {
        onChange("");
        return;
      }

      if (!parsedValue) {
        onChange("");
        return;
      }

      if ((min && parsedValue < min) || (max && parsedValue > max)) {
        onChange("");
        return;
      }

      onChange(parsedValue);
    };

    const handleBlur = () => {
      const parsedValue = parseDateInputValue(displayValue);
      setDisplayValue(parsedValue ? formatDateInputDisplay(parsedValue) : formatDateInputDisplay(value));
    };

    if (showFormatHint) {
      return (
        <div className="flex flex-col gap-0.5">
          <Input
            {...props}
            ref={ref}
            type="text"
            value={displayValue}
            onChange={handleChange}
            onBlur={handleBlur}
            min={undefined}
            max={undefined}
            placeholder={placeholder}
            inputMode={inputMode}
          />
          <span className="text-[11px] text-muted-foreground leading-none pl-0.5">dd/mm/yyyy</span>
        </div>
      );
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        min={undefined}
        max={undefined}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    );
  },
);

DateInput.displayName = "DateInput";

export { DateInput };
