import { describe, expect, it } from "vitest";
import { isPublicPath, loginPathFor, LOGIN_BY_PREFIX } from "./login-paths";

describe("loginPathFor", () => {
  it("renvoie chaque espace vers sa propre porte", () => {
    expect(loginPathFor("/gabon-educ/administration")).toBe("/gabon-educ/connexion-administration");
    expect(loginPathFor("/gabon-educ/secretariat")).toBe("/gabon-educ/connexion-administration");
    expect(loginPathFor("/gabon-educ/tableau-de-bord")).toBe("/gabon-educ/connexion");
    expect(loginPathFor("/gabon-educ/espace-parent")).toBe("/gabon-educ/connexion-parents");
    expect(loginPathFor("/gabon-educ/espace-eleve")).toBe("/gabon-educ/connexion-eleves");
    expect(loginPathFor("/gabon-educ/assiduite")).toBe("/gabon-educ/connexion-vie-scolaire");
  });

  it("place « notes-bulletins » avant « notes »", () => {
    // L'ordre de la table décide : inversé, les bulletins de l'administration
    // renverraient un directeur vers la connexion des enseignants, où son
    // compte serait refusé — ce qui ferait croire à un compte invalide.
    expect(loginPathFor("/gabon-educ/notes-bulletins")).toBe(
      "/gabon-educ/connexion-administration",
    );
    expect(loginPathFor("/gabon-educ/notes")).toBe("/gabon-educ/connexion");

    const rangs = LOGIN_BY_PREFIX.map(([prefix]) => prefix);
    expect(rangs.indexOf("/gabon-educ/notes-bulletins")).toBeLessThan(
      rangs.indexOf("/gabon-educ/notes"),
    );
  });

  it("couvre les sous-chemins d’un écran", () => {
    expect(loginPathFor("/gabon-educ/notes-bulletins?tab=reports")).toBe(
      "/gabon-educ/connexion-administration",
    );
  });

  it("retombe sur la connexion enseignant pour un chemin inconnu", () => {
    expect(loginPathFor("/gabon-educ/quelque-chose-de-neuf")).toBe("/gabon-educ/connexion");
  });

  it("dirige le centre de pilotage vers la porte de l’administration", () => {
    expect(loginPathFor("/gabon-educ-service")).toBe("/gabon-educ/connexion-administration");
  });
});

describe("isPublicPath", () => {
  it("reconnaît les pages où personne n’est censé être connecté", () => {
    expect(isPublicPath("/gabon-educ")).toBe(true);
    expect(isPublicPath("/gabon-educ/espaces")).toBe(true);
    expect(isPublicPath("/gabon-educ/connexion-administration")).toBe(true);
    expect(isPublicPath("/gabon-educ/ouvrir-compte")).toBe(true);
  });

  it("ne prend pas un écran de travail pour une page publique", () => {
    expect(isPublicPath("/gabon-educ/administration")).toBe(false);
    expect(isPublicPath("/gabon-educ/tableau-de-bord")).toBe(false);
    expect(isPublicPath("/gabon-educ-service")).toBe(false);
    expect(isPublicPath("/gabon-educ/connexion-factice")).toBe(false);
  });
});
