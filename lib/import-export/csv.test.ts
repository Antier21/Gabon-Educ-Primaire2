import { describe, expect, it } from "vitest";
import {
  csvTemplate,
  exportCsv,
  importReport,
  parseCsvLine,
  validateCsvImport,
} from "./csv";
describe("imports et exports CSV", () => {
  it("analyse les champs cités et les accents", () => {
    expect(parseCsvLine('"Ondo; Antier";Élève', ";")).toEqual([
      "Ondo; Antier",
      "Élève",
    ]);
  });
  it("fournit un modèle par module", () => {
    expect(csvTemplate("students")).toContain("nom;prenom;matricule");
  });
  it("valide un fichier élèves cohérent", () => {
    const result = validateCsvImport(
      "students",
      "nom;prenom;matricule;date_naissance;classe\nOndo;Abel;M1;2013-01-01;4e A",
    );
    expect(result.validRows).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });
  it("signale chaque colonne absente", () => {
    expect(
      validateCsvImport("students", "nom;prenom\nOndo;Abel").errors.some(
        (item) => item.line === 1 && item.column === "classe",
      ),
    ).toBe(true);
  });
  it("signale la ligne et la valeur manquante", () => {
    const result = validateCsvImport(
      "students",
      "nom;prenom;matricule;date_naissance;classe\nOndo;;;2013-01-01;",
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ line: 2, column: "prenom" }),
        expect.objectContaining({ line: 2, column: "classe" }),
      ]),
    );
  });
  it("détecte les doublons internes et existants", () => {
    const csv =
      "nom;prenom;matricule;date_naissance;classe\nOndo;Abel;M1;;4e A\nMba;Élise;M1;;4e A";
    expect(
      validateCsvImport("students", csv, [{ matricule: "M2" }]).duplicates,
    ).toBe(1);
    expect(
      validateCsvImport("students", csv, [{ matricule: "M1" }]).duplicates,
    ).toBe(2);
  });
  it("refuse les coefficients invalides", () => {
    const result = validateCsvImport(
      "subjects",
      "code;libelle;coefficient;heures_semaine\nFR;Français;0;5",
    );
    expect(result.errors[0]).toMatchObject({ column: "coefficient", line: 2 });
  });
  it("exporte en UTF-8 avec échappement", () => {
    const csv = exportCsv([{ nom: 'Ondo "Antier"', classe: "5e" }]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Ondo ""Antier"""');
  });
  it("génère un rapport explicite", () => {
    const preview = validateCsvImport(
      "students",
      "nom;prenom;matricule;date_naissance;classe\nOndo;Abel;M1;;4e A",
    );
    expect(importReport(preview)).toMatchObject({
      total: 1,
      valid: 1,
      invalid: 0,
    });
  });
});
