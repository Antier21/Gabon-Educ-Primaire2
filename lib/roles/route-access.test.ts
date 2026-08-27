import { describe, expect, it } from "vitest";
import {
  deniedAccessReturnPath,
  isPublicRolePath,
  NO_ACTIVE_SCHOOL_RETURN_PATH,
  routeAccessDecision,
} from "./route-access";

function allowed(pathname: string, role: string) {
  const decision = routeAccessDecision(pathname);
  return decision.kind === "protected"
    ? decision.rule.allow.includes(role as never)
    : false;
}

describe("route role access", () => {
  it("laisse les portes de connexion publiques", () => {
    expect(isPublicRolePath("/gabon-educ")).toBe(true);
    expect(isPublicRolePath("/gabon-educ/connexion-parents")).toBe(true);
    expect(routeAccessDecision("/gabon-educ/connexion-eleves")).toEqual({ kind: "public" });
    expect(routeAccessDecision("/gabon-educ/connexion")).toEqual({ kind: "public" });
    expect(routeAccessDecision("/gabon-educ/connexion-factice")).toEqual({ kind: "unknown" });
  });

  it("réserve l'administration à la direction", () => {
    expect(allowed("/gabon-educ/administration", "school_admin")).toBe(true);
    expect(allowed("/gabon-educ/diagnostic", "academic_director")).toBe(true);
    expect(allowed("/gabon-educ/administration", "secretary")).toBe(false);
    expect(allowed("/gabon-educ/administration", "super_admin")).toBe(false);
  });

  it("autorise le secrétariat et la direction administrative", () => {
    expect(allowed("/gabon-educ/inscriptions", "secretary")).toBe(true);
    expect(allowed("/gabon-educ/eleves", "headmaster")).toBe(true);
    expect(allowed("/gabon-educ/secretariat", "academic_director")).toBe(false);
  });

  it("applique les rôles de communication", () => {
    expect(allowed("/gabon-educ/communication", "secretary")).toBe(true);
    expect(allowed("/gabon-educ/notifications", "academic_director")).toBe(true);
    expect(allowed("/gabon-educ/annonces", "teacher")).toBe(false);
  });

  it("ouvre l'espace enseignant aux enseignants et à la direction pédagogique", () => {
    expect(allowed("/gabon-educ/cahier-de-textes/progression", "teacher")).toBe(true);
    expect(allowed("/gabon-educ/modules/discipline", "head_teacher")).toBe(true);
    expect(allowed("/gabon-educ/modules/exemple", "teacher")).toBe(true);
    expect(allowed("/gabon-educ/notes", "academic_director")).toBe(true);
    expect(allowed("/gabon-educ/tableau-de-bord", "guardian")).toBe(false);
  });

  it("réserve l'impression des bulletins à la direction et au secrétariat", () => {
    expect(allowed("/gabon-educ/impression-bulletins", "teacher")).toBe(false);
    expect(allowed("/gabon-educ/impression-bulletins", "head_teacher")).toBe(false);
    expect(allowed("/gabon-educ/impression-bulletins", "secretary")).toBe(true);
    expect(allowed("/gabon-educ/impression-bulletins", "academic_director")).toBe(true);
  });

  it("réserve la vie scolaire au surveillant et à la direction", () => {
    expect(allowed("/gabon-educ/assiduite", "supervisor")).toBe(true);
    expect(allowed("/gabon-educ/assiduite", "headmaster")).toBe(true);
    expect(allowed("/gabon-educ/assiduite", "teacher")).toBe(false);
  });

  it("isole strictement les espaces parent et élève", () => {
    expect(allowed("/gabon-educ/espace-parent", "guardian")).toBe(true);
    expect(allowed("/gabon-educ/espace-parent", "student")).toBe(false);
    expect(allowed("/gabon-educ/espace-eleve", "student")).toBe(true);
    expect(allowed("/gabon-educ/espace-eleve", "guardian")).toBe(false);
    expect(allowed("/gabon-educ/espace-eleve", "super_admin")).toBe(false);
  });

  it("ne confond pas les préfixes voisins", () => {
    expect(allowed("/gabon-educ/inscriptions", "secretary")).toBe(true);
    expect(routeAccessDecision("/gabon-educ/notes-inconnues")).toEqual({ kind: "unknown" });
  });

  it("refuse par défaut une route métier inconnue", () => {
    expect(routeAccessDecision("/gabon-educ/nouvel-espace-oublie")).toEqual({
      kind: "unknown",
    });
  });

  it("revient à l'accueil quand aucun établissement n'est actif", () => {
    expect(NO_ACTIVE_SCHOOL_RETURN_PATH).toBe("/gabon-educ");
    expect(deniedAccessReturnPath(true, "/gabon-educ/tableau-de-bord")).toBe(
      "/gabon-educ",
    );
    expect(deniedAccessReturnPath(false, "/gabon-educ/tableau-de-bord")).toBe(
      "/gabon-educ/tableau-de-bord",
    );
  });
});
