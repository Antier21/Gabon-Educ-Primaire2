import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./protected-paths";

describe("middleware protected path boundaries", () => {
  it("reconnaît une route exacte et ses véritables sous-routes", () => {
    expect(isProtectedPath("/gabon-educ/notes")).toBe(true);
    expect(isProtectedPath("/gabon-educ/notes/classe-a")).toBe(true);
    expect(isProtectedPath("/gabon-educ/modules/exemple")).toBe(true);
  });

  it("n'assimile pas un nom voisin à un préfixe protégé", () => {
    expect(isProtectedPath("/gabon-educ/notes-inconnues")).toBe(false);
    expect(isProtectedPath("/gabon-educ/administration-factice")).toBe(false);
    expect(isProtectedPath("/gabon-educ/connexion-factice")).toBe(false);
  });
});
