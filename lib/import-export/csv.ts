export type ImportModule =
  | "students"
  | "guardians"
  | "teachers"
  | "classes"
  | "subjects"
  | "scores"
  | "attendance"
  | "timetable";
export type ImportError = {
  line: number;
  column: string;
  value: string;
  problem: string;
  expected: string;
};
export type ImportPreview = {
  module: ImportModule;
  headers: string[];
  rows: Array<Record<string, string>>;
  validRows: Array<Record<string, string>>;
  errors: ImportError[];
  duplicates: number;
  separator: ";" | ",";
};
const schemas: Record<
  ImportModule,
  { headers: string[]; required: string[]; unique: string[] }
> = {
  students: {
    headers: ["nom", "prenom", "matricule", "date_naissance", "classe"],
    required: ["nom", "prenom", "classe"],
    unique: ["matricule"],
  },
  guardians: {
    headers: ["nom", "prenom", "telephone", "email", "matricule_eleve", "lien"],
    required: ["nom", "prenom", "telephone", "matricule_eleve"],
    unique: ["telephone"],
  },
  teachers: {
    headers: ["nom", "prenom", "email", "telephone", "role"],
    required: ["nom", "prenom", "email"],
    unique: ["email"],
  },
  classes: {
    headers: ["nom", "niveau", "salle", "annee_scolaire"],
    required: ["nom", "niveau", "annee_scolaire"],
    unique: ["nom"],
  },
  subjects: {
    headers: ["code", "libelle", "coefficient", "heures_semaine"],
    required: ["code", "libelle", "coefficient"],
    unique: ["code"],
  },
  scores: {
    headers: ["matricule", "evaluation", "note", "statut", "commentaire"],
    required: ["matricule", "evaluation", "statut"],
    unique: [],
  },
  attendance: {
    headers: ["matricule", "date", "statut", "duree_minutes", "justifie"],
    required: ["matricule", "date", "statut"],
    unique: [],
  },
  timetable: {
    headers: [
      "classe",
      "jour",
      "debut",
      "fin",
      "matiere",
      "enseignant",
      "salle",
    ],
    required: ["classe", "jour", "debut", "fin", "matiere"],
    unique: [],
  },
};
export function parseCsvLine(line: string, separator: ";" | ",") {
  const cells: string[] = [];
  let value = "",
    quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) {
      cells.push(value.trim());
      value = "";
    } else value += char;
  }
  cells.push(value.trim());
  return cells;
}
const normalize = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
export function validateCsvImport(
  module: ImportModule,
  content: string,
  existing: Record<string, string>[] = [],
): ImportPreview {
  const clean = content.replace(/^\uFEFF/, "").trim();
  const first = clean.split(/\r?\n/)[0] || "";
  const separator = first.includes(";") ? (";" as const) : ("," as const);
  const lines = clean ? clean.split(/\r?\n/) : [];
  const headers = parseCsvLine(lines[0] || "", separator).map(normalize);
  const schema = schemas[module];
  const errors: ImportError[] = [];
  schema.headers.forEach((header) => {
    if (!headers.includes(header))
      errors.push({
        line: 1,
        column: header,
        value: "",
        problem: "Colonne absente",
        expected: `Ajouter la colonne « ${header} »`,
      });
  });
  const rows = lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const cells = parseCsvLine(line, separator);
      return Object.fromEntries(
        headers.map((header, index) => [header, cells[index] || ""]),
      );
    });
  const seen = new Set<string>();
  const existingKeys = new Set(
    existing.flatMap((row) =>
      schema.unique
        .map((key) => `${key}:${normalize(row[key] || "")}`)
        .filter((key) => !key.endsWith(":")),
    ),
  );
  let duplicates = 0;
  rows.forEach((row, index) => {
    const line = index + 2;
    schema.required.forEach((column) => {
      if (!row[column]?.trim())
        errors.push({
          line,
          column,
          value: row[column] || "",
          problem: "Valeur obligatoire manquante",
          expected: "Renseigner une valeur",
        });
    });
    if (
      module === "scores" &&
      row.note &&
      (!Number.isFinite(Number(row.note)) || Number(row.note) < 0)
    )
      errors.push({
        line,
        column: "note",
        value: row.note,
        problem: "Note invalide",
        expected: "Nombre positif ou champ vide selon le statut",
      });
    if (
      module === "subjects" &&
      (!Number.isFinite(Number(row.coefficient)) ||
        Number(row.coefficient) <= 0)
    )
      errors.push({
        line,
        column: "coefficient",
        value: row.coefficient,
        problem: "Coefficient invalide",
        expected: "Nombre strictement positif",
      });
    for (const key of schema.unique) {
      const value = normalize(row[key] || "");
      if (!value) continue;
      const fingerprint = `${key}:${value}`;
      if (seen.has(fingerprint) || existingKeys.has(fingerprint)) {
        duplicates += 1;
        errors.push({
          line,
          column: key,
          value: row[key],
          problem: "Doublon détecté",
          expected: "Utiliser une valeur unique ou ignorer la ligne",
        });
      }
      seen.add(fingerprint);
    }
  });
  const invalidLines = new Set(errors.map((error) => error.line));
  return {
    module,
    headers,
    rows,
    validRows: rows.filter((_, index) => !invalidLines.has(index + 2)),
    errors,
    duplicates,
    separator,
  };
}
export function csvTemplate(module: ImportModule) {
  return `\uFEFF${schemas[module].headers.join(";")}\n`;
}
export function exportCsv(
  rows: Record<string, string | number | boolean | null>[],
  headers?: string[],
) {
  const columns =
    headers || Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;
  return `\uFEFF${columns.join(";")}\n${rows.map((row) => columns.map((column) => escape(row[column])).join(";")).join("\n")}`;
}
export function importReport(preview: ImportPreview) {
  return {
    module: preview.module,
    total: preview.rows.length,
    valid: preview.validRows.length,
    invalid: preview.rows.length - preview.validRows.length,
    duplicates: preview.duplicates,
    errors: preview.errors,
    generatedAt: new Date().toISOString(),
  };
}
