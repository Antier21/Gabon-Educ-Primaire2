import { describe, expect, it } from "vitest";
import { adoptSchoolPeriods, type SchoolPeriodLike } from "./adopt-periods";
import type { GradingPeriod } from "./types";

function locale(id: string, label: string, active = false): GradingPeriod {
  return { id, label, startsOn: "", endsOn: "", active, locked: false };
}

function ecole(id: string, label: string, kind: string, seq: number | null): SchoolPeriodLike {
  return { id, label, kind, sequenceNumber: seq };
}

const TRIMESTRES_LOCAUX = [
  locale("period-t1", "Trimestre 1", true),
  locale("period-t2", "Trimestre 2"),
  locale("period-t3", "Trimestre 3"),
];

const RIEN = () => false;

describe("adoption du découpage de l’établissement", () => {
  /**
   * Le cas qui a motivé cette fusion : l'établissement évalue par paliers,
   * l'enseignant n'en voyait aucun.
   */
  it("fait apparaître les paliers de l’établissement", () => {
    const ecoleP = [
      ecole("s1", "1er trimestre", "trimester", 1),
      ecole("s2", "2e trimestre", "trimester", 2),
      ecole("s3", "3e trimestre", "trimester", 3),
      ecole("p1", "Palier 1", "palier", 1),
      ecole("p2", "Palier 2", "palier", 2),
      ecole("a", "Bilan annuel", "annual", null),
    ];
    const result = adoptSchoolPeriods(TRIMESTRES_LOCAUX, ecoleP, RIEN);
    expect(result.map((p) => p.label)).toEqual([
      "1er trimestre", "2e trimestre", "3e trimestre",
      "Palier 1", "Palier 2", "Bilan annuel",
    ]);
  });

  /**
   * « Trimestre 1 » et « 1er trimestre » sont la même période. Les traiter
   * comme deux a déjà produit six trimestres dans une base réelle.
   */
  it("apparie les libellés équivalents au lieu de les doubler", () => {
    const result = adoptSchoolPeriods(
      TRIMESTRES_LOCAUX,
      [ecole("s1", "1er trimestre", "trimester", 1)],
      RIEN,
    );
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("1er trimestre");
  });

  /**
   * Les évaluations déjà saisies renvoient à l'identifiant local. Lui
   * substituer celui du nuage les rendrait orphelines : l'enseignant verrait
   * ses notes disparaître.
   */
  it("conserve l’identifiant local d’une période appariée", () => {
    const result = adoptSchoolPeriods(
      TRIMESTRES_LOCAUX,
      [ecole("uuid-distant", "Trimestre 1", "trimester", 1)],
      RIEN,
    );
    expect(result[0].id).toBe("period-t1");
  });

  it("prend le libellé de l’établissement, qui fait autorité", () => {
    const result = adoptSchoolPeriods(
      TRIMESTRES_LOCAUX,
      [ecole("s1", "1er trimestre", "trimester", 1)],
      RIEN,
    );
    expect(result[0].label).toBe("1er trimestre");
  });

  it("retire une période vide que l’établissement ne déclare plus", () => {
    const result = adoptSchoolPeriods(
      TRIMESTRES_LOCAUX,
      [ecole("s1", "Trimestre 1", "trimester", 1)],
      RIEN,
    );
    expect(result.map((p) => p.label)).toEqual(["Trimestre 1"]);
  });

  /**
   * Un établissement qui passe des trimestres aux paliers en cours d'année ne
   * doit pas perdre le trimestre déjà évalué.
   */
  it("garde une période retirée du découpage mais qui porte des notes", () => {
    const result = adoptSchoolPeriods(
      TRIMESTRES_LOCAUX,
      [ecole("p1", "Palier 1", "palier", 1)],
      (id) => id === "period-t2",
    );
    expect(result.map((p) => p.label)).toEqual(["Palier 1", "Trimestre 2"]);
  });

  it("range les trimestres avant les paliers et le bilan en dernier", () => {
    const result = adoptSchoolPeriods(
      [],
      [
        ecole("a", "Bilan annuel", "annual", null),
        ecole("p2", "Palier 2", "palier", 2),
        ecole("s1", "1er trimestre", "trimester", 1),
        ecole("p1", "Palier 1", "palier", 1),
      ],
      RIEN,
    );
    expect(result.map((p) => p.label)).toEqual([
      "1er trimestre", "Palier 1", "Palier 2", "Bilan annuel",
    ]);
  });
});

describe("période active après adoption", () => {
  it("conserve la période active quand elle survit", () => {
    const result = adoptSchoolPeriods(
      TRIMESTRES_LOCAUX,
      [
        ecole("s1", "1er trimestre", "trimester", 1),
        ecole("s2", "2e trimestre", "trimester", 2),
      ],
      RIEN,
    );
    expect(result.find((p) => p.active)?.label).toBe("1er trimestre");
  });

  it("désigne la première quand l’ancienne a disparu", () => {
    const result = adoptSchoolPeriods(
      [locale("period-t9", "Trimestre 9", true)],
      [ecole("p1", "Palier 1", "palier", 1)],
      RIEN,
    );
    expect(result.find((p) => p.active)?.label).toBe("Palier 1");
  });

  it("n’en laisse jamais deux actives", () => {
    const result = adoptSchoolPeriods(
      [locale("period-t1", "Trimestre 1", true), locale("period-t2", "Trimestre 2", true)],
      [
        ecole("s1", "Trimestre 1", "trimester", 1),
        ecole("s2", "Trimestre 2", "trimester", 2),
      ],
      RIEN,
    );
    expect(result.filter((p) => p.active)).toHaveLength(1);
  });
});

describe("prudence", () => {
  /**
   * Un établissement qui n'a pas encore enregistré son découpage ne doit pas
   * vider le cahier de notes de ses périodes : l'enseignant se retrouverait
   * sans aucun endroit où saisir.
   */
  it("ne touche à rien quand l’établissement n’a déclaré aucune période", () => {
    const result = adoptSchoolPeriods(TRIMESTRES_LOCAUX, [], RIEN);
    expect(result.map((p) => p.label)).toEqual([
      "Trimestre 1", "Trimestre 2", "Trimestre 3",
    ]);
  });
});
