import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  badgeLabel,
  countFresh,
  markTabSeen,
  readSeenMarks,
  seenKey,
} from "./freshness";

const VISITE = "2026-08-20T08:00:00.000Z";

/**
 * Les tests tournent en environnement Node : `window` n'y existe pas. On le
 * simule au plus près de ce que le module utilise réellement, comme le fait
 * déjà le journal d'audit.
 */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  clear() {
    this.data.clear();
  }
}

describe("comptage des nouveautés", () => {
  it("ne compte que ce qui est postérieur à la dernière consultation", () => {
    const dates = [
      "2026-08-19T10:00:00.000Z", // avant
      "2026-08-20T09:00:00.000Z", // après
      "2026-08-21T07:00:00.000Z", // après
    ];
    expect(countFresh(dates, VISITE)).toBe(2);
  });

  /**
   * Sept pastilles à la première connexion apprendraient au parent à ne plus
   * les regarder. Le premier passage pose le repère, il ne signale rien.
   */
  it("ne signale rien tant qu'aucun repère n'existe", () => {
    expect(countFresh(["2026-08-21T07:00:00.000Z"], null)).toBe(0);
    expect(countFresh(["2026-08-21T07:00:00.000Z"], undefined)).toBe(0);
    expect(countFresh(["2026-08-21T07:00:00.000Z"], "")).toBe(0);
  });

  it("ignore les dates vides ou illisibles sans fausser le compte", () => {
    const dates = ["", null, undefined, "pas une date", "2026-08-21T07:00:00.000Z"];
    expect(countFresh(dates, VISITE)).toBe(1);
  });

  it("ne compte pas un élément daté exactement de la consultation", () => {
    expect(countFresh([VISITE], VISITE)).toBe(0);
  });

  it("repart de zéro si le repère lui-même est illisible", () => {
    expect(countFresh(["2026-08-21T07:00:00.000Z"], "repère cassé")).toBe(0);
  });
});

describe("libellé de la pastille", () => {
  it("n’affiche rien quand il n’y a rien de neuf", () => {
    expect(badgeLabel(0)).toBe("");
    expect(badgeLabel(-3)).toBe("");
  });

  it("affiche le compte exact jusqu’à neuf", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(9)).toBe("9");
  });

  it("abrège au-delà, pour tenir sur un téléphone", () => {
    expect(badgeLabel(10)).toBe("9+");
    expect(badgeLabel(34)).toBe("9+");
  });
});

describe("repères de consultation", () => {
  let stockage: MemoryStorage;

  beforeEach(() => {
    stockage = new MemoryStorage();
    vi.stubGlobal("window", { localStorage: stockage });
  });

  it("sépare les enfants et les onglets", () => {
    expect(seenKey("enfant-1", "scores")).not.toBe(seenKey("enfant-2", "scores"));
    expect(seenKey("enfant-1", "scores")).not.toBe(seenKey("enfant-1", "results"));
  });

  it("enregistre puis relit un repère", () => {
    const now = new Date("2026-08-25T10:00:00.000Z");
    const marks = markTabSeen({}, "enfant-1", "scores", now);
    expect(marks[seenKey("enfant-1", "scores")]).toBe(now.toISOString());
    expect(readSeenMarks()).toEqual(marks);
  });

  it("conserve les repères des autres onglets", () => {
    const premier = markTabSeen({}, "enfant-1", "scores", new Date("2026-08-24T10:00:00.000Z"));
    const second = markTabSeen(premier, "enfant-1", "results", new Date("2026-08-25T10:00:00.000Z"));
    expect(Object.keys(second)).toHaveLength(2);
    expect(second[seenKey("enfant-1", "scores")]).toBe("2026-08-24T10:00:00.000Z");
  });

  /**
   * Un stockage corrompu par une ancienne version ne doit pas priver le
   * parent de son espace : on repart d'une table vide.
   */
  it("survit à un stockage illisible", () => {
    stockage.setItem("gabon-educ.famille.dernieres-consultations", "{ceci n'est pas du json");
    expect(readSeenMarks()).toEqual({});
  });

  it("ignore une table dont les valeurs ne sont pas des dates", () => {
    stockage.setItem(
      "gabon-educ.famille.dernieres-consultations",
      JSON.stringify({ "enfant-1:scores": 42, "enfant-1:results": "2026-08-25T10:00:00.000Z" }),
    );
    expect(readSeenMarks()).toEqual({ "enfant-1:results": "2026-08-25T10:00:00.000Z" });
  });
});
