import { describe, expect, it } from "vitest";
import {
  familyHomeworkDateFilter,
  groupHomeworkByDue,
  shiftISODate,
  type FamilyHomework,
} from "./lesson-book";

function devoir(id: string, dueDate: string, subject = "Français"): FamilyHomework {
  return {
    id,
    description: `Travail ${id}`,
    dueDate,
    mode: "papier",
    durationMinutes: null,
    entryId: `e-${id}`,
    subject,
    sessionDate: "2026-09-10",
  };
}

describe("shiftISODate", () => {
  it("avance et recule d’un jour", () => {
    expect(shiftISODate("2026-09-10", 1)).toBe("2026-09-11");
    expect(shiftISODate("2026-09-10", -1)).toBe("2026-09-09");
  });

  it("franchit les fins de mois et les années", () => {
    expect(shiftISODate("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftISODate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftISODate("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("connaît les années bissextiles", () => {
    // 2028 est bissextile : le 29 février existe.
    expect(shiftISODate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftISODate("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("ne dérive pas en heure locale", () => {
    // Le calcul passe par une date locale à midi. « toISOString » aurait ramené
    // minuit trente à Libreville — UTC+1 — au jour précédent.
    expect(shiftISODate("2026-09-10", 0)).toBe("2026-09-10");
  });
});

describe("groupHomeworkByDue", () => {
  const today = "2026-09-14";

  it("nomme aujourd’hui et demain plutôt que de les dater", () => {
    const blocs = groupHomeworkByDue(
      [devoir("a", "2026-09-14"), devoir("b", "2026-09-15")],
      today,
    );
    expect(blocs.map((bloc) => bloc.label)).toEqual(["Pour aujourd’hui", "Pour demain"]);
  });

  it("date les échéances plus lointaines", () => {
    const blocs = groupHomeworkByDue([devoir("a", "2026-09-21")], today);
    expect(blocs[0].label).toBe("Pour le lundi 21 septembre");
  });

  it("place les échéances dépassées en tête, et les signale", () => {
    const blocs = groupHomeworkByDue(
      [devoir("a", "2026-09-16"), devoir("retard", "2026-09-11")],
      today,
    );
    expect(blocs[0].key).toBe("retard");
    expect(blocs[0].late).toBe(true);
    expect(blocs[1].late).toBe(false);
  });

  it("garde les devoirs sans échéance, en dernier", () => {
    // Un travail donné sans date reste un travail donné : l'écarter
    // reviendrait à décider à la place de l'enseignant qu'il n'existe pas.
    const blocs = groupHomeworkByDue([devoir("sans", ""), devoir("a", "2026-09-15")], today);
    expect(blocs.map((bloc) => bloc.key)).toEqual(["2026-09-15", "sans-echeance"]);
  });

  it("range les échéances dans l’ordre du calendrier", () => {
    const blocs = groupHomeworkByDue(
      [devoir("c", "2026-09-30"), devoir("a", "2026-09-15"), devoir("b", "2026-09-18")],
      today,
    );
    expect(blocs.map((bloc) => bloc.key)).toEqual(["2026-09-15", "2026-09-18", "2026-09-30"]);
  });

  it("regroupe plusieurs matières sous la même échéance", () => {
    const blocs = groupHomeworkByDue(
      [devoir("a", "2026-09-15", "Français"), devoir("b", "2026-09-15", "Mathématiques")],
      today,
    );
    expect(blocs).toHaveLength(1);
    expect(blocs[0].items.map((item) => item.subject)).toEqual(["Français", "Mathématiques"]);
  });

  it("classe les retards du plus ancien au plus récent", () => {
    const blocs = groupHomeworkByDue(
      [devoir("b", "2026-09-13"), devoir("a", "2026-09-10")],
      today,
    );
    expect(blocs[0].items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("ne rend rien quand il n’y a rien", () => {
    expect(groupHomeworkByDue([], today)).toEqual([]);
  });
});

describe("familyHomeworkDateFilter", () => {
  it("n'écarte pas les devoirs dont l'enseignant n'a pas daté l'échéance", () => {
    expect(familyHomeworkDateFilter("2026-09-07")).toBe(
      "due_date.gte.2026-09-07,due_date.is.null",
    );
  });
});
