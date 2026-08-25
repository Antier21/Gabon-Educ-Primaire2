import { describe, expect, it } from "vitest";
import {
  formatAverage,
  MASTERY_LABELS,
  masteryLevel,
  totalsOf,
  type ScoredLine,
} from "./scale";
import {
  domainMaxScore,
  modelMaxScore,
  OFFICIAL_REPORT_MODEL,
  skillsOf,
} from "./official-model";

function ligne(score: number | null, maxScore = 10): ScoredLine {
  return { score, maxScore };
}

/**
 * Ces chiffres ne sont pas inventés : ce sont ceux imprimés sur le bulletin de
 * 4e année qui a servi de modèle. Si un jour le calcul dérive, ce sont ces
 * tests qui le diront, et la comparaison avec le papier restera possible.
 */
describe("conformité au bulletin papier de 4e année", () => {
  it("retrouve la moyenne de la compétence C1 de mathématiques", () => {
    // Trois lignes notées 10, 1 et 13 sur des barèmes de 10, 10 et 20.
    const { average } = totalsOf([ligne(10), ligne(1), ligne(13, 20)]);
    expect(formatAverage(average)).toBe("6,00");
  });

  /**
   * Le piège que cette règle évite : la moyenne arithmétique des mêmes notes
   * ramenées sur 10 donnerait 5,83. Le bulletin imprime 6,00.
   */
  it("diffère bien de la moyenne arithmétique des notes ramenées sur 10", () => {
    const arithmetique = (10 / 10 + 1 / 10 + (13 / 20) * 10 / 10) / 3 * 10;
    expect(Number(arithmetique.toFixed(2))).toBe(5.83);
    expect(totalsOf([ligne(10), ligne(1), ligne(13, 20)]).average).toBeCloseTo(6, 10);
  });

  it.each([
    ["Français", 49, 60, "8,17"],
    ["Anglais", 20, 20, "10,00"],
    ["Mathématiques", 38, 60, "6,33"],
    ["Éveil", 51, 60, "8,50"],
    ["Moyenne générale", 158, 200, "7,90"],
  ])("retrouve %s : %i/%i", (_domaine, obtenu, bareme, attendu) => {
    const { average } = totalsOf([ligne(obtenu as number, bareme as number)]);
    expect(formatAverage(average)).toBe(attendu);
  });
});

describe("totaux", () => {
  /**
   * Un enfant absent à la dictée ne doit pas voir sa moyenne de français
   * s'effondrer pour une épreuve qu'il n'a pas passée : la ligne sort des deux
   * sommes, elle n'est pas comptée zéro.
   */
  it("écarte les lignes non évaluées des deux sommes", () => {
    const { obtained, total, average } = totalsOf([ligne(8), ligne(null), ligne(6)]);
    expect(obtained).toBe(14);
    expect(total).toBe(20);
    expect(average).toBe(7);
  });

  it("distingue une ligne non évaluée d’une note de zéro", () => {
    expect(totalsOf([ligne(8), ligne(null)]).average).toBe(8);
    expect(totalsOf([ligne(8), ligne(0)]).average).toBe(4);
  });

  it("renvoie une moyenne absente quand rien n’est évalué", () => {
    expect(totalsOf([ligne(null), ligne(null)]).average).toBeNull();
    expect(totalsOf([]).average).toBeNull();
  });

  it("ignore un barème absurde plutôt que de diviser par zéro", () => {
    expect(totalsOf([ligne(5, 0)]).average).toBeNull();
    expect(totalsOf([ligne(5, -10)]).average).toBeNull();
  });

  it("affiche un tiret là où il n’y a pas de moyenne", () => {
    expect(formatAverage(null)).toBe("—");
  });

  /** Le bulletin gabonais écrit « 8,17 » et non « 8.17 ». */
  it("écrit la virgule décimale", () => {
    expect(formatAverage(8.1666)).toBe("8,17");
  });
});

describe("niveaux de maîtrise", () => {
  it.each([
    [10, "A"],
    [8, "A"],
    [7.99, "B"],
    [5, "B"],
    [4.99, "C"],
    [2, "C"],
    [1.99, "D"],
    [0, "D"],
  ])("classe une moyenne de %s en %s", (moyenne, attendu) => {
    expect(masteryLevel(moyenne as number)).toBe(attendu);
  });

  it("ne classe rien quand rien n’a été évalué", () => {
    expect(masteryLevel(null)).toBeNull();
  });

  it("nomme les quatre niveaux en toutes lettres", () => {
    expect(MASTERY_LABELS.A).toBe("Maîtrise maximale");
    expect(MASTERY_LABELS.D).toBe("Non maîtrise");
  });
});

describe("structure officielle", () => {
  it("compte quatre domaines et dix-neuf lignes", () => {
    expect(OFFICIAL_REPORT_MODEL).toHaveLength(4);
    const lignes = OFFICIAL_REPORT_MODEL.reduce((total, d) => total + d.lines.length, 0);
    expect(lignes).toBe(19);
  });

  it.each([
    ["Français", 60],
    ["Anglais", 20],
    ["Mathématiques", 60],
    ["Éveil (EDM / EAS)", 60],
  ])("porte le barème attendu pour %s : /%i", (label, bareme) => {
    const domaine = OFFICIAL_REPORT_MODEL.find((item) => item.label === label);
    expect(domaine).toBeDefined();
    expect(domainMaxScore(domaine!)).toBe(bareme);
  });

  it("totalise deux cents points", () => {
    expect(modelMaxScore(OFFICIAL_REPORT_MODEL)).toBe(200);
  });

  it("garde « Résolution de problèmes » sur 20", () => {
    const maths = OFFICIAL_REPORT_MODEL.find((d) => d.label === "Mathématiques")!;
    const ligne = maths.lines.find((l) => l.label === "Résolution de problèmes")!;
    expect(ligne.maxScore).toBe(20);
  });

  it("liste les compétences d’un domaine dans l’ordre du bulletin", () => {
    const eveil = OFFICIAL_REPORT_MODEL.find((d) => d.label === "Éveil (EDM / EAS)")!;
    expect(skillsOf(eveil)).toEqual(["C1", "C2", "C3"]);
  });
});
