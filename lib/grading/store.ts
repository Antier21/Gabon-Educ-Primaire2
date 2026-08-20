"use client";

import { assertSubscriptionWriteAllowed } from "@/lib/subscriptions/write-guard";
import { createClient } from "@/lib/supabase/client";
import {
  readLocal,
  resolveStorageStatus,
  STORAGE_KEYS,
  withTimeout,
  writeLocal,
  type StorageMode,
} from "@/lib/storage-mode";
import type {
  ArchivedReport,
  AssessmentScore,
  GeneralComment,
  GradeAssessment,
  GradingPeriod,
  GradingRole,
  GradingWorkspace,
  ReportSnapshot,
  ReportStatus,
  SchoolSettings,
  SubjectComment,
} from "./types";
import { PRODUCT } from "@/lib/product-edition";

export const defaultSettings: SchoolSettings = {
  academicYear: "2026-2027",
  periodKind: "trimester",
  activePeriodId: "period-t1",
  maxScore: PRODUCT.maxScore,
  passThreshold: PRODUCT.passThreshold,
  decimals: 2,
  schoolName: "",
  logoUrl: "",
  address: "",
  phone: "",
  email: "",
  headName: "",
  bulletinModel: PRODUCT.bulletinLabel,
  individualMode: true,
  simulatedRole: "teacher",
};
export const defaultWorkspace: GradingWorkspace = {
  settings: defaultSettings,
  periods: [
    {
      id: "period-t1",
      label: "Trimestre 1",
      startsOn: "2026-09-01",
      endsOn: "2026-12-20",
      active: true,
      locked: false,
    },
    {
      id: "period-t2",
      label: "Trimestre 2",
      startsOn: "2027-01-05",
      endsOn: "2027-03-31",
      active: false,
      locked: false,
    },
    {
      id: "period-t3",
      label: "Trimestre 3",
      startsOn: "2027-04-01",
      endsOn: "2027-06-30",
      active: false,
      locked: false,
    },
  ],
  classSubjects: [],
  assessments: [],
  scores: [],
  attendance: [],
  subjectComments: [],
  generalComments: [],
  reports: [],
  updatedAt: "",
};

function normalizeWorkspace(
  value: Partial<GradingWorkspace> | null | undefined,
): GradingWorkspace {
  const importedSettings = { ...defaultSettings, ...value?.settings };
  return {
    ...defaultWorkspace,
    ...value,
    settings: {
      ...importedSettings,
      maxScore: PRODUCT.edition === "primary" ? 10 : importedSettings.maxScore,
      passThreshold: PRODUCT.edition === "primary" ? Math.min(5, importedSettings.passThreshold) : importedSettings.passThreshold,
      bulletinModel: PRODUCT.bulletinLabel,
    },
    periods:
      value?.periods || defaultWorkspace.periods.map((item) => ({ ...item })),
    classSubjects: value?.classSubjects || [],
    assessments: value?.assessments || [],
    scores: value?.scores || [],
    attendance: value?.attendance || [],
    subjectComments: value?.subjectComments || [],
    generalComments: value?.generalComments || [],
    reports: value?.reports || [],
  };
}
export function readGradingWorkspace() {
  return normalizeWorkspace(
    readLocal<Partial<GradingWorkspace>>(
      STORAGE_KEYS.grading,
      defaultWorkspace,
    ),
  );
}
export function periodIsLocked(workspace: GradingWorkspace, periodId: string) {
  return Boolean(
    workspace.periods.find((item) => item.id === periodId)?.locked,
  );
}
export function canEditScores(role: GradingRole) {
  return ["teacher", "head_teacher", "school_admin", "headmaster"].includes(
    role,
  );
}
export function canEditGeneralComment(role: GradingRole) {
  return ["head_teacher", "school_admin", "headmaster"].includes(role);
}
export function canLockPeriod(role: GradingRole) {
  return ["school_admin", "headmaster"].includes(role);
}

