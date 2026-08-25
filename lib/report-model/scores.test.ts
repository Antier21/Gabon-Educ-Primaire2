import { describe, expect, it } from "vitest";
import { cellKey, parseScoreInput } from "./scores";

describe("clé de grille", () => {
  it("distingue deux élèves sur la même ligne", () => {
    expect(cellKey("eleve-1", "ligne-1")).not.toBe(cellKey("eleve-2", "ligne-1"));
  });

  it("distingue deux lignes pour le même élève", () => {
    expect(cellKey("eleve-1", "ligne-1")).not.toBe(cellKey("eleve-1", "ligne-2"));
  });
});

describe("saisie d’une note", () => {
  /**
   * La distinction porte tout le calcul du bulletin : une case vide sort la
   * ligne des deux sommes, un zéro l'y fait entrer. Confondre les deux ferait
   * chuter la moyenne d'un enfant absent à une seule épreuve.
   */
  it("lit une case vide comme « non évaluée », jamais comme zéro", () => {
    expect(parseScoreInput("")).toEqual({ value: null, error: "" });
    expect(parseScoreInput("   ")).toEqual({ value: null, error: "" });
    expect(parseScoreInput("0")).toEqual({ value: 0, error: "" });
  });

  /** On écrit 8,5 au Gabon, pas 8.5. */
  it("accepte la virgule décimale", () => {
    expect(parseScoreInput("8,5").value).toBe(8.5);
    expect(parseScoreInput("8.5").value).toBe(8.5);
  });

  it("accepte un entier", () => {
    expect(parseScoreInput("13").value).toBe(13);
  });

  it("refuse une saisie illisible en le disant", () => {
    const result = parseScoreInput("abc");
    expect(result.value).toBeNull();
    expect(result.error).toContain("illisible");
  });

  it("refuse une note négative", () => {
    expect(parseScoreInput("-3").error).toContain("négative");
  });

  /**
   * Le plafond n'est pas vérifié ici : il dépend du barème de la ligne, et
   * c'est la base qui a le dernier mot — un contrôle qui ne vit que dans le
   * navigateur ne protège rien.
   */
  it("laisse le plafond au barème de la ligne", () => {
    expect(parseScoreInput("15").value).toBe(15);
  });
});
