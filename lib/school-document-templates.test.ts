import { describe, expect, it } from "vitest";
import { getPrimaryReportTemplateForLevel } from "./school-document-templates";

describe("documents du primaire", () => {
  it("sélectionne automatiquement le carnet de suivi pour la maternelle", () => {
    expect(getPrimaryReportTemplateForLevel("Petite Section").key).toBe(
      "preschool_progress_report",
    );
    expect(getPrimaryReportTemplateForLevel("GS").key).toBe(
      "preschool_progress_report",
    );
  });

  it("conserve le bulletin sur 10 pour la 1ère à la 5e Année", () => {
    expect(getPrimaryReportTemplateForLevel("1ère Année").key).toBe(
      "primary_annual_report",
    );
    expect(getPrimaryReportTemplateForLevel("5e Année").key).toBe(
      "primary_annual_report",
    );
  });
});
