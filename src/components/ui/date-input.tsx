/**
 * DateInput is now an alias for DatePicker (text input + calendar popover).
 * All existing usages of <DateInput> will automatically get the calendar.
 *
 * Props: value (yyyy-MM-dd), onChange (yyyy-MM-dd), className, placeholder, disabled
 * Extra props like id, name, showFormatHint, autoComplete are accepted but ignored
 * for backwards compatibility.
 */
import * as React from "react";
import { DatePicker } from "./date-picker";

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  // Legacy props — accepted for backwards compat, not used
  id?: string;
  name?: string;
  showFormatHint?: boolean;
  autoComplete?: string;
  inputMode?: string;
  min?: string;
  max?: string;
};

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, className, placeholder, disabled }, _ref) => {
    return (
      <DatePicker
        value={value}
        onChange={onChange}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  },
);

DateInput.displayName = "DateInput";

export { DateInput };