export async function loadGradingWorkspace(): Promise<{
  workspace: GradingWorkspace;
  mode: StorageMode;
  message: string;
}> {
  const local = readGradingWorkspace();
  const status = await resolveStorageStatus();
  if (status.mode !== "cloud" || !status.user)
    return { workspace: local, mode: status.mode, message: status.message };
  try {
    const { data, error } = await withTimeout(
      createClient()
        .from("grading_workspaces")
        .select("payload,updated_at")
        .eq("teacher_id", status.user.id)
        .maybeSingle(),
    );
    if (error) throw error;
    if (!data)
      return {
        workspace: local,
        mode: "cloud",
        message: "Espace notes prêt à être synchronisé",
      };
    const remote = normalizeWorkspace(
      data.payload as Partial<GradingWorkspace>,
    );
    writeLocal(STORAGE_KEYS.grading, remote);
    return {
      workspace: remote,
      mode: "cloud",
      message: "Notes et bulletins synchronisés",
    };
  } catch {
    return {
      workspace: local,
      mode: "offline",
      message: "Mode hors ligne : données scolaires préservées",
    };
  }
}
export async function saveGradingWorkspace(input: GradingWorkspace) {
  await assertSubscriptionWriteAllowed();
  const workspace = normalizeWorkspace({
    ...input,
    updatedAt: new Date().toISOString(),
  });
  writeLocal(STORAGE_KEYS.grading, workspace);
  const status = await resolveStorageStatus();
  if (status.mode !== "cloud" || !status.user)
    return { workspace, mode: status.mode };
  try {
    const { error } = await withTimeout(
      createClient().rpc("save_grading_workspace_relational", {
        p_payload: workspace,
      }),
    );
    if (error) throw error;
    return { workspace, mode: "cloud" as const };
  } catch {
    return { workspace, mode: "offline" as const };
  }
}

export function setActivePeriod(workspace: GradingWorkspace, periodId: string) {
  return {
    ...workspace,
    settings: { ...workspace.settings, activePeriodId: periodId },
    periods: workspace.periods.map((item) => ({
      ...item,
      active: item.id === periodId,
    })),
  };
}
export function upsertPeriod(
  workspace: GradingWorkspace,
  period: GradingPeriod,
) {
  return {
    ...workspace,
    periods: [
      ...workspace.periods.filter((item) => item.id !== period.id),
      period,
    ],
  };
}
export function upsertAssessment(
  workspace: GradingWorkspace,
  assessment: GradeAssessment,
) {
  if (periodIsLocked(workspace, assessment.periodId))
    throw new Error("Cette période est verrouillée.");
  return {
    ...workspace,
    assessments: [
      ...workspace.assessments.filter((item) => item.id !== assessment.id),
      assessment,
    ],
  };
}
export function upsertScore(
  workspace: GradingWorkspace,
  score: AssessmentScore,
) {
  const assessment = workspace.assessments.find(
    (item) => item.id === score.assessmentId,
  );
  if (!assessment) throw new Error("Évaluation introuvable.");
  if (periodIsLocked(workspace, assessment.periodId))
    throw new Error(
      "La période est verrouillée : les notes ne peuvent plus être modifiées.",
    );
  if (assessment.evaluationMode === "mastery") {
    if (score.value !== null)
      throw new Error(
        "Une observation de maternelle ne doit pas contenir de note numérique.",
      );
    if (score.status === "graded" && (!score.mastery || score.mastery === "not_evaluated"))
      throw new Error(
        "Sélectionnez un niveau de maîtrise pour cette observation.",
      );
  }
  if (
    assessment.evaluationMode !== "mastery" &&
    score.status === "graded" &&
    score.value !== null &&
    (score.value < 0 || score.value > assessment.maxScore)
  )
    throw new Error(
      `La note doit être comprise entre 0 et ${assessment.maxScore}.`,
    );
  return {
    ...workspace,
    scores: [
      ...workspace.scores.filter(
        (item) =>
          item.id !== score.id &&
          !(
            item.assessmentId === score.assessmentId &&
            item.studentId === score.studentId
          ),
      ),
      score,
    ],
  };
}
export function upsertSubjectComment(
  workspace: GradingWorkspace,
  comment: SubjectComment,
) {
  return {
    ...workspace,
    subjectComments: [
      ...workspace.subjectComments.filter(
        (item) =>
          !(
            item.studentId === comment.studentId &&
            item.periodId === comment.periodId &&
            item.subject === comment.subject
          ),
      ),
      comment,
    ],
  };
}
export function upsertGeneralComment(
  workspace: GradingWorkspace,
  comment: GeneralComment,
) {
  return {
    ...workspace,
    generalComments: [
      ...workspace.generalComments.filter(
        (item) =>
          !(
            item.studentId === comment.studentId &&
            item.periodId === comment.periodId
          ),
      ),
      comment,
    ],
  };
}
export function archiveReport(
  workspace: GradingWorkspace,
  snapshot: ReportSnapshot,
  status: ReportStatus,
  role: GradingRole = "teacher",
): GradingWorkspace {
  const existing = workspace.reports.find(
    (item) =>
      item.studentId === snapshot.studentId &&
      item.classId === snapshot.classId &&
      item.periodId === snapshot.periodId,
  );
  if (existing?.status === "locked" && status !== "published")
    throw new Error(
      "Ce bulletin est verrouillé. Il doit être rouvert par un rôle autorisé avant toute modification.",
    );
  const finalSnapshot = structuredClone({ ...(existing?.status === "locked" ? existing.snapshot : snapshot), status });
  const report: ArchivedReport = {
    id: existing?.id || snapshot.id,
    studentId: snapshot.studentId,
    classId: snapshot.classId,
    periodId: snapshot.periodId,
    status,
    snapshot: finalSnapshot,
    createdAt: existing?.createdAt || new Date().toISOString(),
    lockedAt: status === "locked" ? new Date().toISOString() : status === "published" ? existing?.lockedAt || null : null,
    reopenedReason: existing?.reopenedReason,
    history: [
      ...(existing?.history || []),
      { status, role, reason: status === "locked" ? "Snapshot figé" : "Changement d’état", createdAt: new Date().toISOString() },
    ],
  };
  return {
    ...workspace,
    reports: [
      ...workspace.reports.filter((item) => item.id !== report.id),
      report,
    ],
  };
}
export function reopenReport(
  workspace: GradingWorkspace,
  reportId: string,
  role: GradingRole,
  reason = "",
) {
  if (!canLockPeriod(role))
    throw new Error("Votre rôle ne permet pas de rouvrir un bulletin.");
  if (!reason.trim())
    throw new Error("Le motif de réouverture est obligatoire.");
  return {
    ...workspace,
    reports: workspace.reports.map((item) =>
      item.id === reportId
        ? { ...item, status: "review" as const, lockedAt: null, reopenedReason: reason.trim(), history: [...(item.history || []), { status: "review" as const, role, reason: reason.trim(), createdAt: new Date().toISOString() }] }
        : item,
    ),
  };
}

