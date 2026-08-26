import { describe, expect, it } from "vitest";
import {
  formatDayLong,
  formatDayShort,
  formatWeekRange,
  fromISODate,
  shiftWeek,
  shortTime,
  toISODate,
  weekdayOf,
  weekDays,
  weekStart,
} from "./week";

describe("toISODate", () => {
  it("ne bascule pas la veille à cause du temps universel", () => {
    // Le piège : « toISOString » sur une date locale du 24 à 00h30 au Gabon
    // (UTC+1) rendrait le 23. La séance changerait alors de semaine.
    const minuit = new Date(2026, 7, 24, 0, 30, 0);
    expect(toISODate(minuit)).toBe("2026-08-24");
  });

  it("complète le mois et le jour sur deux chiffres", () => {
    expect(toISODate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  it("fait l’aller-retour sans perte", () => {
    expect(toISODate(fromISODate("2026-08-26"))).toBe("2026-08-26");
  });
});

describe("weekStart", () => {
  it("trouve le lundi depuis n’importe quel jour de la semaine", () => {
    // Le 26 août 2026 est un mercredi ; son lundi est le 24.
    for (const jour of [24, 25, 26, 27, 28, 29]) {
      expect(toISODate(weekStart(new Date(2026, 7, jour, 12)))).toBe("2026-08-24");
    }
  });

  it("rattache le dimanche à la semaine qui s’achève", () => {
    // Un enseignant qui prépare son cahier le dimanche soir pense encore à la
    // semaine écoulée.
    expect(toISODate(weekStart(new Date(2026, 7, 30, 20)))).toBe("2026-08-24");
  });

  it("franchit un changement de mois", () => {
    expect(toISODate(weekStart(new Date(2026, 8, 2, 12)))).toBe("2026-08-31");
  });
});

describe("weekDays", () => {
  it("rend six jours, du lundi au samedi", () => {
    const jours = weekDays(fromISODate("2026-08-24"));
    expect(jours).toHaveLength(6);
    expect(toISODate(jours[0])).toBe("2026-08-24");
    expect(toISODate(jours[5])).toBe("2026-08-29");
  });

  it("franchit la fin du mois sans trou", () => {
    const jours = weekDays(fromISODate("2026-08-31")).map(toISODate);
    expect(jours).toEqual([
      "2026-08-31", "2026-09-01", "2026-09-02",
      "2026-09-03", "2026-09-04", "2026-09-05",
    ]);
  });
});

describe("shiftWeek", () => {
  it("avance et recule d’une semaine pleine", () => {
    const lundi = fromISODate("2026-08-24");
    expect(toISODate(shiftWeek(lundi, 1))).toBe("2026-08-31");
    expect(toISODate(shiftWeek(lundi, -1))).toBe("2026-08-17");
  });

  it("franchit une fin d’année", () => {
    expect(toISODate(shiftWeek(fromISODate("2026-12-28"), 1))).toBe("2027-01-04");
  });
});

describe("weekdayOf", () => {
  it("compte à partir du lundi, comme la base", () => {
    // « getDay » compte à partir du dimanche : confondre les deux décalerait
    // tout l'emploi du temps d'une journée.
    expect(weekdayOf(fromISODate("2026-08-24"))).toBe(1);
    expect(weekdayOf(fromISODate("2026-08-29"))).toBe(6);
    expect(weekdayOf(fromISODate("2026-08-30"))).toBe(7);
  });
});

describe("libellés", () => {
  it("écrit le jour en toutes lettres", () => {
    expect(formatDayLong(fromISODate("2026-08-26"))).toBe("mercredi 26 août");
  });

  it("abrège pour un en-tête de colonne", () => {
    expect(formatDayShort(fromISODate("2026-08-24"))).toBe("lun. 24/08");
  });

  it("ne répète pas un mois identique", () => {
    expect(formatWeekRange(fromISODate("2026-08-24"))).toBe("du 24 au 29 août 2026");
  });

  it("nomme les deux mois quand la semaine les chevauche", () => {
    expect(formatWeekRange(fromISODate("2026-08-31"))).toBe(
      "du 31 août au 5 septembre 2026",
    );
  });
});

describe("shortTime", () => {
  it("réduit l’heure de la base à ses heures et minutes", () => {
    expect(shortTime("09:30:00")).toBe("09:30");
    expect(shortTime(null)).toBe("");
  });
});
