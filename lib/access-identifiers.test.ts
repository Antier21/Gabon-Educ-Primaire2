import { describe, expect, it } from "vitest";
import { roleRedirect } from "./access-identifiers";

describe("redirection des identifiants d'accès", () => {
  it("envoie Pédagogie vers son espace autonome", () => {
    expect(roleRedirect("academic_director", "/gabon-educ")).toBe("/gabon-educ/pedagogie");
  });
});
