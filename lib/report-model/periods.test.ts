import { describe, expect, it } from "vitest";
import { paliersOfTerm, planPeriods, reportTitleFor } from "./periods";

describe("découpage par trimestres", () => {
  it("crée trois trimestres et rien d’autre", () => {
    const periods = planPeriods("trimester");
    expect(periods).toHaveLength(3);
    expect(periods.map((p) => p.label)).toEqual([
      "1er trimestre",
      "2e trimestre",
      "3e trimestre",
    ]);
    expect(periods.every((p) => p.kind === "trimester")).toBe(true);
  });

  /**
   * Un établissement en trimestres délivre son troisième bulletin trimestriel
   * en fin d'année : lui ajouter un « bilan annuel » lui ferait produire deux
   * documents pour la même période.
   */
  it("ne crée pas de bilan annuel", () => {
    expect(planPeriods("trimester").some((p) => p.kind === "annual")).toBe(false);
  });
});

describe("découpage par paliers", () => {
  it("garde les trimestres et y loge six paliers, plus le bilan annuel", () => {
    const periods = planPeriods("palier");
    expect(periods.filter((p) => p.kind === "trimester")).toHaveLength(3);
    expect(periods.filter((p) => p.kind === "palier")).toHaveLength(6);
    expect(periods.filter((p) => p.kind === "annual")).toHaveLength(1);
  });

  /**
   * La numérotation court sur l'année entière et ne repart pas à 1 à chaque
   * trimestre : « palier 3 » doit désigner la même période d'un établissement
   * à l'autre, comme sur le bulletin papier.
   */
  it("numérote les paliers de 1 à 6 sur l’année", () => {
    const paliers = planPeriods("palier").filter((p) => p.kind === "palier");
    expect(paliers.map((p) => p.label)).toEqual([
      "Palier 1", "Palier 2", "Palier 3", "Palier 4", "Palier 5", "Palier 6",
    ]);
  });

  it("rattache chaque palier à son trimestre", () => {
    const periods = planPeriods("palier");
    expect(paliersOfTerm(periods, 1).map((p) => p.label)).toEqual(["Palier 1", "Palier 2"]);
    expect(paliersOfTerm(periods, 2).map((p) => p.label)).toEqual(["Palier 3", "Palier 4"]);
    expect(paliersOfTerm(periods, 3).map((p) => p.label)).toEqual(["Palier 5", "Palier 6"]);
  });

  it("accepte un autre nombre de paliers par trimestre", () => {
    const paliers = planPeriods("palier", 3).filter((p) => p.kind === "palier");
    expect(paliers).toHaveLength(9);
    expect(paliers[8].termNumber).toBe(3);
  });

  it("refuse un nombre de paliers absurde plutôt que d’en créer des centaines", () => {
    expect(planPeriods("palier", 0).filter((p) => p.kind === "palier")).toHaveLength(3);
    expect(planPeriods("palier", 99).filter((p) => p.kind === "palier")).toHaveLength(12);
  });
});

describe("titre du bulletin", () => {
  it("reprend le libellé de la période en majuscules", () => {
    const periods = planPeriods("palier");
    const palier3 = periods.find((p) => p.label === "Palier 3")!;
    expect(reportTitleFor(palier3)).toBe("PALIER 3");
  });

  it("nomme le bilan annuel par son nom", () => {
    const annuel = planPeriods("palier").find((p) => p.kind === "annual")!;
    expect(reportTitleFor(annuel)).toBe("BILAN ANNUEL");
  });
});