export function reportCompleteness(workspace:GradingWorkspace,classId:string,periodId:string,studentIds:string[]){
  const assessments=workspace.assessments.filter(item=>item.classId===classId&&item.periodId===periodId&&item.active);
  const subjects=workspace.classSubjects.filter(item=>item.classId===classId&&(!item.periodId||item.periodId===periodId)&&item.active);
  const missingScores=assessments.reduce((count,assessment)=>count+studentIds.filter(studentId=>{const score=workspace.scores.find(item=>item.assessmentId===assessment.id&&item.studentId===studentId);return !score||score.status==="not_graded";}).length,0);
  const invalidCoefficients=subjects.filter(item=>!Number.isFinite(item.coefficient)||item.coefficient<=0).length+assessments.filter(item=>!Number.isFinite(item.coefficient)||item.coefficient<=0).length;
  const subjectsWithoutAssessments=subjects.filter(subject=>!assessments.some(item=>item.subject===subject.subject)).length;
  return{missingScores,invalidCoefficients,subjectsWithoutAssessments,assessmentCount:assessments.length,complete:missingScores===0&&invalidCoefficients===0&&subjectsWithoutAssessments===0&&assessments.length>0};
}

export function scoresToCsv(
  assessment: GradeAssessment,
  students: Array<{ id: string; firstName: string; lastName: string }>,
  scores: AssessmentScore[],
) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [
    "Identifiant;Nom;Prénom;Note;Statut;Maîtrise",
    ...students.map((student) => {
      const score = scores.find(
        (item) =>
          item.assessmentId === assessment.id && item.studentId === student.id,
      );
      return [
        student.id,
        student.lastName,
        student.firstName,
        score?.value?.toString() || "",
        score?.status || "not_graded",
        score?.mastery || "",
      ]
        .map(escape)
        .join(";");
    }),
  ].join("\n");
}
export function parseScoresCsv(content: string, assessment: GradeAssessment) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  const separator = lines[0]?.includes(";") ? ";" : ",";
  return lines
    .slice(1)
    .map((line) =>
      line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, "")),
    )
    .filter((row) => row[0])
    .map((row) => {
      const value = row[3] === "" ? null : Number(row[3]);
      const status = (row[4] || "graded") as AssessmentScore["status"];
      return {
        id: crypto.randomUUID(),
        assessmentId: assessment.id,
        studentId: row[0],
        value: Number.isFinite(value) ? value : null,
        status,
        mastery: row[5] ? row[5] as AssessmentScore["mastery"] : undefined,
        updatedAt: new Date().toISOString(),
      };
    });
}
