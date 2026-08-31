"use client";

import { createClient } from "@/lib/supabase/client";
import { readCachedActiveSchool } from "@/lib/active-school";
import {
  normalizedScore,
  studentSubjectAverage,
  validScore,
  weightedGeneralAverage,
} from "./calculations";
import type { GradingWorkspace } from "./types";

/**
 * Relevé de notes remis en continu aux familles.
 *
 * Le bulletin fait foi et n'atteint la famille qu'une fois publié. Le relevé,
 * lui, informe : un parent doit suivre l'évolution de son enfant dès la
 * première évaluation, sans attendre la fin du trimestre.
 *
 * Les notes vivent dans grading_workspaces, que seul leur enseignant peut
 * lire. Ce module en projette une copie lisible par la famille, remise à jour
 * à chaque saisie. On y met les devoirs et les moyennes par matière, jamais
 * les appréciations : celles-ci se rédigent en fin de période et appartiennent
 * au bulletin.
 */

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StatementAssessment = {
  title: string;
  date: string;
  subject: string;
  /** Note ramenée sur le barème de l'établissement, pour être comparable. */
  score: number | null;
  rawScore: number | null;
  maxScore: number;
  coefficient: number;
  status: string;
};

export type StatementSubject = {
  subject: string;
  coefficient: number;
  average: number | null;
  assessments: StatementAssessment[];
};

export type ScoreStatement = {
  subjects: StatementSubject[];
};

export type StatementSyncResult = { synced: number; error: string };

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as Record<string, unknown>;
    return String(raw.message || raw.details || raw.hint || JSON.stringify(raw));
  }
  return "Relevé de notes non transmis.";
}

const STATUS_LABELS: Record<string, string> = {
  graded: "Noté",
  absent: "Absence justifiée",
  zero_penalty: "Absence non justifiée (0)",
  not_ranked: "Non noté",
  exempt: "Dispensé",
  not_graded: "En attente",
};

export function statusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

/**
 * Construit le relevé d'un élève pour une classe et une période.
 *
 * Exporté séparément de l'envoi : la même construction sert à l'affichage
 * immédiat dans l'application, sans attendre un aller-retour réseau.
 */
export function buildScoreStatement(
  workspace: GradingWorkspace,
  classId: string,
  periodId: string,
  studentId: string,
): { statement: ScoreStatement; generalAverage: number | null; count: number } {
  const decimals = workspace.settings.decimals ?? 2;
  const maxScore = workspace.settings.maxScore || 20;

  // Les matières sont déduites des devoirs eux-mêmes, et non de la liste
  // déclarée dans les paramètres des notes. Un enseignant peut créer un devoir
  // sans avoir déclaré la matière au préalable — l'écran le lui permet — et
  // partir de la déclaration produisait alors un relevé vide alors que des
  // notes existaient bel et bien.
  const declared = new Map<string, number>();
  for (const item of workspace.classSubjects) {
    if (
      item.classId === classId &&
      item.active &&
      (!item.periodId || item.periodId === periodId)
    )
      declared.set(item.subject, item.coefficient);
  }

  const periodAssessments = workspace.assessments.filter(
    (item) => item.classId === classId && item.periodId === periodId && item.active,
  );
  const subjectNames = Array.from(
    new Set(periodAssessments.map((item) => item.subject).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "fr"));

  const subjects = subjectNames
    .map((name) => {
      const subject = { subject: name, coefficient: declared.get(name) ?? 1 };
      const assessments = periodAssessments
        .filter((item) => item.subject === name)
        .sort((a, b) => a.date.localeCompare(b.date));

      const rows: StatementAssessment[] = assessments.map((assessment) => {
        const score = workspace.scores.find(
          (item) =>
            item.assessmentId === assessment.id && item.studentId === studentId,
        );
        const graded = score ? validScore(score) : false;
        return {
          title: assessment.title,
          date: assessment.date,
          subject: subject.subject,
          score:
            graded && score
              ? normalizedScore(score.value as number, assessment.maxScore, maxScore, decimals)
              : null,
          rawScore: graded && score ? (score.value as number) : null,
          maxScore: assessment.maxScore,
          coefficient: assessment.coefficient,
          status: score?.status || "not_graded",
        };
      });

      const { average } = studentSubjectAverage(
        studentId,
        subject.subject,
        assessments,
        workspace.scores,
        maxScore,
        decimals,
      );

      return {
        subject: subject.subject,
        coefficient: subject.coefficient,
        average,
        assessments: rows,
      } satisfies StatementSubject;
    })
    // Une matière sans aucune évaluation n'apprend rien à la famille et
    // allonge inutilement le relevé.
    .filter((subject) => subject.assessments.length > 0);

  const generalAverage = weightedGeneralAverage(
    subjects.map((item) => ({ average: item.average, coefficient: item.coefficient })),
    decimals,
  );
  const count = subjects.reduce(
    (total, subject) =>
      total + subject.assessments.filter((item) => item.score !== null).length,
    0,
  );

  return { statement: { subjects }, generalAverage, count };
}

/**
 * Transmet le relevé de toute une classe.
 *
 * Les élèves sont envoyés en une seule requête : une classe de soixante n'est
 * qu'une ligne de plus dans le même appel. Un élève dont le dossier n'est pas
 * encore synchronisé est ignoré sans bruit — il n'a pas d'identifiant cloud,
 * donc aucun espace famille ne peut le désigner.
 */
export async function syncScoreStatements(args: {
  workspace: GradingWorkspace;
  classId: string;
  periodId: string;
  periodLabel: string;
  students: Array<{ id: string }>;
}): Promise<StatementSyncResult> {
  const { workspace, classId, periodId, periodLabel, students } = args;
  if (!uuidPattern.test(classId) || !periodId) return { synced: 0, error: "" };

  const client = createClient();
  const { data: auth } = await client.auth.getUser();
  const userId = auth.user?.id || "";
  if (!userId) return { synced: 0, error: "" };

  const schoolId = readCachedActiveSchool()?.id || null;
  const maxScore = workspace.settings.maxScore || 20;

  const rows = students
    .filter((student) => uuidPattern.test(student.id))
    .map((student) => {
      const built = buildScoreStatement(workspace, classId, periodId, student.id);
      return {
        school_id: schoolId,
        class_group_id: classId,
        class_student_id: student.id,
        owner_teacher_id: userId,
        period_ref: periodId,
        period_label: periodLabel || "",
        academic_year: workspace.settings.academicYear || "",
        max_score: maxScore,
        general_average: built.generalAverage,
        assessment_count: built.count,
        statement: built.statement,
      };
    });

  if (!rows.length) return { synced: 0, error: "" };

  const { error } = await client
    .from("student_score_statements")
    .upsert(rows, { onConflict: "class_student_id,period_ref,owner_teacher_id" });
  if (error) {
    console.error("[Gabon Éduc+] Relevé de notes non transmis :", error, classId);
    return {
      synced: 0,
      error: `Note enregistrée, mais le relevé des familles n’a pas été mis à jour : ${describe(error)}`,
    };
  }
  return { synced: rows.length, error: "" };
}
