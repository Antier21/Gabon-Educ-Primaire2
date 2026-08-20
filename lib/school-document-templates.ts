import type { DocumentKind, SchoolEducationLevel, SchoolProfile, StudentRecord } from "@/lib/platform/types";
import { formatSchoolProfile, isPreschoolLevel, normalizeSchoolType } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";

export type SchoolDocumentTemplateKey =
  | "student_identification"
  | "preschool_progress_report"
  | "primary_annual_report"
  | "secondary_term_report";

export type SchoolDocumentTemplate = {
  key: SchoolDocumentTemplateKey;
  label: string;
  description: string;
  documentKind: DocumentKind;
  cycles: SchoolEducationLevel[];
};

export const SCHOOL_DOCUMENT_TEMPLATES: SchoolDocumentTemplate[] = [
  {
    key: "preschool_progress_report",
    label: "Carnet de suivi de la maternelle",
    description: "Carnet de Petite, Moyenne et Grande Section fondé sur les niveaux de maîtrise, sans note numérique ni classement.",
    documentKind: "report_card",
    cycles: ["primary"],
  },
  {
    key: "student_identification",
    label: "Fiche d’identification de l’élève",
    description:
      "Fiche administrative inspirée du modèle SOSUP : identité, parents, établissement, ordre d’enseignement et signatures.",
    documentKind: "student_record",
    cycles: ["primary", "middle_school", "high_school", "complex_school"],
  },
  {
    key: "primary_annual_report",
    label: "Bulletin annuel du primaire",
    description:
      "Modèle annuel sur 10 avec paliers, domaines, niveaux de maîtrise, total, moyenne, rang et appréciation.",
    documentKind: "report_card",
    cycles: ["primary", "complex_school"],
  },
  {
    key: "secondary_term_report",
    label: "Bulletin trimestriel du secondaire général",
    description:
      "Modèle du secondaire avec matières, coefficients, rangs, moyennes, absences, appréciations et signatures.",
    documentKind: "report_card",
    cycles: ["middle_school", "high_school", "complex_school"],
  },
];

export function getTemplatesForSchoolType(type?: string | null) {
  const normalized = normalizeSchoolType(type);
  return SCHOOL_DOCUMENT_TEMPLATES.filter((template) =>
    template.key === "student_identification" ||
    (PRODUCT.edition === "primary" && template.key === "preschool_progress_report") ||
    (template.key === PRODUCT.bulletinTemplate && template.cycles.includes(normalized)),
  );
}

export function getTemplateByKey(key?: string | null) {
  return (
    SCHOOL_DOCUMENT_TEMPLATES.find((template) => template.key === key) ||
    SCHOOL_DOCUMENT_TEMPLATES[0]
  );
}

export function getPrimaryReportTemplateForLevel(level?: string | null) {
  return getTemplateByKey(
    isPreschoolLevel(level)
      ? "preschool_progress_report"
      : "primary_annual_report",
  );
}

export function masteryFromAverage(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  if (value >= 8) return "A";
  if (value >= 5) return "B";
  if (value >= 2) return "C";
  return "D";
}

export function masteryLabel(letter: string) {
  if (letter === "A") return "Maîtrise maximale";
  if (letter === "B") return "Maîtrise minimale";
  if (letter === "C") return "Maîtrise partielle";
  if (letter === "D") return "Maîtrise insuffisante";
  return "Non évalué";
}

export function isPrimaryLevel(level: string) {
  return /^(CP|CP1|CP2|CE1|CE2|CM1|CM2|[1-5]\s*[eè]?(re|me)?\s*ann[ée]e)/i.test(level.trim());
}

// Les niveaux du primaire s'appellent « 1ère Année » … « 5e Année ».
// Cette fonction ne sert plus qu'à rattraper les données saisies sous les
// anciennes appellations, qui peuvent subsister dans d'anciens bulletins.
export function primaryLevelAlias(level: string) {
  const aliases: Record<string, string> = {
    CP: "1ère Année",
    CP1: "1ère Année",
    CP2: "1ère Année",
    CE1: "2e Année",
    CE2: "3e Année",
    CM1: "4e Année",
    CM2: "5e Année",
    "6e Année": "5e Année",
  };
  return aliases[level] || level;
}

export function formatDateFr(value?: string | null) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fr-FR").format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

export function buildSchoolDocumentPayload(input: {
  templateKey: SchoolDocumentTemplateKey;
  school: SchoolProfile | null;
  student?: StudentRecord | null;
  className?: string;
  academicYear?: string;
  issuedAt: string;
}) {
  const template = getTemplateByKey(input.templateKey);
  const studentName = input.student
    ? `${input.student.lastName} ${input.student.firstName}`.trim()
    : "";
  const className = input.className || "—";
  const schoolName = input.school?.name || "Établissement";
  const schoolProfile = input.school
    ? formatSchoolProfile(input.school.schoolType, input.school.schoolSector)
    : "Profil non configuré";
  return {
    templateKey: template.key,
    templateLabel: template.label,
    documentKind: template.documentKind,
    schoolName,
    schoolProfile,
    schoolAddress: input.school?.address || "",
    schoolPhone: input.school?.phone || "",
    schoolEmail: input.school?.email || "",
    schoolHeadName: input.school?.headName || "",
    studentName,
    studentFirstName: input.student?.firstName || "",
    studentLastName: input.student?.lastName || "",
    studentRegistrationNumber: input.student?.registrationNumber || "",
    studentGender: input.student?.gender || "",
    studentBirthDate: input.student?.dateOfBirth || "",
    studentBirthPlace: input.student?.placeOfBirth || "",
    studentNationality: input.student?.nationality || "Gabonaise",
    studentPhone: input.student?.phone || "",
    studentEmail: input.student?.email || "",
    studentAddress: input.student?.address || "",
    emergencyContact: input.student?.emergencyContact || "",
    className,
    classLevelAlias: primaryLevelAlias(className.split(" ")[0] || className),
    academicYear: input.academicYear || "—",
    issuedAt: input.issuedAt,
    disclaimer:
      "Modèle de travail inspiré des documents fournis. Il reste configurable par l’établissement avant usage officiel.",
  };
}
