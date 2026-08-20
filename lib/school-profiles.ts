import { PRODUCT, PRODUCT_EDITION, productAllowsSchoolType } from "@/lib/product-edition";

export type SchoolProfileKey =
  | "primary-school"
  | "secondary-school";

export type SchoolEducationLevel =
  | "primary"
  | "middle_school"
  | "high_school"
  | "complex_school";

export type SchoolSector = "public" | "private";

export type SchoolProfileOption = {
  key: SchoolProfileKey;
  group: "primary" | "secondary";
  label: string;
  shortLabel: string;
  schoolType: SchoolEducationLevel;
  schoolSector: SchoolSector;
  description: string;
};

const ALL_SCHOOL_PROFILE_OPTIONS: SchoolProfileOption[] = [
  { key: "primary-school", group: "primary", label: "Maternelle et primaire", shortLabel: "Primaire", schoolType: "primary", schoolSector: "private", description: "Établissement maternel et primaire : Petite Section à 5e Année." },
  { key: "secondary-school", group: "secondary", label: "Secondaire", shortLabel: "Secondaire", schoolType: "complex_school", schoolSector: "private", description: "Établissement secondaire : 6e à Terminale." },
];

export const SCHOOL_PROFILE_OPTIONS: SchoolProfileOption[] = ALL_SCHOOL_PROFILE_OPTIONS
  .filter((option) => productAllowsSchoolType(option.schoolType));

export const SCHOOL_TYPE_LABELS: Record<SchoolEducationLevel, string> = {
  primary: "École primaire",
  middle_school: "Collège d’enseignement général",
  high_school: "Lycée d’enseignement général",
  complex_school: "Complexe scolaire",
};

export const SCHOOL_SECTOR_LABELS: Record<SchoolSector, string> = { public: "Public", private: "Privé" };

export const PRESCHOOL_LEVELS = ["Petite Section", "Moyenne Section", "Grande Section"] as const;
export const PRIMARY_ELEMENTARY_LEVELS = ["1ère Année", "2e Année", "3e Année", "4e Année", "5e Année"] as const;

export const DEFAULT_LEVELS_BY_SCHOOL_TYPE: Record<SchoolEducationLevel, string[]> = {
  primary: [...PRESCHOOL_LEVELS, ...PRIMARY_ELEMENTARY_LEVELS],
  middle_school: ["6e", "5e", "4e", "3e"],
  high_school: ["2nde", "1re", "Terminale"],
  complex_school: ["1ère Année", "2e Année", "3e Année", "4e Année", "5e Année", "6e", "5e", "4e", "3e", "2nde", "1re", "Terminale"],
};

const LEVEL_ALIASES: Record<string, string> = {
  ps: "Petite Section", petitesection: "Petite Section",
  ms: "Moyenne Section", moyennesection: "Moyenne Section",
  gs: "Grande Section", grandesection: "Grande Section",
  // Anciennes appellations : conservées pour que les données déjà saisies
  // (classes, bulletins, imports) continuent de se rattacher au bon niveau.
  cp: "1ère Année", cp1: "1ère Année", cp2: "1ère Année", ce1: "2e Année",
  ce2: "3e Année", cm1: "4e Année", cm2: "5e Année",
  // Appellations actuelles, avec et sans accents, telles que les tape un utilisateur.
  "1ereannee": "1ère Année", "1reannee": "1ère Année", "1ereanneescolaire": "1ère Année",
  "2eannee": "2e Année", "2emeannee": "2e Année",
  "3eannee": "3e Année", "3emeannee": "3e Année",
  "4eannee": "4e Année", "4emeannee": "4e Année",
  "5eannee": "5e Année", "5emeannee": "5e Année",
  // Compatibilité avec la valeur erronée des versions antérieures : elle est
  // rabattue sur la dernière classe réelle du primaire et n'est jamais proposée.
  "6eannee": "5e Année", "6emeannee": "5e Année",
  "6e": "6e", "6eme": "6e", "6ème": "6e",
  "5e": "5e", "5eme": "5e", "5ème": "5e",
  "4e": "4e", "4eme": "4e", "4ème": "4e",
  "3e": "3e", "3eme": "3e", "3ème": "3e",
  "2nde": "2nde", seconde: "2nde", "2de": "2nde",
  "1re": "1re", premiere: "1re", "première": "1re",
  terminale: "Terminale", tle: "Terminale",
};

export function normalizeSchoolLevel(value?: string | null) {
  const raw = String(value || "").trim();
  const simplified = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
  return LEVEL_ALIASES[raw.toLowerCase()] || LEVEL_ALIASES[simplified] || raw;
}

export function isLevelAllowedForSchoolType(code: string, type?: string | null) {
  return getDefaultLevelsForSchoolType(type).includes(normalizeSchoolLevel(code));
}

export function isPreschoolLevel(level?: string | null) {
  return PRESCHOOL_LEVELS.includes(normalizeSchoolLevel(level) as (typeof PRESCHOOL_LEVELS)[number]);
}

