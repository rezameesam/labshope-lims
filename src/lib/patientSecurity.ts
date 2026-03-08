export const PATIENT_PASSWORD_MIN_LENGTH = 6;

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
  ];
};

export const validatePatientPassword = (password: string): string | null => {
  const firstFailed = getPatientPasswordChecks(password).find((check) => !check.passed);
  return firstFailed ? firstFailed.label : null;
};
