import { describe, expect, it } from "vitest";
import { describeChange, type GuardianContactRequest } from "./contact-requests";

function demande(partial: Partial<GuardianContactRequest> = {}): GuardianContactRequest {
  return {
    id: "req-1",
    guardianId: "resp-1",
    phone: "077037707",
    email: "",
    address: "",
    previousPhone: "077037707",
    previousEmail: "",
    previousAddress: "",
    createdAt: "2026-08-25T10:00:00.000Z",
    ...partial,
  };
}

describe("description d’une demande de correction", () => {
  /**
   * Le secrétariat valide au guichet, vite. S'il doit comparer deux numéros
   * chiffre par chiffre, il finira par valider une inversion sans la voir.
   */
  it("nomme le champ modifié et montre l’avant et l’après", () => {
    const lignes = describeChange(demande({ phone: "066037707" }));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain("Téléphone");
    expect(lignes[0]).toContain("077037707");
    expect(lignes[0]).toContain("066037707");
  });

  it("ne signale que ce qui change", () => {
    const lignes = describeChange(
      demande({ phone: "066037707", email: "p@exemple.ga", previousEmail: "p@exemple.ga" }),
    );
    expect(lignes).toHaveLength(1);
  });

  it("dit « aucun » plutôt que de laisser un blanc", () => {
    const lignes = describeChange(demande({ previousPhone: "", phone: "077037707" }));
    expect(lignes[0]).toContain("aucun");
  });

  it("signale les trois champs quand les trois changent", () => {
    const lignes = describeChange(
      demande({
        phone: "066037707",
        email: "nouveau@exemple.ga",
        address: "Akanda",
      }),
    );
    expect(lignes).toHaveLength(3);
  });

  it("ne renvoie rien si la demande ne change rien", () => {
    expect(describeChange(demande())).toHaveLength(0);
  });
});
