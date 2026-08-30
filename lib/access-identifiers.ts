export const ACCESS_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_ACCESS_EMAIL_DOMAIN || "access.gaboneducplus.app";

export const ACCESS_ROLE_REDIRECTS: Record<string, string> = {
  super_admin: "/gabon-educ/service-abonnements",
  school_admin: "/gabon-educ/administration",
  headmaster: "/gabon-educ/administration",
  academic_director: "/gabon-educ/pedagogie",
  // Le secrétariat a son propre bureau : une liste de ce qui reste à traiter,
  // et non le tableau de pilotage destiné à la direction.
  secretary: "/gabon-educ/secretariat",
  supervisor: "/gabon-educ/assiduite",
  teacher: "/gabon-educ/tableau-de-bord",
  head_teacher: "/gabon-educ/tableau-de-bord",
  guardian: "/gabon-educ/espace-parent",
  parent: "/gabon-educ/espace-parent",
  student: "/gabon-educ/espace-eleve",
};

export function normalizeAccessIdentifier(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 64);
}

export function isEmailLogin(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function buildAccessEmail(identifier: string) {
  const normalized = normalizeAccessIdentifier(identifier);
  return normalized ? `${normalized}@${ACCESS_EMAIL_DOMAIN}` : "";
}

export function suggestAccessIdentifier(firstName: string, lastName: string, suffix = "") {
  const base = normalizeAccessIdentifier(`${firstName}.${lastName}`);
  const extra = normalizeAccessIdentifier(suffix);
  return [base, extra].filter(Boolean).join("-").slice(0, 64);
}

export function roleRedirect(role: string | null | undefined, fallback: string) {
  if (!role) return fallback;
  return ACCESS_ROLE_REDIRECTS[role] || fallback;
}
