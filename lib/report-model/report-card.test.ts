import { describe, expect, it } from "vitest";
import {
  buildClassReport,
  formatRank,
  pupilReportOf,
  type ClassScores,
  type ModelDomainLike,
} from "./report-card";
import { formatAverage } from "./scale";
import { OFFICIAL_REPORT_MODEL } from "./official-model";

/**
 * Le modèle officiel, transformé en identifiants stables pour les tests :
 * « fr-c1-0 » désigne la première ligne de la compétence C1 du français.
 */
const MODEL: ModelDomainLike[] = OFFICIAL_REPORT_MODEL.map((domain, di) => {
  const codes: string[] = [];
  for (const line of domain.lines) if (!codes.includes(line.skill)) codes.push(line.skill);
  return {
    id: `d${di}`,
    label: domain.label,
    shortLabel: domain.shortLabel,
    skills: codes.map((code, si) => ({
      id: `d${di}-${code}`,
      code,
      lines: domain.lines
        .filter((line) => line.skill === code)
        .map((line, li) => ({
          id: `d${di}-${code}-${li}`,
          label: line.label,
          maxScore: line.maxScore,
        })),
    })),
  };
});

/** Les notes exactes du bulletin de palier 3 de TCHUENKAM Chanceline, 4e année. */
const BULLETIN_REEL: ClassScores = {
  // Français — C1 : 8, 9 · C2 : 10, 10, 6, 6
  "eleve-1:d0-C1-0": 8, "eleve-1:d0-C1-1": 9,
  "eleve-1:d0-C2-0": 10, "eleve-1:d0-C2-1": 10, "eleve-1:d0-C2-2": 6, "eleve-1:d0-C2-3": 6,
  // Anglais — 10, 10
  "eleve-1:d1-C1-0": 10, "eleve-1:d1-C2-0": 10,
  // Mathématiques — C1 : 10, 1, 13/20 · C2 : 7, 7
  "eleve-1:d2-C1-0": 10, "eleve-1:d2-C1-1": 1, "eleve-1:d2-C1-2": 13,
  "eleve-1:d2-C2-0": 7, "eleve-1:d2-C2-1": 7,
  // Éveil — C1 : 9, 9 · C2 : 9, 8 · C3 : 8, 8
  "eleve-1:d3-C1-0": 9, "eleve-1:d3-C1-1": 9,
  "eleve-1:d3-C2-0": 9, "eleve-1:d3-C2-1": 8,
  "eleve-1:d3-C3-0": 8, "eleve-1:d3-C3-1": 8,
};

const UN_ELEVE = [{ id: "eleve-1", fullName: "TCHUENKAM Chanceline" }];

describe("bulletin réel de 4e année, palier 3", () => {
  const report = buildClassReport(MODEL, UN_ELEVE, BULLETIN_REEL);
  const eleve = pupilReportOf(report, "eleve-1")!;

  it.each([
    [0, "Français", 49, 60, "8,17"],
    [1, "Anglais", 20, 20, "10,00"],
    [2, "Mathématiques", 38, 60, "6,33"],
    [3, "Éveil", 51, 60, "8,50"],
  ])("retrouve le domaine %i (%s) : %i/%i → %s", (index, _nom, obtenu, bareme, moyenne) => {
    const domaine = eleve.domains[index as number];
    expect(domaine.totals.obtained).toBe(obtenu);
    expect(domaine.maxScore).toBe(bareme);
    expect(formatAverage(domaine.totals.average)).toBe(moyenne);
  });

  it("retrouve le total général et la moyenne générale", () => {
    expect(eleve.general.obtained).toBe(158);
    expect(report.maxScore).toBe(200);
    expect(formatAverage(eleve.general.average)).toBe("7,90");
  });

  it.each([
    [0, 0, "8,50", "A"],
    [0, 1, "8,00", "A"],
    [2, 0, "6,00", "B"],
    [2, 1, "7,00", "B"],
    [3, 1, "8,50", "A"],
  ])("retrouve la compétence %i.%i : %s → %s", (di, si, moyenne, lettre) => {
    const skill = eleve.domains[di as number].skills[si as number];
    expect(formatAverage(skill.totals.average)).toBe(moyenne);
    expect(skill.mastery).toBe(lettre);
  });

  it.each([
    [0, "A"],
    [1, "A"],
    [2, "B"],
    [3, "A"],
  ])("retrouve le niveau de maîtrise du domaine %i : %s", (index, lettre) => {
    expect(eleve.domains[index as number].mastery).toBe(lettre);
  });

  it("classe l’élève en maîtrise minimale sur l’ensemble", () => {
    // 7,90 tombe dans la tranche B : 5,00 à 7,99.
    expect(eleve.mastery).toBe("B");
  });
});

