export const PATIENT_PASSWORD_MIN_LENGTH = 10;

export type PasswordCheck = {
  key: string;
  label: string;
  passed: boolean;
};

export const getPatientPasswordChecks = (password: string): PasswordCheck[] => {
  const value = password || "";

  return [
    {
      key: "length",
      label: `At least ${PATIENT_PASSWORD_MIN_LENGTH} characters`,
      passed: value.length >= PATIENT_PASSWORD_MIN_LENGTH,
    },
    {
      key: "lowercase",
      label: "Contains a lowercase letter",
      passed: /[a-z]/.test(value),
    },
    {
      key: "uppercase",
      label: "Contains an uppercase letter",
      passed: /[A-Z]/.test(value),
    },
    {
      key: "number",
      label: "Contains a number",
      passed: /\d/.test(value),
    },
    {
      key: "symbol",
      label: "Contains a special character",
      passed: /[^A-Za-z0-9]/.test(value),
    },
  ];
};

export const validatePatientPassword = (password: string): string | null => {
  const firstFailed = getPatientPasswordChecks(password).find((check) => !check.passed);
  return firstFailed ? firstFailed.label : null;
};
