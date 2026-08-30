export const SCHOOL_REGISTRATION_AUTH_STORAGE_KEY = "gabon-educ-plus:school-registration-authorization";

export type SchoolRegistrationAuthorization = {
  token: string;
  profileKey: string;
  schoolName: string;
  expiresAt: string;
};

export function readSchoolRegistrationAuthorization(): SchoolRegistrationAuthorization | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SCHOOL_REGISTRATION_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SchoolRegistrationAuthorization>;
    if (!parsed.token || !parsed.profileKey || !parsed.schoolName || !parsed.expiresAt) return null;
    return {
      token: parsed.token,
      profileKey: parsed.profileKey,
      schoolName: parsed.schoolName,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function writeSchoolRegistrationAuthorization(value: SchoolRegistrationAuthorization) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SCHOOL_REGISTRATION_AUTH_STORAGE_KEY, JSON.stringify(value));
}

export function clearSchoolRegistrationAuthorization() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SCHOOL_REGISTRATION_AUTH_STORAGE_KEY);
}
