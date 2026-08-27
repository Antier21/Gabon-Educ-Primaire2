import type { SchoolRole } from "@/lib/platform/types";
import { matchesRoutePath } from "@/lib/auth/path-matching";

export type RouteAccessRule = {
  prefix: string;
  what: string;
  allow: readonly SchoolRole[];
  superAdminOnly?: boolean;
};

export type RouteAccessDecision =
  | { kind: "public" }
  | { kind: "protected"; rule: RouteAccessRule }
  | { kind: "unknown" };

export const DIRECTION_ROLES = [
  "school_admin",
  "headmaster",
  "academic_director",
] as const satisfies readonly SchoolRole[];

export const SECRETARIAT_ROLES = [
  "secretary",
  "school_admin",
  "headmaster",
] as const satisfies readonly SchoolRole[];

export const COMMUNICATION_ROLES = [
  "school_admin",
  "headmaster",
  "academic_director",
  "secretary",
] as const satisfies readonly SchoolRole[];

export const TEACHING_ROLES = [
  "teacher",
  "head_teacher",
  "school_admin",
  "headmaster",
  "academic_director",
] as const satisfies readonly SchoolRole[];

export const SCHOOL_LIFE_ROLES = [
  "supervisor",
  "school_admin",
  "headmaster",
  "academic_director",
] as const satisfies readonly SchoolRole[];

export const BULLETIN_PRINT_ROLES = [
  "school_admin",
  "headmaster",
  "academic_director",
  "secretary",
] as const satisfies readonly SchoolRole[];

export const NO_ACTIVE_SCHOOL_RETURN_PATH = "/gabon-educ";

export function deniedAccessReturnPath(
  missingActiveSchool: boolean,
  roleHome: string,
): string {
  return missingActiveSchool ? NO_ACTIVE_SCHOOL_RETURN_PATH : roleHome;
}

const PUBLIC_PATHS = [
  "/gabon-educ",
  "/gabon-educ/connexion",
  "/gabon-educ/connexion-administration",
  "/gabon-educ/connexion-eleves",
  "/gabon-educ/connexion-parents",
  "/gabon-educ/connexion-vie-scolaire",
  "/gabon-educ/ouvrir-compte",
  "/gabon-educ/enregistrer-etablissement",
  "/gabon-educ/espaces",
  "/gabon-educ/mot-de-passe-oublie",
  "/gabon-educ/erreur",
] as const;

const rule = (
  prefixes: readonly string[],
  what: string,
  allow: readonly SchoolRole[],
): RouteAccessRule[] => prefixes.map((prefix) => ({ prefix, what, allow }));

/**
 * Matrice d'accès aux écrans. Les RLS restent seules responsables de la
 * protection des données ; cette table empêche seulement d'afficher l'espace
 * d'un autre métier.
 */
export const ROUTE_ACCESS_RULES: readonly RouteAccessRule[] = [
  ...rule(
    [
      "/gabon-educ/administration",
      "/gabon-educ/etablissement",
      "/gabon-educ/utilisateurs",
      "/gabon-educ/creer-enseignant",
      "/gabon-educ/matieres",
      "/gabon-educ/emplois-du-temps",
      "/gabon-educ/notes-bulletins",
      "/gabon-educ/modele-bulletin",
      "/gabon-educ/bulletins-publication",
      "/gabon-educ/journal-audit",
      "/gabon-educ/import-export",
      "/gabon-educ/synchronisation",
      "/gabon-educ/diagnostic",
      "/gabon-educ/modules-a-venir",
      "/gabon-educ/abonnement",
    ],
    "Cet espace d’administration",
    DIRECTION_ROLES,
  ),
  ...rule(
    [
      "/gabon-educ/secretariat",
      "/gabon-educ/eleves",
      "/gabon-educ/parents",
      "/gabon-educ/inscription",
      "/gabon-educ/inscriptions",
      "/gabon-educ/classes",
      "/gabon-educ/personnel",
    ],
    "Cet espace du secrétariat",
    SECRETARIAT_ROLES,
  ),
  ...rule(
    [
      "/gabon-educ/communication",
      "/gabon-educ/annonces",
      "/gabon-educ/notifications",
    ],
    "Cet espace de communication",
    COMMUNICATION_ROLES,
  ),
  ...rule(
    [
      "/gabon-educ/tableau-de-bord",
      "/gabon-educ/mes-classes",
      "/gabon-educ/mes-fiches",
      "/gabon-educ/cahier-de-textes",
      "/gabon-educ/preparer-un-cours",
      "/gabon-educ/generateur-ia",
      "/gabon-educ/programmes-apc",
      "/gabon-educ/evaluations",
      "/gabon-educ/notes",
      "/gabon-educ/bulletins",
      "/gabon-educ/saisie-bulletin",
      "/gabon-educ/parametres",
      "/gabon-educ/modules",
    ],
    "Cet espace pédagogique",
    TEACHING_ROLES,
  ),
  {
    prefix: "/gabon-educ/documents",
    what: "Cet espace documentaire",
    allow: Array.from(new Set([...SECRETARIAT_ROLES, ...TEACHING_ROLES])),
  },
  ...rule(
    ["/gabon-educ/impression-bulletins"],
    "L’impression des bulletins",
    BULLETIN_PRINT_ROLES,
  ),
  ...rule(
    ["/gabon-educ/assiduite"],
    "Cet espace de vie scolaire",
    SCHOOL_LIFE_ROLES,
  ),
  ...rule(
    ["/gabon-educ/espace-parent"],
    "L’espace parent",
    ["guardian"],
  ),
  ...rule(
    ["/gabon-educ/espace-eleve"],
    "L’espace élève",
    ["student"],
  ),
  {
    prefix: "/gabon-educ/service-abonnements",
    what: "Le service des abonnements",
    allow: [],
    superAdminOnly: true,
  },
];

export function isPublicRolePath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path);
}

export function routeAccessDecision(pathname: string): RouteAccessDecision {
  if (isPublicRolePath(pathname)) return { kind: "public" };
  const matched = ROUTE_ACCESS_RULES.find(({ prefix }) =>
    matchesRoutePath(pathname, prefix),
  );
  return matched ? { kind: "protected", rule: matched } : { kind: "unknown" };
}