export function filterLevelsForSchoolType<T extends { code: string }>(levels: T[], type?: string | null) {
  const allowed = new Set(getDefaultLevelsForSchoolType(type));
  const seen = new Set<string>();
  return levels.filter((level) => {
    const normalized = normalizeSchoolLevel(level.code);
    if (!allowed.has(normalized) || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function getSchoolProfileByKey(key?: string | null) {
  return SCHOOL_PROFILE_OPTIONS.find((item) => item.key === key) || null;
}

export function getDefaultSchoolProfile() {
  return getSchoolProfileByKey(PRODUCT.defaultProfileKey) || SCHOOL_PROFILE_OPTIONS[0];
}

export function normalizeSchoolType(value?: string | null): SchoolEducationLevel {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "primary" || raw === "primaire" || raw === "ecole primaire" || raw === "école primaire") return "primary";
  if (raw === "middle_school" || raw === "college" || raw === "collège" || raw === "college general" || raw === "collège général") return PRODUCT_EDITION === "secondary" ? "complex_school" : "middle_school";
  if (raw === "high_school" || raw === "lycee" || raw === "lycée" || raw === "lycee general" || raw === "lycée général") return PRODUCT_EDITION === "secondary" ? "complex_school" : "high_school";
  if (raw === "secondary" || raw === "secondaire") return "complex_school";
  if (raw === "complex_school" || raw === "school_complex" || raw === "complexe" || raw === "complexe scolaire") return "complex_school";
  return PRODUCT.defaultSchoolType;
}

export function normalizeSchoolSector(value?: string | null): SchoolSector { return value === "public" ? "public" : "private"; }
export function getDefaultLevelsForSchoolType(type?: string | null) {
  const normalized = normalizeSchoolType(type);
  if (normalized === "complex_school") {
    return PRODUCT_EDITION === "primary"
      ? DEFAULT_LEVELS_BY_SCHOOL_TYPE.primary
      : [...DEFAULT_LEVELS_BY_SCHOOL_TYPE.middle_school, ...DEFAULT_LEVELS_BY_SCHOOL_TYPE.high_school];
  }
  return DEFAULT_LEVELS_BY_SCHOOL_TYPE[normalized];
}

export const PRESCHOOL_LEARNING_DOMAINS = [
  "Langage et communication",
  "Premiers outils mathématiques",
  "Explorer le monde",
  "Activités physiques et motricité",
  "Activités artistiques",
  "Vivre ensemble et autonomie",
] as const;

export const DEFAULT_SUBJECTS_BY_SCHOOL_TYPE: Record<SchoolEducationLevel, string[]> = {
  primary: [
    ...PRESCHOOL_LEARNING_DOMAINS,
    "Français",
    "Mathématiques",
    "Éducation scientifique et technologique",
    "Histoire",
    "Géographie",
    "Éducation civique et morale",
    "Anglais",
    "Informatique / TIC",
    "Éducation physique et sportive",
    "Éducation artistique",
    "Dessin / Arts plastiques",
    "Chant / Musique",
    "EDM / EAS",
  ],
  middle_school: ["Français", "Mathématiques", "Anglais", "Histoire-Géographie", "Instruction civique", "SVT", "Physique-Chimie", "Éducation physique et sportive", "Espagnol"],
  high_school: ["Français", "Mathématiques", "Anglais", "Histoire-Géographie", "Instruction civique", "SVT", "Physique-Chimie", "Éducation physique et sportive", "Espagnol", "Philosophie"],
  complex_school: ["Français", "Anglais", "Mathématiques", "EDM / EAS", "Éducation à la citoyenneté", "Informatique / TIC", "Dessin", "EPS", "Histoire-Géographie", "Instruction civique", "SVT", "Physique-Chimie", "Espagnol", "Philosophie"],
};

export function getDefaultSubjectsForSchoolType(type?: string | null) {
  const normalized = normalizeSchoolType(type);
  if (normalized === "complex_school") {
    return PRODUCT_EDITION === "primary"
      ? DEFAULT_SUBJECTS_BY_SCHOOL_TYPE.primary
      : Array.from(new Set([...DEFAULT_SUBJECTS_BY_SCHOOL_TYPE.middle_school, ...DEFAULT_SUBJECTS_BY_SCHOOL_TYPE.high_school]));
  }
  return DEFAULT_SUBJECTS_BY_SCHOOL_TYPE[normalized];
}
export function getDefaultSubjectsForLevel(level?: string | null) {
  return isPreschoolLevel(level)
    ? [...PRESCHOOL_LEARNING_DOMAINS]
    : DEFAULT_SUBJECTS_BY_SCHOOL_TYPE.primary.filter((subject) => !PRESCHOOL_LEARNING_DOMAINS.includes(subject as (typeof PRESCHOOL_LEARNING_DOMAINS)[number]));
}
export function formatSchoolProfile(type?: string | null, sector?: string | null) {
  void sector;
  return normalizeSchoolType(type) === "primary" ? "Primaire" : "Secondaire";
}
export function levelCycleForCode(code: string) {
  const normalized = normalizeSchoolLevel(code);
  if (isPreschoolLevel(normalized)) return "Maternelle";
  if (DEFAULT_LEVELS_BY_SCHOOL_TYPE.primary.includes(normalized)) return "Primaire";
  return "Secondaire";
}
