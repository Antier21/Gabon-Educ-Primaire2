import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SchoolRole } from "@/lib/platform/types";
import { FINANCE_MODULE_ROLES } from "@/lib/finance/policy";
import {
  ACADEMIC_DIRECTION_ROLES,
  ADMINISTRATION_ROLES,
  BULLETIN_PRINT_ROLES,
  COMMUNICATION_ROLES,
  DIRECTION_ROLES,
  PARENT_SPACE_ROLES,
  PEDAGOGY_ROLES,
  policyAllowsRole,
  SCHOOL_LIFE_ROLES,
  SECRETARIAT_ROLES,
  SHARED_DOCUMENT_ROLES,
  STUDENT_SPACE_ROLES,
} from "./page-policies";

const app = resolve(process.cwd(), "app/gabon-educ");

function source(route: string) {
  return readFileSync(resolve(app, route, "page.tsx"), "utf8");
}

function expectLocalGuard(routes: readonly string[], policy: string, strict = false) {
  for (const route of routes) {
    const content = source(route);
    expect(content, route).toContain("@/components/RequireRole");
    expect(content, route).toContain(`<RequireRole`);
    expect(content, route).toContain(`allow={${policy}}`);
    expect((content.match(/<RequireRole\b/g) || []).length, route).toBe(1);
    if (strict) expect(content, route).toContain("allowSuperAdmin={false}");
  }
}

function expectRoles(
  allowed: readonly SchoolRole[],
  accepted: readonly SchoolRole[],
  rejected: readonly SchoolRole[],
  allowSuperAdmin = true,
) {
  for (const role of accepted) {
    expect(policyAllowsRole(allowed, role, allowSuperAdmin), role).toBe(true);
  }
  for (const role of rejected) {
    expect(policyAllowsRole(allowed, role, allowSuperAdmin), role).toBe(false);
  }
}

const direction = [
  "etablissement", "utilisateurs", "creer-enseignant",
  "matieres", "emplois-du-temps", "notes-bulletins", "modele-bulletin",
  "bulletins-publication", "journal-audit", "import-export", "synchronisation",
  "diagnostic", "modules-a-venir", "abonnement",
] as const;
const secretariat = [
  "secretariat", "eleves", "parents", "inscription", "inscriptions", "classes", "personnel",
] as const;
const communication = ["communication", "annonces", "notifications"] as const;
const pedagogy = [
  "tableau-de-bord", "mes-classes", "mes-fiches", "cahier-de-textes",
  "cahier-de-textes/progression", "preparer-un-cours", "generateur-ia",
  "programmes-apc", "evaluations", "notes", "notes/parametres", "bulletins", "saisie-bulletin",
  "parametres", "modules/[slug]",
] as const;
const publicRoutes = [
  "", "activation-etablissement", "connexion", "connexion-administration", "connexion-eleves", "connexion-parents",
  "connexion-vie-scolaire", "ouvrir-compte", "enregistrer-etablissement", "espaces",
  "mot-de-passe-oublie", "erreur",
] as const;

function discoveredPages(directory: string): string[] {
  const pages: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name === "page.tsx") {
        const route = relative(directory, current).replaceAll("\\", "/");
        pages.push(route === "." ? "" : route);
      }
    }
  };
  visit(directory);
  return pages.sort();
}

describe("tableau de bord administration", () => {
  it("utilise la politique d’administration générale", () =>
    expectLocalGuard(["administration"], "ADMINISTRATION_ROLES"));
  it("n’admet plus le directeur des études", () => expectRoles(
    ADMINISTRATION_ROLES,
    ["school_admin", "headmaster", "super_admin"],
    ["academic_director", "secretary", "teacher", "head_teacher", "supervisor", "guardian", "student"],
  ));
});

describe("tableau de bord pédagogie", () => {
  it("utilise sa politique propre", () =>
    expectLocalGuard(["pedagogie"], "ACADEMIC_DIRECTION_ROLES"));
  it("admet la direction des études et la direction générale", () => expectRoles(
    ACADEMIC_DIRECTION_ROLES,
    ["school_admin", "headmaster", "academic_director", "super_admin"],
    ["secretary", "teacher", "head_teacher", "supervisor", "guardian", "student"],
  ));
});

describe("pages direction partagées", () => {
  it("utilise une garde locale unique", () => expectLocalGuard(direction, "DIRECTION_ROLES"));
  it("applique les rôles de direction", () => expectRoles(
    DIRECTION_ROLES,
    ["school_admin", "headmaster", "academic_director", "super_admin"],
    ["secretary", "teacher", "head_teacher", "supervisor", "guardian", "student"],
  ));
});

describe("pages secrétariat", () => {
  it("utilise une garde locale unique", () => expectLocalGuard(secretariat, "SECRETARIAT_ROLES"));
  it("refuse notamment student et academic_director", () => expectRoles(
    SECRETARIAT_ROLES,
    ["secretary", "school_admin", "headmaster", "super_admin"],
    ["academic_director", "teacher", "head_teacher", "supervisor", "guardian", "student"],
  ));
});

describe("pages communication", () => {
  it("utilise une garde locale unique", () => expectLocalGuard(communication, "COMMUNICATION_ROLES"));
  it("refuse teacher et supervisor", () => expectRoles(
    COMMUNICATION_ROLES,
    ["school_admin", "headmaster", "academic_director", "secretary", "super_admin"],
    ["teacher", "head_teacher", "supervisor", "guardian", "student"],
  ));
});

