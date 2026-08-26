import { describe, expect, it } from "vitest";
import {
  formatDuration,
  groupByPeriod,
  sessionMinutes,
  type PeriodBounds,
  type ProgressionEntry,
} from "./progression";

function seance(id: string, date: string, debut = "08:00", fin = "09:00", devoirs = 0): ProgressionEntry {
  return {
    id,
    date,
    startsAt: debut,
    endsAt: fin,
    title: `Séance ${id}`,
    contentHtml: "",
    programElements: "",
    category: "",
    themes: [],
    isPublished: true,
    homework: Array.from({ length: devoirs }, (_, rang) => ({
      id: `${id}-${rang}`,
      description: "Exercices",
      dueDate: "",
      mode: "papier" as const,
      durationMinutes: null,
    })),
    attachmentCount: 0,
  };
}

describe("sessionMinutes", () => {
  it("compte une séance ordinaire", () => {
    expect(sessionMinutes("08:00", "09:00")).toBe(60);
    expect(sessionMinutes("09:30", "10:25")).toBe(55);
  });

  it("accepte les horaires venus de la base, avec les secondes", () => {
    expect(sessionMinutes("08:00:00", "09:30:00")).toBe(90);
  });

  it("rend zéro plutôt qu’un négatif quand la fin précède le début", () => {
    // Une saisie fautive ne doit pas faire mentir le total de la période en
    // retranchant des heures aux autres séances.
    expect(sessionMinutes("10:00", "09:00")).toBe(0);
  });

  it("rend zéro sur un horaire absent ou absurde", () => {
    expect(sessionMinutes("", "09:00")).toBe(0);
    expect(sessionMinutes("08:00", "")).toBe(0);
    expect(sessionMinutes("99:99", "09:00")).toBe(0);
    expect(sessionMinutes("huit heures", "neuf heures")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("écrit les heures comme un relevé de service", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(180)).toBe("3 h");
    expect(formatDuration(1110)).toBe("18 h 30");
  });

  it("garde deux chiffres aux minutes", () => {
    expect(formatDuration(65)).toBe("1 h 05");
  });

  it("ne descend jamais sous zéro", () => {
    expect(formatDuration(-30)).toBe("0 min");
  });
});

describe("groupByPeriod", () => {
  const periodes: PeriodBounds[] = [
    { id: "t1", label: "1er trimestre", startsOn: "2026-09-01", endsOn: "2026-12-15" },
    { id: "t2", label: "2e trimestre", startsOn: "2027-01-05", endsOn: "2027-03-31" },
  ];

  it("range chaque séance dans sa période", () => {
    const blocs = groupByPeriod(
      [seance("a", "2026-09-10"), seance("b", "2026-11-20"), seance("c", "2027-02-02")],
      periodes,
    );
    expect(blocs.map((bloc) => bloc.label)).toEqual(["1er trimestre", "2e trimestre"]);
    expect(blocs[0].entries.map((item) => item.id)).toEqual(["a", "b"]);
    expect(blocs[1].entries.map((item) => item.id)).toEqual(["c"]);
  });

  it("inclut les bornes", () => {
    const blocs = groupByPeriod([seance("a", "2026-09-01"), seance("b", "2026-12-15")], periodes);
    expect(blocs[0].entries).toHaveLength(2);
  });

  it("ne perd aucune séance tombée entre deux périodes", () => {
    // Les vacances de Noël ne sont dans aucun trimestre ; un rattrapage qui s'y
    // tiendrait disparaîtrait du tableau si on l'oubliait.
    const blocs = groupByPeriod([seance("a", "2026-09-10"), seance("x", "2026-12-22")], periodes);
    expect(blocs.map((bloc) => bloc.label)).toEqual(["1er trimestre", "Hors période déclarée"]);
    expect(blocs[1].entries.map((item) => item.id)).toEqual(["x"]);
  });

  it("ne compte pas deux fois une séance quand deux périodes se chevauchent", () => {
    const chevauchantes: PeriodBounds[] = [
      { id: "a", label: "Trimestre", startsOn: "2026-09-01", endsOn: "2026-12-15" },
      { id: "b", label: "Palier", startsOn: "2026-09-01", endsOn: "2026-10-31" },
    ];
    const blocs = groupByPeriod([seance("a", "2026-09-10")], chevauchantes);
    const total = blocs.reduce((somme, bloc) => somme + bloc.entries.length, 0);
    expect(total).toBe(1);
  });

  it("tient dans un seul bloc quand l’école n’a pas saisi ses dates", () => {
    const sansDates: PeriodBounds[] = [
      { id: "t1", label: "1er trimestre", startsOn: "", endsOn: "" },
    ];
    const blocs = groupByPeriod([seance("a", "2026-09-10")], sansDates);
    expect(blocs).toHaveLength(1);
    expect(blocs[0].label).toBe("Année scolaire");
  });

  it("ne montre pas les périodes vides", () => {
    const blocs = groupByPeriod([seance("c", "2027-02-02")], periodes);
    expect(blocs.map((bloc) => bloc.label)).toEqual(["2e trimestre"]);
  });

  it("rend une liste vide quand il n’y a rien à montrer", () => {
    expect(groupByPeriod([], periodes)).toEqual([]);
    expect(groupByPeriod([], [])).toEqual([]);
  });

  it("totalise les heures et les travaux donnés", () => {
    const blocs = groupByPeriod(
      [
        seance("a", "2026-09-10", "08:00", "09:00", 2),
        seance("b", "2026-09-17", "08:00", "09:30", 1),
      ],
      periodes,
    );
    expect(blocs[0].minutes).toBe(150);
    expect(formatDuration(blocs[0].minutes)).toBe("2 h 30");
    expect(blocs[0].homeworkCount).toBe(3);
  });
});
