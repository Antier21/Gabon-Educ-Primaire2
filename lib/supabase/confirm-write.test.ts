import { describe, expect, it } from "vitest";
import {
  confirmDeletedByReadBack,
  confirmWrite,
  describeWriteError,
  WriteRefusedError,
} from "./confirm-write";

describe("confirmWrite", () => {
  it("laisse passer une écriture qui a touché des lignes", () => {
    expect(confirmWrite({ data: [{ id: "a" }], error: null }, "la modification")).toEqual([
      { id: "a" },
    ]);
  });

  it("refuse une écriture muette : aucune ligne touchée, aucune erreur", () => {
    expect(() => confirmWrite({ data: [], error: null }, "la suppression de cette classe"))
      .toThrow(WriteRefusedError);
  });

  it("nomme l’opération refusée dans le message", () => {
    try {
      confirmWrite({ data: [], error: null }, "la suppression de cette classe");
      throw new Error("aurait dû lever");
    } catch (caught) {
      expect((caught as Error).message).toContain("la suppression de cette classe");
      expect((caught as Error).message).toContain("Rien n’a été modifié");
    }
  });

  it("traite « data: null » comme un échec", () => {
    expect(() => confirmWrite({ data: null, error: null }, "la modification")).toThrow(
      WriteRefusedError,
    );
  });

  it("fait remonter une vraie erreur serveur telle quelle", () => {
    expect(() =>
      confirmWrite({ data: null, error: { message: "réseau coupé", code: "500" } }, "x"),
    ).toThrow("réseau coupé (code 500)");
  });

  it("distingue l’erreur serveur du refus silencieux", () => {
    // Une erreur réseau ne doit pas être présentée comme un défaut de droit :
    // les deux appellent des gestes opposés.
    try {
      confirmWrite({ data: null, error: { message: "timeout" } }, "x");
    } catch (caught) {
      expect(caught).not.toBeInstanceOf(WriteRefusedError);
    }
  });
});

describe("confirmDeletedByReadBack", () => {
  it("se tait quand la relecture ne trouve plus la ligne", async () => {
    await expect(
      confirmDeletedByReadBack(async () => ({ data: [], error: null }), "la suppression"),
    ).resolves.toBeUndefined();
  });

  it("dénonce la suppression quand la ligne est toujours là", async () => {
    await expect(
      confirmDeletedByReadBack(async () => ({ data: [{ id: "a" }], error: null }), "la suppression"),
    ).rejects.toThrow(WriteRefusedError);
  });

  it("ne crie pas quand la relecture elle-même échoue", async () => {
    // Ne rien pouvoir vérifier n'est pas la preuve d'un échec.
    await expect(
      confirmDeletedByReadBack(
        async () => ({ data: null, error: { message: "lecture refusée" } }),
        "la suppression",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("describeWriteError", () => {
  it("assemble message, détails et code", () => {
    expect(describeWriteError({ message: "refus", details: "ligne 3", code: "42501" })).toBe(
      "refus — ligne 3 (code 42501)",
    );
  });

  it("rend un texte utilisable sur une erreur vide", () => {
    expect(describeWriteError(null)).toBe("Opération impossible.");
  });
});
