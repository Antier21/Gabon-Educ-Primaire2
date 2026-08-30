import { describe, expect, it } from "vitest";
import { chooseCanonicalClassId, type CloudClass } from "./timetable-cloud";

const classes: CloudClass[] = [
  { id: "old-class", name: "5e Année A", academic_year_id: "year-2026" },
  { id: "student-class", name: "5e Année A", academic_year_id: "year-2026" },
  { id: "other-year", name: "5e Année A", academic_year_id: "year-2025" },
];

describe("classe canonique de publication EDT", () => {
  it("préfère la classe de même nom et même année qui contient les élèves", () => {
    const counts = new Map<string, number>([
      ["old-class", 0],
      ["student-class", 18],
      ["other-year", 25],
    ]);

    expect(chooseCanonicalClassId("old-class", classes, counts)).toBe("student-class");
  });

  it("ne bascule jamais vers une classe homonyme d'une autre année", () => {
    const counts = new Map<string, number>([
      ["old-class", 0],
      ["student-class", 0],
      ["other-year", 25],
    ]);

    expect(chooseCanonicalClassId("old-class", classes, counts)).toBe("old-class");
  });

  it("conserve l'identifiant source quand il est déjà la meilleure classe", () => {
    const counts = new Map<string, number>([
      ["old-class", 12],
      ["student-class", 4],
    ]);

    expect(chooseCanonicalClassId("old-class", classes, counts)).toBe("old-class");
  });
});