describe("classement dans la classe", () => {
  const modele: ModelDomainLike[] = [
    {
      id: "d",
      label: "Français",
      skills: [{ id: "s", code: "C1", lines: [{ id: "l", label: "Lecture", maxScore: 10 }] }],
    },
  ];
  const eleves = [
    { id: "a", fullName: "A" },
    { id: "b", fullName: "B" },
    { id: "c", fullName: "C" },
    { id: "d", fullName: "D" },
  ];

  it("range du meilleur au moins bon", () => {
    const report = buildClassReport(modele, eleves, {
      "a:l": 5, "b:l": 9, "c:l": 7, "d:l": 3,
    });
    expect(pupilReportOf(report, "b")!.rank).toBe(1);
    expect(pupilReportOf(report, "c")!.rank).toBe(2);
    expect(pupilReportOf(report, "a")!.rank).toBe(3);
    expect(pupilReportOf(report, "d")!.rank).toBe(4);
  });

  /**
   * Usage scolaire : deux premiers ex æquo sont suivis d'un troisième, jamais
   * d'un deuxième. C'est ce qu'attend un parent qui lit « 9e sur 36 ».
   */
  it("donne le même rang aux ex æquo et saute le suivant", () => {
    const report = buildClassReport(modele, eleves, {
      "a:l": 9, "b:l": 9, "c:l": 7, "d:l": 3,
    });
    expect(pupilReportOf(report, "a")!.rank).toBe(1);
    expect(pupilReportOf(report, "b")!.rank).toBe(1);
    expect(pupilReportOf(report, "c")!.rank).toBe(3);
    expect(pupilReportOf(report, "d")!.rank).toBe(4);
  });

  /**
   * Un élève sans aucune note n'a pas démérité : il n'a pas encore été évalué.
   * Le classer dernier lui imputerait une contre-performance imaginaire, et
   * ferait chuter la moyenne de la classe.
   */
  it("écarte du classement et de la moyenne un élève sans aucune note", () => {
    const report = buildClassReport(modele, eleves, { "a:l": 8, "b:l": 6, "c:l": 4 });
    expect(pupilReportOf(report, "d")!.rank).toBeNull();
    expect(report.rankedCount).toBe(3);
    expect(report.classAverage).toBeCloseTo(6, 10);
  });

  it("calcule la moyenne de la classe et la meilleure moyenne", () => {
    const report = buildClassReport(modele, eleves, {
      "a:l": 5, "b:l": 9, "c:l": 7, "d:l": 3,
    });
    expect(report.classAverage).toBeCloseTo(6, 10);
    expect(report.bestAverage).toBe(9);
  });

  it("ne renvoie ni moyenne ni meilleure moyenne quand rien n’est saisi", () => {
    const report = buildClassReport(modele, eleves, {});
    expect(report.classAverage).toBeNull();
    expect(report.bestAverage).toBeNull();
    expect(report.rankedCount).toBe(0);
  });
});

describe("affichage du rang", () => {
  it("écrit « 1er » pour le premier et « e » ensuite", () => {
    expect(formatRank(1, 36)).toBe("1er sur 36");
    expect(formatRank(9, 36)).toBe("9e sur 36");
  });

  it("écrit un tiret tant que l’élève n’a pas de rang", () => {
    expect(formatRank(null, 36)).toBe("—");
    expect(formatRank(3, 0)).toBe("—");
  });
});
