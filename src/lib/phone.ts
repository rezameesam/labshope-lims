export const DEFAULT_COUNTRY_CODE = "91";

export const PHONE_COUNTRY_OPTIONS = [
  { value: "91", label: "India (+91)" },
  { value: "1", label: "United States (+1)" },
  { value: "44", label: "United Kingdom (+44)" },
  { value: "61", label: "Australia (+61)" },
  { value: "65", label: "Singapore (+65)" },
  { value: "81", label: "Japan (+81)" },
  { value: "971", label: "UAE (+971)" },
];

const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

const onlyDigits = (value: string): string => (value || "").replace(/[^\d]/g, "");

const isValidLength = (digits: string): boolean =>
  digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;

export const normalizeCountryCode = (
  value: string | null | undefined,
  fallback: string = DEFAULT_COUNTRY_CODE
): string => {
  const normalized = onlyDigits(value || "");
  return normalized || fallback;
};

export const normalizeNationalNumber = (value: string | null | undefined): string => {
  const digits = onlyDigits(value || "");
  return digits.replace(/^0+/, "");
};

export const buildStoragePhoneNumber = (
  countryCode: string | null | undefined,
  nationalNumber: string | null | undefined
): string | null => {
  const cc = normalizeCountryCode(countryCode);
  const local = normalizeNationalNumber(nationalNumber);
  if (!cc || !local) {
    return null;
  }

  const combined = `${cc}${local}`;
  if (!isValidLength(combined)) {
    return null;
  }

  return `+${combined}`;
};

export const normalizePhoneNumber = (
  value: string | null | undefined,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): string | null => {
  const raw = (value || "").trim();
  if (!raw) {
    return null;
  }

  const normalizedCountryCode = normalizeCountryCode(defaultCountryCode);

  if (raw.startsWith("+")) {
    const digits = onlyDigits(raw);
    return isValidLength(digits) ? `+${digits}` : null;
  }

  if (raw.startsWith("00")) {
    const digits = onlyDigits(raw.slice(2));
    return isValidLength(digits) ? `+${digits}` : null;
  }

  const digits = onlyDigits(raw);
  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `+${normalizedCountryCode}${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return `+${normalizedCountryCode}${digits.slice(1)}`;
  }

  if (digits.startsWith(normalizedCountryCode) && isValidLength(digits)) {
    return `+${digits}`;
  }

  return isValidLength(digits) ? `+${digits}` : null;
};

const pickCountryCode = (digits: string, fallbackCode: string): string => {
  const preferredCodes = PHONE_COUNTRY_OPTIONS.map((option) => option.value).sort(
    (a, b) => b.length - a.length
  );

  for (const code of preferredCodes) {
    if (digits.startsWith(code) && digits.length - code.length >= 6) {
      return code;
    }
  }

  if (digits.startsWith(fallbackCode) && digits.length > fallbackCode.length) {
    return fallbackCode;
  }

  return fallbackCode;
};

export const splitPhoneForForm = (
  value: string | null | undefined,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): { countryCode: string; nationalNumber: string; fullPhone: string | null } => {
  const fallbackCode = normalizeCountryCode(defaultCountryCode);
  const normalized = normalizePhoneNumber(value, fallbackCode);
  if (!normalized) {
    return {
      countryCode: fallbackCode,
      nationalNumber: onlyDigits(value || ""),
      fullPhone: null,
    };
  }

  const digits = normalized.slice(1);
  const countryCode = pickCountryCode(digits, fallbackCode);
  const nationalNumber = digits.startsWith(countryCode)
    ? digits.slice(countryCode.length)
    : digits;

  return { countryCode, nationalNumber, fullPhone: normalized };
};

export const formatPhoneForDisplay = (
  value: string | null | undefined,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): string => {
  const normalized = normalizePhoneNumber(value, defaultCountryCode);
  if (!normalized) {
    return (value || "").trim();
  }

  const { countryCode, nationalNumber } = splitPhoneForForm(normalized, defaultCountryCode);
  return nationalNumber ? `+${countryCode} ${nationalNumber}` : normalized;
};

export const getPhoneLookupVariants = (
  value: string | null | undefined,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE
): string[] => {
  const normalized = normalizePhoneNumber(value, defaultCountryCode);
  if (!normalized) {
    return [];
  }

  const digits = normalized.slice(1);
  const { countryCode, nationalNumber } = splitPhoneForForm(normalized, defaultCountryCode);

  return Array.from(
    new Set(
      [
        normalized,
        digits,
        nationalNumber,
        nationalNumber ? `0${nationalNumber}` : "",
        countryCode && nationalNumber ? `+${countryCode}-${nationalNumber}` : "",
      ].filter(Boolean)
    )
  );
};
