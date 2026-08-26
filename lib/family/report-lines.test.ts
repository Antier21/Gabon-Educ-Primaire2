import { describe, expect, it } from "vitest";
import { buildLineStatements } from "./report-lines";
import type { ModelDomain } from "@/lib/report-model/store";

const MODELE: ModelDomain[] = [
  {
    id: "d1",
    label: "Français",
    shortLabel: "Français",
    position: 0,
    active: true,
    skills: [
      {
        id: "s1",
        domainId: "d1",
        code: "C1",
        label: "",
        position: 0,
        lines: [
          { id: "l1", skillId: "s1", label: "Lecture expressive", maxScore: 10, position: 0, active: true },
          { id: "l2", skillId: "s1", label: "Récitation", maxScore: 10, position: 1, active: true },
        ],
      },
    ],
  },
  {
    id: "d2",
    label: "Mathématiques",
    shortLabel: "Maths",
    position: 1,
    active: true,
    skills: [
      {
        id: "s2",
        domainId: "d2",
        code: "C1",
        label: "",
        position: 0,
        lines: [
          { id: "l3", skillId: "s2", label: "Résolution de problèmes", maxScore: 20, position: 0, active: true },
        ],
      },
    ],
  },
];

const PERIODES = [
  { id: "p1", label: "Palier 1", kind: "palier", sequenceNumber: 1 },
  { id: "p2", label: "Palier 2", kind: "palier", sequenceNumber: 2 },
  { id: "t1", label: "1er trimestre", kind: "trimester", sequenceNumber: 1 },
];

function note(periodId: string, lineId: string, score: number | null, updatedAt = "2026-08-20T10:00:00Z") {
  return { periodId, lineId, score, updatedAt };
}

describe("relevé de la famille sur les lignes du bulletin", () => {
  /**
   * Afficher les six paliers dès la rentrée, tous vides, donnerait à la
   * famille l'impression d'un logiciel en panne plutôt que d'une année qui
   * commence.
   */
  it("n’affiche que les périodes où l’enfant a une note", () => {
    const result = buildLineStatements(MODELE, PERIODES, [note("p1", "l1", 8)]);
    expect(result).toHaveLength(1);
    expect(result[0].periodLabel).toBe("Palier 1");
  });

  it("applique la règle de calcul de l’établissement", () => {
    const result = buildLineStatements(MODELE, PERIODES, [
      note("p1", "l1", 8),
      note("p1", "l2", 9),
      note("p1", "l3", 13),
    ]);
    const releve = result[0];
    // (8 + 9) ÷ 20 × 10 = 8,50 pour le français ;
    // 13 ÷ 20 × 10 = 6,50 pour les mathématiques ;
    // (8 + 9 + 13) ÷ 40 × 10 = 7,50 en général.
    expect(releve.domains[0].average).toBeCloseTo(8.5, 10);
    expect(releve.domains[1].average).toBeCloseTo(6.5, 10);
    expect(releve.average).toBeCloseTo(7.5, 10);
    expect(releve.obtained).toBe(30);
    expect(releve.maxScore).toBe(40);
  });

  it("attribue les niveaux de maîtrise", () => {
    const result = buildLineStatements(MODELE, PERIODES, [
      note("p1", "l1", 9),
      note("p1", "l2", 9),
    ]);
    expect(result[0].domains[0].mastery).toBe("A");
    expect(result[0].domains[0].skills[0].mastery).toBe("A");
  });

  /** Une ligne non évaluée sort du calcul : ce n'est pas un zéro. */
  it("ne compte pas une ligne non évaluée comme un zéro", () => {
    const result = buildLineStatements(MODELE, PERIODES, [note("p1", "l1", 8)]);
    expect(result[0].domains[0].average).toBe(8);
    expect(result[0].scoredCount).toBe(1);
  });

  it("compte les lignes réellement notées", () => {
    const result = buildLineStatements(MODELE, PERIODES, [
      note("p1", "l1", 8),
      note("p1", "l2", null),
      note("p1", "l3", 12),
    ]);
    expect(result[0].scoredCount).toBe(2);
  });

  /** La période la plus récente en tête : c'est celle que la famille consulte. */
  it("place la période la plus avancée en premier", () => {
    const result = buildLineStatements(MODELE, PERIODES, [
      note("p1", "l1", 8),
      note("p2", "l1", 9),
      note("t1", "l1", 7),
    ]);
    expect(result.map((item) => item.periodLabel)).toEqual([
      "Palier 2",
      "Palier 1",
      "1er trimestre",
    ]);
  });

  /**
   * La date sert à l'indicateur de nouveauté : c'est la note la plus récente
   * qui dit à la famille qu'il y a du neuf.
   */
  it("retient la date de la note la plus récente", () => {
    const result = buildLineStatements(MODELE, PERIODES, [
      note("p1", "l1", 8, "2026-08-20T10:00:00Z"),
      note("p1", "l2", 9, "2026-08-24T10:00:00Z"),
    ]);
    expect(result[0].updatedAt).toBe("2026-08-24T10:00:00Z");
  });

  it("renvoie une liste vide quand rien n’est saisi", () => {
    expect(buildLineStatements(MODELE, PERIODES, [])).toEqual([]);
  });

  it("conserve le barème de chaque ligne pour l’affichage", () => {
    const result = buildLineStatements(MODELE, PERIODES, [note("p1", "l3", 13)]);
    const ligne = result[0].domains[1].skills[0].lines[0];
    expect(ligne.maxScore).toBe(20);
    expect(ligne.label).toBe("Résolution de problèmes");
  });
});
