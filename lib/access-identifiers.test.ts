import { describe, expect, it } from "vitest";
import { roleRedirect } from "./access-identifiers";

describe("roleRedirect", () => {
  it("envoie le directeur des études directement vers son espace Pédagogie", () => {
    expect(roleRedirect("academic_director", "/gabon-educ/administration")).toBe(
      "/gabon-educ/pedagogie",
    );
  });

  it("conserve les destinations des autres rôles de direction", () => {
    expect(roleRedirect("school_admin", "/gabon-educ/tableau-de-bord")).toBe(
      "/gabon-educ/administration",
    );
    expect(roleRedirect("headmaster", "/gabon-educ/tableau-de-bord")).toBe(
      "/gabon-educ/administration",
    );
  });
});