describe("pages pédagogiques", () => {
  it("utilise une garde locale unique, y compris les sous-routes", () =>
    expectLocalGuard(pedagogy, "PEDAGOGY_ROLES"));
  it("applique les rôles pédagogiques", () => expectRoles(
    PEDAGOGY_ROLES,
    ["teacher", "head_teacher", "school_admin", "headmaster", "academic_director", "super_admin"],
    ["secretary", "supervisor", "guardian", "student"],
  ));
  it("couvre un slug concret sans chercher le texte littéral dans l'URL", () => {
    expect(existsSync(resolve(app, "modules/[slug]/page.tsx"))).toBe(true);
    expect(source("modules/[slug]")).toContain("allow={PEDAGOGY_ROLES}");
    expect("/gabon-educ/modules/exemple".startsWith("/gabon-educ/modules/")).toBe(true);
  });
});

describe("impression des bulletins", () => {
  it("utilise la politique administrative d'impression", () =>
    expectLocalGuard(["impression-bulletins"], "BULLETIN_PRINT_ROLES"));
  it("refuse teacher et autorise secretary", () => expectRoles(
    BULLETIN_PRINT_ROLES,
    ["school_admin", "headmaster", "academic_director", "secretary", "super_admin"],
    ["teacher", "head_teacher", "supervisor", "guardian", "student"],
  ));
});

describe("documents partagés", () => {
  it("utilise sa garde locale", () => expectLocalGuard(["documents"], "SHARED_DOCUMENT_ROLES"));
  it("applique les rôles partagés", () => expectRoles(
    SHARED_DOCUMENT_ROLES,
    ["secretary", "teacher", "head_teacher", "school_admin", "headmaster", "academic_director", "super_admin"],
    ["supervisor", "guardian", "student"],
  ));
});

describe("vie scolaire", () => {
  it("utilise sa garde locale", () => expectLocalGuard(["assiduite"], "SCHOOL_LIFE_ROLES"));
  it("autorise supervisor et refuse les autres personnels non prévus", () => expectRoles(
    SCHOOL_LIFE_ROLES,
    ["supervisor", "school_admin", "headmaster", "academic_director", "super_admin"],
    ["secretary", "teacher", "head_teacher", "guardian", "student"],
  ));
});

describe("comptabilité scolaire", () => {
  it("utilise une garde locale unique", () => expectLocalGuard(["comptabilite"], "FINANCE_MODULE_ROLES"));
  it("autorise direction financière et secrétariat", () => expectRoles(
    FINANCE_MODULE_ROLES,
    ["school_admin", "headmaster", "secretary", "super_admin"],
    ["academic_director", "teacher", "head_teacher", "supervisor", "guardian", "student"],
  ));
});

describe("espaces personnels stricts", () => {
  it("pose une garde locale sans passe-droit super_admin", () => {
    expectLocalGuard(["espace-parent"], "PARENT_SPACE_ROLES", true);
    expectLocalGuard(["espace-eleve"], "STUDENT_SPACE_ROLES", true);
  });
  it("isole guardian et student, y compris de super_admin", () => {
    expectRoles(PARENT_SPACE_ROLES, ["guardian"], ["student", "teacher", "secretary", "school_admin", "super_admin"], false);
    expectRoles(STUDENT_SPACE_ROLES, ["student"], ["guardian", "teacher", "secretary", "school_admin", "super_admin"], false);
  });
});

describe("routes publiques et noms voisins", () => {
  it("ne pose aucune garde sur les pages publiques exactes", () => {
    for (const route of publicRoutes) expect(source(route), route || "/gabon-educ").not.toContain("RequireRole");
  });
  it("classe toutes les pages réellement présentes sous app/gabon-educ", () => {
    const classified = [
      ...publicRoutes,
      "administration",
      "pedagogie",
      ...direction,
      ...secretariat,
      ...communication,
      ...pedagogy,
      "impression-bulletins",
      "documents",
      "assiduite",
      "comptabilite",
      "espace-parent",
      "espace-eleve",
      "service-abonnements",
      "centre-pilotage",
      "super-admin",
    ].sort();
    expect(discoveredPages(app)).toEqual(classified);
  });
  it("ne transforme pas un nom voisin inexistant en page publique", () => {
    expect(existsSync(resolve(app, "connexion-factice/page.tsx"))).toBe(false);
  });
});

describe("service plateforme et doubles gardes", () => {
  it("conserve une unique garde superAdminOnly sur chaque page de service", () => {
    for (const file of [
      resolve(app, "service-abonnements/page.tsx"),
      resolve(app, "centre-pilotage/page.tsx"),
      resolve(app, "super-admin/page.tsx"),
    ]) {
      const content = readFileSync(file, "utf8");
      expect(content).toContain("<RequireRole superAdminOnly");
      expect((content.match(/<RequireRole\b/g) || []).length).toBe(1);
    }
  });
  it("ne contient aucune garde dans le layout global", () => {
    const layout = readFileSync(resolve(app, "layout.tsx"), "utf8");
    expect(layout).not.toContain("RequireRole");
    expect(layout).not.toContain("RouteRoleGuard");
  });
});
