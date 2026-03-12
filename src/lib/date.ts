import { format, isValid, parse, parseISO } from "date-fns";

type DateValue = Date | string | null | undefined;

function parseDateValue(value: DateValue): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  const normalized = value.trim();
  if (!normalized) return null;

  const parsed =
    /^\d{4}-\d{2}-\d{2}$/.test(normalized)
      ? parseISO(`${normalized}T00:00:00`)
      : parseISO(normalized);

  if (isValid(parsed)) {
    return parsed;
  }

  const fallback = new Date(normalized);
  return isValid(fallback) ? fallback : null;
}

export function formatAppDate(value: DateValue, fallback = "-") {
  const parsed = parseDateValue(value);
  return parsed ? format(parsed, "dd/MM/yyyy") : fallback;
}

export function formatAppDateTime(value: DateValue, fallback = "-") {
  const parsed = parseDateValue(value);
  return parsed ? format(parsed, "dd/MM/yyyy, HH:mm") : fallback;
}

export function formatAppDateTimeWithSeconds(value: DateValue, fallback = "-") {
  const parsed = parseDateValue(value);
  return parsed ? format(parsed, "dd/MM/yyyy, HH:mm:ss") : fallback;
}

export function formatAppDateTimeWithMeridiem(value: DateValue, fallback = "-") {
  const parsed = parseDateValue(value);
  return parsed ? format(parsed, "dd/MM/yyyy, hh:mm a") : fallback;
}

export function formatDateInputDisplay(value: string) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatAppDate(value, "");
  }

  const digits = value.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  return [day, month, year].filter(Boolean).join("/");
}

export function parseDateInputValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = parse(trimmed, "dd/MM/yyyy", new Date());
  if (!isValid(parsed) || format(parsed, "dd/MM/yyyy") !== trimmed) {
    return "";
  }

  return format(parsed, "yyyy-MM-dd");
}
