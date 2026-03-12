import * as React from "react";

import { formatDateInputDisplay, parseDateInputValue } from "@/lib/date";

import { Input } from "./input";

type DateInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, min, max, placeholder = "dd/mm/yyyy", inputMode = "numeric", ...props }, ref) => {
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
