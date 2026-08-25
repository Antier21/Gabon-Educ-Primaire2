"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Calculator,
  Cloud,
  Download,
  FileSpreadsheet,
  GraduationCap,
  LoaderCircle,
  Lock,
  Plus,
  Printer,
  Save,
  Settings2,
  Trash2,
  Unlock,
  Upload,
  X,
} from "lucide-react";
import { Brand } from "./Brand";
import { AcademicWeekStrip } from "./AcademicWeekStrip";
import { ReportCardDocument } from "./ReportCardDocument";
import { SUBJECTS, listClasses, type ClassRecord } from "@/lib/class-store";
import { getDefaultSubjectsForLevel, isPreschoolLevel } from "@/lib/school-profiles";
import { listEvaluations, type EvaluationRecord } from "@/lib/evaluation-store";
import {
  assessmentAverage,
  buildReportCardSnapshot,
  findReportStudent,
} from "@/lib/grading/calculations";
import { publishReportCard } from "@/lib/grading/publish";
import { syncScoreStatements } from "@/lib/grading/statements";
import {
  archiveReport,
  canEditGeneralComment,
  canLockPeriod,
  defaultWorkspace,
  loadGradingWorkspace,
  parseScoresCsv,
  periodIsLocked,
  reopenReport,
  reportCompleteness,
  saveGradingWorkspace,
  scoresToCsv,
  setActivePeriod,
  upsertAssessment,
  upsertGeneralComment,
  upsertPeriod,
  upsertScore,
  upsertSubjectComment,
} from "@/lib/grading/store";
import type {
  AssessmentScore,
  ClassSubject,
  GeneralComment,
  GradeAssessment,
  GradingWorkspace,
  Mention,
  MasteryLevel,
  ReportStatus,
  ScoreStatus,
} from "@/lib/grading/types";
import { MASTERY_LEVEL_OPTIONS, masteryLevelLabel } from "@/lib/grading/types";
import {
  readLocal,
  resolveStorageStatus,
  STORAGE_KEYS,
  storageModeLabel,
  type StorageMode,
} from "@/lib/storage-mode";
import { enqueueBusinessOperation } from "@/lib/sync/business-operation";
import { markModuleOperationsSynced } from "@/lib/sync/sync-manager";
import type { SyncOperationMetadata } from "@/lib/sync/types";
import { canTransitionReport } from "@/lib/platform/calculations";
import styles from "./Gradebook.module.css";
import { useSubscriptionAccess } from "@/lib/subscriptions/use-subscription-access";
import { SubscriptionReadOnlyPanel } from "@/components/SubscriptionReadOnlyPanel";

type Tab = "settings" | "scores" | "reports";
type GradebookModule = "combined" | "notes" | "bulletins";
type Notice = { kind: "success" | "error"; text: string } | null;
const roles = {
  teacher: "Enseignant",
  head_teacher: "Enseignant principal",
  school_admin: "Administration",
  headmaster: "Chef d’établissement",
} as const;
const statuses: Array<{ value: ReportStatus; label: string }> = [
  { value: "draft", label: "Brouillon" },
  { value: "calculated", label: "Calculé" },
  { value: "review", label: "À vérifier" },
  { value: "validated", label: "Validé" },
  { value: "locked", label: "Verrouillé" },
  { value: "published", label: "Publié" },
];
const mentions: Mention[] = [
  "",
  "Encouragements",
  "Tableau d’honneur",
  "Félicitations",
  "Avertissement travail",
  "Avertissement conduite",
];

function weekToPlanningDate(week: number) {
  const schoolYear = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const januaryFirst = new Date(schoolYear, 0, 1);
  const day = januaryFirst.getDay() || 7;
  const firstMonday = new Date(januaryFirst);
  firstMonday.setDate(januaryFirst.getDate() + (day <= 4 ? 1 - day : 8 - day));
  const date = new Date(firstMonday);
  date.setDate(firstMonday.getDate() + (week - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function synchronizeEvaluationsWithGradebook(
  workspace: GradingWorkspace,
  evaluations: EvaluationRecord[],
  classes: ClassRecord[],
): GradingWorkspace {
  const normalizedAssessments = workspace.assessments.map((assessment) => {
    const classLevel = classes.find((item) => item.id === assessment.classId)?.level;
    const evaluationMode = isPreschoolLevel(classLevel) ? "mastery" as const : "numeric" as const;
    return assessment.evaluationMode === evaluationMode
      ? assessment
      : { ...assessment, evaluationMode };
  });
  const existingKeys = new Set(
    normalizedAssessments.map((item) => item.evaluationId || item.id),
  );
  const activePeriodId =
    workspace.settings.activePeriodId || workspace.periods[0]?.id || "period-t1";
  const additions: GradeAssessment[] = evaluations
    .filter((evaluation) => evaluation.classId && !existingKeys.has(evaluation.id))
    .map((evaluation) => {
      const classLevel = classes.find((item) => item.id === evaluation.classId)?.level;
      return {
        id: `grade-${evaluation.id}`,
        evaluationId: evaluation.id,
        classId: evaluation.classId,
        subject: evaluation.subject,
        periodId: evaluation.periodId || activePeriodId,
        title: evaluation.title || "Évaluation",
        date: evaluation.date || new Date().toISOString().slice(0, 10),
        maxScore: evaluation.maxScore || workspace.settings.maxScore,
        coefficient: evaluation.coefficient || 1,
        active: true,
        evaluationMode: isPreschoolLevel(classLevel) ? "mastery" as const : "numeric" as const,
      };
    });
  const changed = normalizedAssessments.some(
    (assessment, index) => assessment !== workspace.assessments[index],
  );
  return additions.length || changed
    ? { ...workspace, assessments: [...normalizedAssessments, ...additions] }
    : workspace;
}

export function GradebookManager({ module = "combined" }: { module?: GradebookModule }) {
  const subscriptionAccess = useSubscriptionAccess();
  const [tab, setTab] = useState<Tab>(module === "bulletins" ? "reports" : module === "notes" ? "scores" : "settings");
  const [workspace, setWorkspace] =
    useState<GradingWorkspace>(defaultWorkspace);
  const [ready, setReady] = useState(false);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [mode, setMode] = useState<StorageMode>("demo");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [printAll, setPrintAll] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | undefined>();

  useEffect(() => {
    void Promise.all([loadGradingWorkspace(), listClasses(), listEvaluations()])
      .then(async ([grading, classData, evaluationData]) => {
        const synchronizedWorkspace = synchronizeEvaluationsWithGradebook(
          grading.workspace,
          evaluationData.items,
          classData.items,
        );
        const importedCount = synchronizedWorkspace.assessments.length - grading.workspace.assessments.length;
        if (importedCount > 0) {
          try {
            await saveGradingWorkspace(synchronizedWorkspace);
          } catch {
            // La synchronisation automatique reste visible à l’écran même si l’écriture locale/cloud échoue.
          }
        }
        setWorkspace(synchronizedWorkspace);
        setClasses(classData.items);
        setEvaluations(evaluationData.items);
        setMode(grading.mode);
        setMessage(
          importedCount > 0
            ? `${grading.message} · ${importedCount} évaluation(s) importée(s) dans le relevé`
            : grading.message,
        );
        const query = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
        const requestedClassId = query?.get("classId") || "";
        const requestedTab = query?.get("tab");
        const initialClassId = classData.items.some((item) => item.id === requestedClassId) ? requestedClassId : (classData.items[0]?.id || "");
        setClassId(initialClassId);
        if (requestedTab === "reports") setTab("reports");
        else if (requestedClassId) setTab("scores");
        setPeriodId(
          synchronizedWorkspace.settings.activePeriodId ||
            synchronizedWorkspace.periods[0]?.id ||
            "",
        );
        setStudentId(classData.items.find((item) => item.id === initialClassId)?.students[0]?.id || "");
      })
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const current = classes.find((item) => item.id === classId);
    if (!current?.students.some((item) => item.id === studentId))
      setStudentId(current?.students[0]?.id || "");
  }, [classId, classes, studentId]);
  const currentClassForPrint = classes.find((item) => item.id === classId);
  const allSnapshots = useMemo(
    () =>
      currentClassForPrint
        ? currentClassForPrint.students.map((student) => {
            const item = workspace.reports.find(
              (report) =>
                report.studentId === student.id &&
                report.classId === classId &&
                report.periodId === periodId,
            );
            return item?.status === "locked"
              ? item.snapshot
              : buildReportCardSnapshot({
                  workspace,
                  settings: workspace.settings,
                  classId,
                  className: currentClassForPrint.name,
                  classLevel: currentClassForPrint.level,
                  periodId,
                  periodLabel:
                    workspace.periods.find((period) => period.id === periodId)
                      ?.label || "Période",
                  student,
                  students: currentClassForPrint.students,
                });
          })
        : [],
    [workspace, currentClassForPrint, classId, periodId],
  );

  async function persist(
    next: GradingWorkspace,
    text = "Brouillon enregistré automatiquement.",
    metadata: SyncOperationMetadata = {
      module: "grading",
      operation: "update",
      entityId: "grading-workspace",
      payload: { updatedAt: new Date().toISOString() },
    },
  ) {
    try {
      const result = await saveGradingWorkspace(next);
      const actor = await resolveStorageStatus();
      enqueueBusinessOperation(
      {
        ...metadata,
        payload: { ...metadata.payload, workspace: next },
      },
      {
        schoolId: readLocal(STORAGE_KEYS.activeSchool, "") || "local",
        userId: actor.user?.id || "local-user",
      },
      );
      if (result.mode === "cloud") markModuleOperationsSynced("grading");
      setWorkspace(result.workspace);
      setMode(result.mode);
      setNotice({ kind: "success", text });
    } catch (error) {
      fail(error);
    }
  }
  function fail(error: unknown) {
    setNotice({
      kind: "error",
      text: error instanceof Error ? error.message : "Opération impossible.",
    });
  }
  if (!ready)
    return (
      <main className={styles.page}>
        <div className={styles.loading}>
          <LoaderCircle className={styles.spin} /> Chargement du registre
          scolaire…
        </div>
      </main>
    );
  const currentClass = classes.find((item) => item.id === classId);
  const activeAssessments = workspace.assessments.filter(
    (item) => item.classId === classId && item.periodId === periodId,
  );
  const currentAssessment =
    activeAssessments.find((item) => item.id === assessmentId) ||
    activeAssessments[0];

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const maxScore = Number(data.get("maxScore"));
    const passThreshold = Number(data.get("passThreshold"));
    const decimals = Number(data.get("decimals"));
    if (
      maxScore <= 0 ||
      passThreshold < 0 ||
      passThreshold > maxScore ||
      decimals < 0 ||
      decimals > 4
    )
      return fail(
        new Error("Vérifiez le barème, le seuil et le nombre de décimales."),
      );
    await persist(
      {
        ...workspace,
        settings: {
          ...workspace.settings,
          academicYear: String(data.get("academicYear")),
          periodKind: String(data.get("periodKind")) as
            "trimester" | "semester",
          maxScore,
          passThreshold,
          decimals,
          schoolName: String(data.get("schoolName")),
          logoUrl: String(data.get("logoUrl")),
          address: String(data.get("address")),
          phone: String(data.get("phone")),
          email: String(data.get("email")),
          headName: String(data.get("headName")),
          bulletinModel: String(data.get("bulletinModel")),
          individualMode: data.get("individualMode") === "on",
          simulatedRole: String(
            data.get("simulatedRole"),
          ) as GradingWorkspace["settings"]["simulatedRole"],
        },
      },
      "Paramètres scolaires enregistrés.",
    );
  }
  async function addPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const period = {
      id: crypto.randomUUID(),
      label: String(data.get("label")),
      startsOn: String(data.get("startsOn")),
      endsOn: String(data.get("endsOn")),
      active: false,
      locked: false,
    };
    if (!period.label || !period.startsOn || !period.endsOn)
      return fail(new Error("Complétez la période."));
    await persist(upsertPeriod(workspace, period), "Période créée.");
    form.reset();
  }
  async function activatePeriod(id: string) {
    setPeriodId(id);
    await persist(
      setActivePeriod(workspace, id),
      "Période active mise à jour.",
    );
  }
  async function togglePeriodLock(id: string) {
    if (!canLockPeriod(workspace.settings.simulatedRole))
      return fail(
        new Error(
          "Seuls l’administration et le chef d’établissement peuvent verrouiller une période.",
        ),
      );
    const item = workspace.periods.find((period) => period.id === id);
    if (!item) return;
    await persist(
      upsertPeriod(workspace, { ...item, locked: !item.locked }),
      item.locked
        ? "Période rouverte."
        : "Période verrouillée : notes et évaluations figées.",
    );
  }
  async function addSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId) return fail(new Error("Créez ou sélectionnez une classe."));
    const data = new FormData(event.currentTarget);
    const coefficient = Number(data.get("coefficient"));
    if (!Number.isFinite(coefficient) || coefficient <= 0)
      return fail(new Error("Le coefficient doit être supérieur à zéro."));
    const item: ClassSubject = {
      id: crypto.randomUUID(),
      classId,
      periodId: workspace.settings.activePeriodId,
      subject: String(data.get("subject")),
      coefficient,
      teacherName: String(data.get("teacherName")),
      principal: data.get("principal") === "on",
      active: true,
    };
    await persist(
      {
        ...workspace,
        classSubjects: [
          ...workspace.classSubjects.filter(
            (entry) =>
              !(
                entry.classId === classId &&
                entry.periodId === item.periodId &&
                entry.subject === item.subject
              ),
          ),
          item,
        ],
      },
      "Matière affectée à la classe pour la période active.",
    );
  }
  async function toggleSubject(id: string) {
    await persist(
      {
        ...workspace,
        classSubjects: workspace.classSubjects.map((item) =>
          item.id === id ? { ...item, active: !item.active } : item,
        ),
      },
      "Statut de la matière mis à jour.",
    );
  }
  async function removeSubject(id: string) {
    await persist(
      {
        ...workspace,
        classSubjects: workspace.classSubjects.filter((item) => item.id !== id),
      },
      "Matière retirée.",
    );
  }
  async function addAssessment(event: FormEvent<HTMLFormElement>): Promise<boolean> {
    event.preventDefault();
    if (!classId || !periodId)
      return (fail(new Error("Sélectionnez une classe et une période.")), false);
    const data = new FormData(event.currentTarget);
    const linked = evaluations.find(
      (item) => item.id === String(data.get("evaluationId")),
    );
    const subject = String(data.get("subject"));
    const item: GradeAssessment = {
      id: crypto.randomUUID(),
      evaluationId: linked?.id || "",
      classId,
      subject,
      periodId,
      title: String(data.get("title")) || linked?.title || "Évaluation",
      date:
        String(data.get("date")) ||
        linked?.date ||
        new Date().toISOString().slice(0, 10),
      maxScore:
        Number(data.get("maxScore")) ||
        linked?.maxScore ||
        workspace.settings.maxScore,
      coefficient: Number(data.get("coefficient")) || linked?.coefficient || 1,
      active: true,
      category: String(data.get("category") || "Devoir surveillé"),
      publishedOn: String(data.get("publishedOn") || ""),
      theme: String(data.get("theme") || ""),
      locked: data.get("locked") === "on",
      evaluationMode: isPreschoolLevel(currentClass?.level) ? "mastery" : "numeric",
    };
    try {
      const next = upsertAssessment(workspace, item);
      await persist(next, "Évaluation reliée au registre de notes.", {
        module: "grading",
        operation: "create",
        entityId: item.id,
        payload: { assessment: item },
      });
      setAssessmentId(item.id);
      return true;
    } catch (error) {
      fail(error);
      return false;
    }
  }
  async function changeScore(
    assessmentIdValue: string,
    studentIdValue: string,
    value: string,
    status: ScoreStatus,
    mastery?: MasteryLevel,
  ) {
    const assessment = workspace.assessments.find((item) => item.id === assessmentIdValue);
    if (!assessment) return;
    const existing = workspace.scores.find(
      (item) =>
        item.assessmentId === assessment.id &&
        item.studentId === studentIdValue,
    );
    const score: AssessmentScore = {
      id: existing?.id || crypto.randomUUID(),
      assessmentId: assessment.id,
      studentId: studentIdValue,
      value: status === "graded" && value !== "" ? Number(value) : null,
      status,
      mastery,
      updatedAt: new Date().toISOString(),
    };
    try {
      const next = upsertScore(workspace, score);
      await persist(next, "Note enregistrée.", {
        module: "grading",
        operation: "update",
        entityId: score.id,
        payload: { score },
      });
      await refreshScoreStatements(next);
    } catch (error) {
      fail(error);
    }
  }
  /**
   * Remet à jour le relevé de notes des familles.
   *
   * Les notes vivent dans l'espace de l'enseignant, que lui seul peut lire ;
   * sans cette recopie, un parent ne verrait rien avant la publication du
   * bulletin — soit un trimestre entier de silence. Le relevé de toute la
   * classe part en une seule requête, dont l'échec est signalé sans annuler
   * l'enregistrement de la note : celle-ci est acquise de toute façon.
   */
  async function refreshScoreStatements(next: GradingWorkspace) {
    if (!currentClass || !classId || !periodId) return;
    const result = await syncScoreStatements({
      workspace: next,
      classId,
      periodId,
      periodLabel:
        next.periods.find((item) => item.id === periodId)?.label || "",
      students: currentClass.students,
    });
    if (result.error) setMessage(result.error);
  }
  function exportScores() {
    if (!currentAssessment || !currentClass) return;
    const blob = new Blob(
      [
        "\uFEFF" +
          scoresToCsv(
            currentAssessment,
            currentClass.students,
            workspace.scores,
          ),
      ],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `notes-${currentAssessment.title.replace(/\s+/g, "-").toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importScores(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !currentAssessment) return;
    try {
      let next = workspace;
      for (const score of parseScoresCsv(await file.text(), currentAssessment))
        next = upsertScore(next, score);
      await persist(next, "Notes CSV importées.");
      await refreshScoreStatements(next);
    } catch (error) {
      fail(error);
    } finally {
      event.target.value = "";
    }
  }

  const currentStudent = currentClass
    ? findReportStudent(currentClass.students, studentId)
    : null;
  const liveSnapshot =
    currentClass && currentStudent && periodId
      ? buildReportCardSnapshot({
          workspace,
          settings: workspace.settings,
          classId,
          className: currentClass.name,
          classLevel: currentClass.level,
          periodId,
          periodLabel:
            workspace.periods.find((item) => item.id === periodId)?.label ||
            "Période",
          student: currentStudent,
          students: currentClass.students,
        })
      : null;
  const archived = workspace.reports.find(
    (item) =>
      item.studentId === studentId &&
      item.classId === classId &&
      item.periodId === periodId,
  );
  const snapshot =
    archived?.status === "locked" ? archived.snapshot : liveSnapshot;
  const preschoolClass = isPreschoolLevel(currentClass?.level);
  const canPrepareGeneral = canEditGeneralComment(
    workspace.settings.simulatedRole,
  ) || preschoolClass;
  async function saveComments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot) return;
    const data = new FormData(event.currentTarget);
    let next = workspace;
    for (const row of snapshot.subjects)
      next = upsertSubjectComment(next, {
        studentId,
        periodId,
        subject: row.subject,
        comment: String(data.get(`subject-${row.subject}`) || ""),
      });
    if (canPrepareGeneral) {
      next = {
        ...next,
        attendance: [
          ...next.attendance.filter(
            (item) =>
              !(item.studentId === studentId && item.periodId === periodId),
          ),
          {
            studentId,
            periodId,
            absences: Math.max(0, Number(data.get("absences")) || 0),
            lateCount: Math.max(0, Number(data.get("lateCount")) || 0),
          },
        ],
      };
      const comment: GeneralComment = {
        studentId,
        periodId,
        general: String(data.get("general") || ""),
        work: preschoolClass ? "" : String(data.get("work") || ""),
        conduct: String(data.get("conduct") || ""),
        decision: String(data.get("decision") || ""),
        mention: preschoolClass ? "" : String(data.get("mention") || "") as Mention,
      };
      next = upsertGeneralComment(next, comment);
    }
    await persist(
      next,
      canPrepareGeneral
        ? "Appréciations et assiduité enregistrées."
        : "Appréciations par matière enregistrées. La synthèse générale reste réservée à l’enseignant principal ou à l’administration.",
    );
  }
  async function setReportStatus(status: ReportStatus) {
    if (!liveSnapshot) return;
    const currentStatus = archived?.status || "calculated";
    if (status === currentStatus) return;
    if (
      !canTransitionReport(
        currentStatus,
        status,
        workspace.settings.simulatedRole,
      )
    )
      return fail(
        new Error(
          "Cette transition n’est pas autorisée pour l’état ou le rôle actuel.",
        ),
      );
    const completeness = currentClass
      ? reportCompleteness(
          workspace,
          classId,
          periodId,
          currentClass.students.map((item) => item.id),
        )
      : null;
    if (
      (["validated", "locked"] as ReportStatus[]).includes(status) &&
      completeness &&
      !completeness.complete
    )
      return fail(
        new Error(
          `Bulletin incomplet : ${completeness.missingScores} note(s) manquante(s), ${completeness.subjectsWithoutAssessments} matière(s) sans évaluation et ${completeness.invalidCoefficients} coefficient(s) invalide(s).`,
        ),
      );
    if (
      (["validated", "locked", "published"] as ReportStatus[]).includes(
        status,
      ) &&
      !canLockPeriod(workspace.settings.simulatedRole)
    )
      return fail(
        new Error(
          "La validation, le verrouillage et la publication sont réservés à l’administration ou au chef d’établissement.",
        ),
      );
    const published = archived?.status === "locked" ? archived.snapshot : liveSnapshot;
    try {
      await persist(
        archiveReport(
          workspace,
          published,
          status,
          workspace.settings.simulatedRole,
        ),
        status === "locked"
          ? "Bulletin verrouillé : un snapshot figé a été archivé."
          : "État du bulletin mis à jour.",
        {
          module: "grading",
          operation: archived ? "update" : "create",
          entityId: archived?.id || liveSnapshot.studentId,
          payload: { status, snapshot: liveSnapshot },
        },
      );
      /**
       * Publier, c'est remettre le bulletin à la famille.
       *
       * Les notes vivent dans l'espace de l'enseignant, que lui seul peut
       * lire ; l'espace famille interroge les tables de l'établissement. Sans
       * cette recopie, l'onglet « Résultats et bulletins » d'un parent restait
       * vide quoi qu'ait fait l'école. Elle n'a lieu qu'au passage à « publié »,
       * jamais avant : un bulletin validé peut encore être repris en conseil
       * de classe.
       */
      if (status === "published") {
        const result = await publishReportCard(
          published,
          workspace.periods.find((item) => item.id === published.periodId),
          workspace.settings,
        );
        setMessage(result.message);
      }
    } catch (error) {
      fail(error);
    }
  }
  async function reopen() {
    if (!archived) return;
    const reason = window.prompt(
      "Motif obligatoire de réouverture du bulletin :",
      "",
    );
    if (reason === null) return;
    try {
      await persist(
        reopenReport(
          workspace,
          archived.id,
          workspace.settings.simulatedRole,
          reason,
        ),
        "Bulletin rouvert pour vérification.",
        {
          module: "grading",
          operation: "update",
          entityId: archived.id,
          payload: { status: "to_review", reopened: true, reason },
        },
      );
    } catch (error) {
      fail(error);
    }
  }
  function printReports(all: boolean) {
    setPrintAll(all);
    document.body.classList.add("printing-gradebook");
    const cleanup = () => document.body.classList.remove("printing-gradebook");
    window.addEventListener("afterprint", cleanup, { once: true });
    setTimeout(() => {
      window.print();
      window.setTimeout(cleanup, 800);
    }, all ? 100 : 50);
  }
  function printCurrent() {
    printReports(false);
  }
  function printClass() {
    printReports(true);
  }

  return (
    <main className={`${styles.page} gradebook-print-page`}>
      {subscriptionAccess.blocked && <SubscriptionReadOnlyPanel message={subscriptionAccess.message} />}
      <fieldset className="subscription-write-lock gradebook-print-fieldset" disabled={subscriptionAccess.blocked}>
      <header className={`${styles.topbar} ${styles.noPrint}`}>
        <div className={styles.topLeft}>
          <Link
            className="icon-btn"
            href="/gabon-educ/tableau-de-bord"
            aria-label="Retour"
          >
            <ArrowLeft />
          </Link>
          <Brand />
          <div>
            <b>{module === "notes" ? "Notes" : module === "bulletins" ? "Bulletins" : "Notes & bulletins"}</b>
            <small>{module === "bulletins" ? "Consultation et appréciations trimestrielles" : "Création des devoirs et saisie des résultats"}</small>
          </div>
        </div>
        {module !== "combined" && (
          <nav className={styles.moduleSwitch} aria-label="Modules de résultats">
            <Link className={module === "notes" ? styles.moduleActive : ""} href="/gabon-educ/notes">
              <FileSpreadsheet /> Notes
            </Link>
            <Link className={module === "bulletins" ? styles.moduleActive : ""} href="/gabon-educ/bulletins">
              <Calculator /> Bulletins
            </Link>
          </nav>
        )}
        <span className={styles.mode}>
          <Cloud /> {storageModeLabel(mode)} · {message}
        </span>
      </header>
      <section className={`${styles.shell} gradebook-print-shell`}>
        <div className={`${styles.hero} ${styles.noPrint}`}>
          <div>
            <small>ESPACE PROFESSEUR</small>
            <h1>{module === "bulletins" ? "Bulletins trimestriels" : module === "notes" ? "Carnet de notes" : "Notes, moyennes et bulletins"}</h1>
            <p>{module === "bulletins"
              ? "Consultez les bulletins calculés et renseignez les appréciations de fin de trimestre."
              : "Créez les devoirs, saisissez les notes et suivez automatiquement les moyennes de vos classes."}</p>
          </div>
          {module !== "bulletins" && (
            <Link className="btn btn-light" href="/gabon-educ/evaluations">
              <BookOpenCheck /> Gérer les sujets d’évaluation
            </Link>
          )}
        </div>
        {module !== "bulletins" && <AcademicWeekStrip compact selectedWeek={selectedWeek} onSelect={(week) => { setSelectedWeek(week); setTab("scores"); }} title="Repère des semaines du relevé" />}
        {module !== "bulletins" && <nav className={`${styles.tabs} ${styles.noPrint}`}>
          <button
            className={tab === "settings" ? styles.active : ""}
            onClick={() => setTab("settings")}
          >
            <Settings2 /> Paramètres
          </button>
          <button
            className={tab === "scores" ? styles.active : ""}
            onClick={() => setTab("scores")}
          >
            <FileSpreadsheet /> Notes
          </button>
          {module === "combined" && <button
            className={tab === "reports" ? styles.active : ""}
            onClick={() => setTab("reports")}
          >
            <Calculator /> 3. Bulletins
          </button>}
        </nav>}
        {notice && (
          <div
            className={`${styles.notice} ${notice.kind === "error" ? styles.error : ""}`}
          >
            {notice.text}
          </div>
        )}
        {module !== "bulletins" && tab === "settings" && (
          <SettingsTab
            workspace={workspace}
            classes={classes}
            classId={classId}
            setClassId={setClassId}
            saveSettings={saveSettings}
            addPeriod={addPeriod}
            activatePeriod={activatePeriod}
            togglePeriodLock={togglePeriodLock}
            addSubject={addSubject}
            toggleSubject={toggleSubject}
            removeSubject={removeSubject}
          />
        )}
        {module !== "bulletins" && tab === "scores" && (
          <ScoresTab
            workspace={workspace}
            classes={classes}
            classId={classId}
            setClassId={setClassId}
            periodId={periodId}
            setPeriodId={setPeriodId}
            evaluations={evaluations}
            addAssessment={addAssessment}
            assessmentId={currentAssessment?.id || ""}
            setAssessmentId={setAssessmentId}
            currentAssessment={currentAssessment}
            changeScore={changeScore}
            exportScores={exportScores}
            importScores={importScores}
            selectedWeek={selectedWeek}
          />
        )}
        {(module === "bulletins" || tab === "reports") && (
          <section className={`${styles.card} gradebook-print-root`}>
            <div className={`${styles.noPrint} ${styles.inlineTitle}`}>
              <div>
                <h2>{module === "bulletins" ? "Consulter un bulletin" : "Prévisualisation et archivage"}</h2>
                <p className={styles.muted}>
                  {module === "bulletins"
                    ? "Le bulletin est calculé à partir des notes enregistrées. Vous pouvez compléter les appréciations autorisées pour votre rôle."
                    : "Le bulletin est calculé directement à partir du relevé de notes, des moyennes et des appréciations saisies ci-dessous. L’export PDF utilise la boîte d’impression du navigateur."}
                </p>
              </div>
              {module !== "bulletins" && <div className={styles.miniActions}>
                <button onClick={printCurrent}>
                  <Printer /> Imprimer / PDF
                </button>
                <button onClick={printClass}>
                  <Printer /> Toute la classe
                </button>
              </div>}
            </div>
            <div className={`${styles.reportTools} ${styles.noPrint}`}>
              <label>
                Classe
                <select
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Période
                <select
                  value={periodId}
                  onChange={(e) => setPeriodId(e.target.value)}
                >
                  {workspace.periods.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Élève
                <select
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                >
                  {currentClass?.students.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.lastName} {item.firstName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!snapshot ? (
              <div className={styles.empty}>
                Sélectionnez une classe contenant au moins un élève.
              </div>
            ) : (
              <>
                <div className={`${styles.noPrint} ${styles.statusLine}`}>
                  <span
                    className={`${styles.pill} ${archived?.status === "locked" ? styles.locked : ""}`}
                  >
                    État :{" "}
                    {
                      statuses.find(
                        (item) =>
                          item.value === (archived?.status || "calculated"),
                      )?.label
                    }
                  </span>
                  {module === "bulletins" ? (
                    <span className={styles.readOnlyBadge}><Lock /> Consultation professeur</span>
                  ) : <select
                      value={archived?.status || "calculated"}
                      onChange={(e) => void setReportStatus(e.target.value as ReportStatus)}
                    >
                      {statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>}
                  {module !== "bulletins" && archived?.status === "locked" && (
                    <button
                      className="btn btn-light"
                      onClick={() => void reopen()}
                    >
                      <Unlock /> Rouvrir
                    </button>
                  )}
                </div>
                <form
                  key={`${studentId}-${periodId}-${archived?.status || "live"}`}
                  className={`${styles.form} ${styles.noPrint}`}
                  onSubmit={saveComments}
                >
                  <div className={styles.grid}>
                    <div className={styles.card}>
                      <h2>{preschoolClass ? "Appréciations par domaine" : "Appréciations par matière"}</h2>
                      {snapshot.subjects.map((row) => (
                        <label key={row.subject}>
                          {row.subject}
                          <input
                            name={`subject-${row.subject}`}
                            defaultValue={row.comment}
                            placeholder={preschoolClass ? "Observation ou progrès constaté" : "Appréciation validée par l’enseignant"}
                          />
                        </label>
                      ))}
                      <button className="btn btn-primary">
                        <Save /> Enregistrer mes appréciations
                      </button>
                    </div>
                    {canPrepareGeneral ? <div className={styles.card}>
                      <h2>{preschoolClass ? "Synthèse du suivi et assiduité" : "Synthèse et assiduité"}</h2>
                      <div className={styles.two}>
                        <label>
                          Absences
                          <input
                            name="absences"
                            type="number"
                            min="0"
                            defaultValue={snapshot.attendance.absences}
                          />
                        </label>
                        <label>
                          Retards
                          <input
                            name="lateCount"
                            type="number"
                            min="0"
                            defaultValue={snapshot.attendance.lateCount}
                          />
                        </label>
                      </div>
                      {!preschoolClass && <label>
                        Travail
                        <textarea
                          name="work"
                          defaultValue={snapshot.comments.work}
                        />
                      </label>}
                      <label>
                        {preschoolClass ? "Autonomie et vie en groupe" : "Conduite"}
                        <textarea
                          name="conduct"
                          defaultValue={snapshot.comments.conduct}
                        />
                      </label>
                      <label>
                        {preschoolClass ? "Progression générale" : "Appréciation générale"}
                        <textarea
                          name="general"
                          defaultValue={snapshot.comments.general}
                        />
                      </label>
                      <label>
                        {preschoolClass ? "Suite du parcours" : "Décision du conseil"}
                        <input
                          name="decision"
                          defaultValue={snapshot.comments.decision}
                        />
                      </label>
                      {!preschoolClass && <label>
                        Mention
                        <select
                          name="mention"
                          defaultValue={snapshot.comments.mention}
                        >
                          {mentions.map((item) => (
                            <option key={item} value={item}>
                              {item || "Aucune"}
                            </option>
                          ))}
                        </select>
                      </label>}
                    </div> : <div className={`${styles.card} ${styles.teacherInfoCard}`}>
                      <Lock />
                      <h2>Synthèse générale protégée</h2>
                      <p>L’appréciation générale, l’assiduité, la décision du conseil et la mention sont réservées à l’enseignant principal ou à l’administration.</p>
                    </div>}
                  </div>
                </form>
                {printAll ? (
                  allSnapshots.map((item) => (
                    <div className={styles.reportPage} key={item.studentId}>
                      <ReportCardDocument
                        snapshot={item}
                        student={currentClass?.students.find(
                          (student) => student.id === item.studentId,
                        )}
                      />
                    </div>
                  ))
                ) : (
                  <div className={styles.reportPage}>
                    <ReportCardDocument
                      snapshot={snapshot}
                      student={currentClass?.students.find(
                        (item) => item.id === snapshot.studentId,
                      )}
                    />
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </section>
    </fieldset></main>
  );
}

type SettingsProps = {
  workspace: GradingWorkspace;
  classes: ClassRecord[];
  classId: string;
  setClassId: (id: string) => void;
  saveSettings: (e: FormEvent<HTMLFormElement>) => void;
  addPeriod: (e: FormEvent<HTMLFormElement>) => void;
  activatePeriod: (id: string) => void;
  togglePeriodLock: (id: string) => void;
  addSubject: (e: FormEvent<HTMLFormElement>) => void;
  toggleSubject: (id: string) => void;
  removeSubject: (id: string) => void;
};
function SettingsTab(p: SettingsProps) {
  const s = p.workspace.settings;
  const selectedClass = p.classes.find((item) => item.id === p.classId);
  const preschool = isPreschoolLevel(selectedClass?.level);
  const availableSubjects = selectedClass ? getDefaultSubjectsForLevel(selectedClass.level) : SUBJECTS;
  const subjects = p.workspace.classSubjects.filter(
    (item) =>
      item.classId === p.classId &&
      (!item.periodId || item.periodId === s.activePeriodId),
  );
  return (
    <div className={styles.grid}>
      <form
        className={`${styles.card} ${styles.form}`}
        onSubmit={p.saveSettings}
      >
        <h2>Établissement et notation</h2>
        <p>
          Le nom de l’établissement reste facultatif pour le mode enseignant
          individuel.
        </p>
        <div className={styles.two}>
          <label>
            Année scolaire
            <input name="academicYear" defaultValue={s.academicYear} required />
          </label>
          <label>
            Découpage
            <select name="periodKind" defaultValue={s.periodKind}>
              <option value="trimester">Trimestres</option>
              <option value="semester">Semestres</option>
            </select>
          </label>
        </div>
        <div className={styles.three}>
          <label>
            Note maximale
            <input
              name="maxScore"
              type="number"
              min="1"
              step="0.01"
              defaultValue={s.maxScore}
            />
          </label>
          <label>
            Seuil de réussite
            <input
              name="passThreshold"
              type="number"
              min="0"
              step="0.01"
              defaultValue={s.passThreshold}
            />
          </label>
          <label>
            Décimales
            <input
              name="decimals"
              type="number"
              min="0"
              max="4"
              defaultValue={s.decimals}
            />
          </label>
        </div>
        <label>
          Nom de l’établissement
          <input name="schoolName" defaultValue={s.schoolName} />
        </label>
        <label>
          URL du logo
          <input name="logoUrl" type="url" defaultValue={s.logoUrl} />
        </label>
        <label>
          Adresse
          <input name="address" defaultValue={s.address} />
        </label>
        <div className={styles.two}>
          <label>
            Téléphone
            <input name="phone" defaultValue={s.phone} />
          </label>
          <label>
            E-mail
            <input name="email" type="email" defaultValue={s.email} />
          </label>
        </div>
        <label>
          Chef d’établissement
          <input name="headName" defaultValue={s.headName} />
        </label>
        <label>
          Modèle de bulletin
          <input name="bulletinModel" defaultValue={s.bulletinModel} />
        </label>
        <label>
          Rôle simulé
          <select name="simulatedRole" defaultValue={s.simulatedRole}>
            {Object.entries(roles).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            name="individualMode"
            type="checkbox"
            defaultChecked={s.individualMode}
          />{" "}
          Fonctionner en mode enseignant individuel
        </label>
        <p className={styles.roleNote}>
          Les rôles locaux servent à tester le parcours et ne constituent pas
          une sécurité serveur.
        </p>
        <button className="btn btn-primary">
          <Save /> Enregistrer les paramètres
        </button>
      </form>
      <div className={styles.card}>
        <h2>Périodes scolaires</h2>
        <p>
          La période active préremplit la saisie des notes. Une période
          verrouillée devient non modifiable.
        </p>
        <form className={styles.form} onSubmit={p.addPeriod}>
          <label>
            Libellé
            <input name="label" placeholder="Trimestre 1" />
          </label>
          <div className={styles.two}>
            <label>
              Début
              <input name="startsOn" type="date" />
            </label>
            <label>
              Fin
              <input name="endsOn" type="date" />
            </label>
          </div>
          <button className="btn btn-light">
            <Plus /> Ajouter
          </button>
        </form>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Période</th>
                <th>Dates</th>
                <th>État</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {p.workspace.periods.map((item) => (
                <tr key={item.id}>
                  <td>
                    <b>{item.label}</b>
                  </td>
                  <td>
                    {item.startsOn} → {item.endsOn}
                  </td>
                  <td>
                    <span
                      className={`${styles.pill} ${item.locked ? styles.locked : ""}`}
                    >
                      {item.locked
                        ? "Verrouillée"
                        : item.active
                          ? "Active"
                          : "Ouverte"}
                    </span>
                  </td>
                  <td>
                    <div className={styles.miniActions}>
                      <button
                        type="button"
                        onClick={() => p.activatePeriod(item.id)}
                      >
                        Activer
                      </button>
                      <button
                        type="button"
                        onClick={() => p.togglePeriodLock(item.id)}
                      >
                        {item.locked ? <Unlock /> : <Lock />}
                        {item.locked ? "Rouvrir" : "Verrouiller"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className={`${styles.card} ${styles.wide}`}>
        <div className={styles.inlineTitle}>
          <div>
            <h2>{preschool ? "Domaines d’apprentissage et affectations" : "Matières, coefficients et affectations"}</h2>
            <p className={styles.muted}>
              {preschool ? "Les domaines actifs alimentent le carnet de suivi sans note numérique." : "Les matières désactivées ou sans coefficient valide ne participent pas aux calculs."}
            </p>
          </div>
          <select
            value={p.classId}
            onChange={(e) => p.setClassId(e.target.value)}
          >
            <option value="">Sélectionner une classe</option>
            {p.classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <form
          className={`${styles.form} ${styles.three}`}
          onSubmit={p.addSubject}
        >
          <label>
            {preschool ? "Domaine d’apprentissage" : "Matière"}
            <select name="subject">
              {availableSubjects.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          {!preschool && <label>
            Coefficient
            <input
              name="coefficient"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue="1"
            />
          </label>}
          {preschool && <input name="coefficient" type="hidden" value="1" />}
          <label>
            Enseignant affecté
            <input name="teacherName" placeholder="Nom de l’enseignant" />
          </label>
          <label className={styles.check}>
            <input name="principal" type="checkbox" /> Enseignant principal
          </label>
          <button className="btn btn-primary">
            <Plus /> Affecter {preschool ? "le domaine" : "la matière"}
          </button>
        </form>
        {subjects.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{preschool ? "Domaine" : "Matière"}</th>
                  <th>Coefficient</th>
                  <th>Enseignant</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <b>{item.subject}</b>
                    </td>
                    <td>{item.coefficient}</td>
                    <td>
                      {item.teacherName || "Non précisé"}
                      {item.principal && " · Prof. principal"}
                    </td>
                    <td>
                      <button
                        className={styles.pill}
                        onClick={() => p.toggleSubject(item.id)}
                      >
                        {item.active ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td>
                      <button
                        className={`btn btn-light ${styles.danger}`}
                        onClick={() => p.removeSubject(item.id)}
                      >
                        <Trash2 />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.empty}>
            <GraduationCap /> Aucune matière affectée à cette classe.
          </div>
        )}
      </div>
    </div>
  );
}

type ScoresProps = {
  workspace: GradingWorkspace;
  classes: ClassRecord[];
  classId: string;
  setClassId: (id: string) => void;
  periodId: string;
  setPeriodId: (id: string) => void;
  evaluations: EvaluationRecord[];
  addAssessment: (e: FormEvent<HTMLFormElement>) => Promise<boolean>;
  assessmentId: string;
  setAssessmentId: (id: string) => void;
  currentAssessment?: GradeAssessment;
  changeScore: (assessmentId: string, studentId: string, value: string, status: ScoreStatus, mastery?: MasteryLevel) => void;
  exportScores: () => void;
  importScores: (e: ChangeEvent<HTMLInputElement>) => void;
  selectedWeek?: number;
};
function masteryLevelLabelForStudent(
  assessments: GradeAssessment[],
  scores: AssessmentScore[],
  studentId: string,
) {
  const latest = [...assessments]
    .sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`))
    .map((assessment) => scores.find((score) => score.assessmentId === assessment.id && score.studentId === studentId)?.mastery)
    .find(Boolean);
  return masteryLevelLabel(latest);
}
function ScoresTab(p: ScoresProps) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState("");
  const currentClass = p.classes.find((item) => item.id === p.classId);
  const preschool = isPreschoolLevel(currentClass?.level);
  const locked = periodIsLocked(p.workspace, p.periodId);
  const configured = p.workspace.classSubjects.filter(
    (item) =>
      item.classId === p.classId &&
      (!item.periodId || item.periodId === p.periodId) &&
      item.active,
  );
  const plannedDate = p.selectedWeek
    ? weekToPlanningDate(p.selectedWeek)
    : new Date().toISOString().slice(0, 10);
  const evaluationAverage = p.currentAssessment
    ? assessmentAverage(
        p.workspace.scores,
        p.currentAssessment.id,
        p.currentAssessment.maxScore,
        p.workspace.settings.maxScore,
        p.workspace.settings.decimals,
      )
    : null;
  const subjectOptions = Array.from(new Set((configured.length
    ? configured.map((item) => item.subject)
    : [
        ...p.workspace.assessments
          .filter((item) => item.classId === p.classId)
          .map((item) => item.subject),
        ...(currentClass ? getDefaultSubjectsForLevel(currentClass.level) : SUBJECTS),
      ]).filter(Boolean)));
  const selectedSubject = subjectOptions.includes(subjectFilter)
    ? subjectFilter
    : subjectOptions[0] || "";
  const allPeriodAssessments = p.workspace.assessments
    .filter((item) => item.classId === p.classId && item.periodId === p.periodId && item.active)
    .sort((a, b) => `${a.date}${a.title}`.localeCompare(`${b.date}${b.title}`, "fr"));
  const periodAssessments = selectedSubject
    ? allPeriodAssessments.filter((item) => item.subject === selectedSubject)
    : allPeriodAssessments;
  const scoreFor = (assessmentId: string, studentId: string) =>
    p.workspace.scores.find(
      (item) => item.assessmentId === assessmentId && item.studentId === studentId,
    );
  const normalized = (value: number, assessment: GradeAssessment) =>
    assessment.maxScore > 0
      ? (value / assessment.maxScore) * p.workspace.settings.maxScore
      : value;
  const studentAverage = (studentId: string) => {
    let total = 0;
    let coefficients = 0;
    for (const assessment of periodAssessments) {
      const score = scoreFor(assessment.id, studentId);
      if (!score || score.status !== "graded" || score.value === null) continue;
      const coefficient = Number.isFinite(assessment.coefficient) ? assessment.coefficient : 1;
      total += normalized(score.value, assessment) * coefficient;
      coefficients += coefficient;
    }
    if (!coefficients) return null;
    return Number((total / coefficients).toFixed(p.workspace.settings.decimals));
  };
  const assessmentAverageForClass = (assessment: GradeAssessment) => {
    if (!currentClass) return null;
    const values = currentClass.students
      .map((student) => {
        const score = scoreFor(assessment.id, student.id);
        return score?.status === "graded" && score.value !== null
          ? normalized(score.value, assessment)
          : null;
      })
      .filter((value): value is number => value !== null);
    if (!values.length) return null;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(p.workspace.settings.decimals));
  };
  const classPeriodAverage = () => {
    if (!currentClass) return null;
    const values = currentClass.students
      .map((student) => studentAverage(student.id))
      .filter((value): value is number => value !== null);
    if (!values.length) return null;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(p.workspace.settings.decimals));
  };
  const formattedAverage = (value: number | null) =>
    value === null ? "—" : value.toLocaleString("fr-FR", {
      minimumFractionDigits: p.workspace.settings.decimals,
      maximumFractionDigits: p.workspace.settings.decimals,
    });
  return (
    <div className={styles.grid}>
      <div className={`${styles.card} ${styles.wide} ${styles.gradebookToolbar}`}>
        <div className={styles.contextSelectors}>
          <label>
            Classe
            <select value={p.classId} onChange={(e) => p.setClassId(e.target.value)}>
              <option value="">Sélectionner</option>
              {p.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label>
            Période
            <select value={p.periodId} onChange={(e) => p.setPeriodId(e.target.value)}>
              {p.workspace.periods.map((item) => (
                <option key={item.id} value={item.id}>{item.label}{item.locked ? " (verrouillée)" : ""}</option>
              ))}
            </select>
          </label>
          <label>
            {preschool ? "Domaine" : "Matière"}
            <select
              value={selectedSubject}
              onChange={(e) => {
                const nextSubject = e.target.value;
                setSubjectFilter(nextSubject);
                p.setAssessmentId(allPeriodAssessments.find((item) => item.subject === nextSubject)?.id || "");
              }}
            >
              {subjectOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <button className="btn btn-primary" disabled={locked || !p.classId} onClick={() => setEditorOpen(true)}>
          <Plus /> {preschool ? "Créer une observation" : "Créer un devoir"}
        </button>
      </div>
      {locked && (
        <p className={`${styles.roleNote} ${styles.wide}`}>
          Cette période est verrouillée. Les évaluations sont en lecture seule.
        </p>
      )}
      {p.currentAssessment && (
        <div className={`${styles.assessmentSummary} ${styles.wide}`}>
          <span className={styles.pill}>{p.currentAssessment.category || "Évaluation"}</span>
          <b>{p.currentAssessment.title}</b>
          {!preschool && <><span>Barème : /{p.currentAssessment.maxScore}</span><span>Coefficient : {p.currentAssessment.coefficient}</span><span>Moyenne : {evaluationAverage ?? "—"} / {p.workspace.settings.maxScore}</span></>}
          {preschool && <span>Évaluation sans note numérique</span>}
        </div>
      )}
      <div className={`${styles.card} ${styles.wide}`}>
        <div className={styles.inlineTitle}>
          <div>
            <h2>{preschool ? "Carnet d’observations de la période" : "Relevé de notes de la période"}</h2>
            <p className={styles.muted}>
              {preschool ? "Chaque observation renseigne un niveau de maîtrise, sans note numérique." : "La liste des élèves vient automatiquement de la classe. Chaque évaluation créée ajoute une colonne au tableau."}
            </p>
          </div>
          <span className={styles.pill}>
            {periodAssessments.length} évaluation{periodAssessments.length > 1 ? "s" : ""}
          </span>
        </div>
        {!currentClass || !p.classId ? (
          <div className={styles.empty}>
            <FileSpreadsheet /> Sélectionnez une classe pour construire le relevé.
          </div>
        ) : periodAssessments.length === 0 ? (
          <div className={styles.empty}>
            <FileSpreadsheet /> Aucune colonne d’évaluation pour cette période. Créez une évaluation : le relevé se construira automatiquement.
          </div>
        ) : (
          <div className={styles.matrixWrap}>
            <table className={`${styles.table} ${styles.gradebookMatrix}`}>
              <thead>
                <tr>
                  <th rowSpan={2}>Élèves</th>
                  <th rowSpan={2}>{preschool ? "Progression" : "Moyenne"}</th>
                  {periodAssessments.map((assessment) => (
                    <th key={assessment.id}>
                      <button
                        type="button"
                        className={`${styles.columnButton} ${p.currentAssessment?.id === assessment.id ? styles.selectedColumn : ""}`}
                        onClick={() => p.setAssessmentId(assessment.id)}
                        title="Sélectionner cette évaluation pour la saisie détaillée"
                      >
                        {assessment.title || assessment.category || "Évaluation"}
                      </button>
                    </th>
                  ))}
                </tr>
                <tr>
                  {periodAssessments.map((assessment) => (
                    <th key={`${assessment.id}-meta`}>
                      <small>
                        {assessment.date || "date non précisée"}<br />
                        {preschool ? "Maîtrise" : `Coef. ${assessment.coefficient} · /${assessment.maxScore}`}
                      </small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentClass.students.map((student) => {
                  const average = studentAverage(student.id);
                  return (
                    <tr key={`matrix-${student.id}`}>
                      <td className={styles.studentNameCell}>
                        <b>{student.lastName.toLocaleUpperCase("fr")} {student.firstName}</b>
                      </td>
                      <td>
                        <span className={styles.matrixAverage}>{preschool ? masteryLevelLabelForStudent(periodAssessments, p.workspace.scores, student.id) : formattedAverage(average)}</span>
                      </td>
                      {periodAssessments.map((assessment) => {
                        const score = scoreFor(assessment.id, student.id);
                        const specialStatus = score?.status === "absent"
                          ? "Abs"
                          : score?.status === "exempt" ? "Disp." : "";
                        return (
                          <td key={`${assessment.id}-${student.id}`} className={!score || score.status === "not_graded" ? styles.missingScore : styles.scoreCell}>
                            {preschool ? (
                              <select
                                aria-label={`Niveau de maîtrise de ${student.lastName} ${student.firstName} pour ${assessment.title}`}
                                value={score?.mastery || "not_evaluated"}
                                disabled={locked || assessment.locked}
                                onFocus={() => p.setAssessmentId(assessment.id)}
                                onChange={(e) => void p.changeScore(
                                  assessment.id,
                                  student.id,
                                  "",
                                  e.target.value === "not_evaluated" ? "not_graded" : "graded",
                                  e.target.value as MasteryLevel,
                                )}
                              >
                                {MASTERY_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.shortLabel}</option>)}
                              </select>
                            ) : specialStatus || (
                              <input
                                className={styles.matrixScoreInput}
                                aria-label={`Note de ${student.lastName} ${student.firstName} pour ${assessment.title}`}
                                type="number"
                                min="0"
                                max={assessment.maxScore}
                                step="0.01"
                                disabled={locked || assessment.locked}
                                defaultValue={score?.status === "graded" ? score.value ?? "" : ""}
                                onFocus={() => p.setAssessmentId(assessment.id)}
                                onBlur={(e) => void p.changeScore(
                                  assessment.id,
                                  student.id,
                                  e.target.value,
                                  e.target.value === "" ? "not_graded" : "graded",
                                )}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><b>{preschool ? "Synthèse" : "Moyenne de classe"}</b></td>
                  <td>
                    {preschool ? "Sans classement" : formattedAverage(classPeriodAverage())}
                  </td>
                  {periodAssessments.map((assessment) => (
                    <td key={`${assessment.id}-average`}>
                      {preschool ? "—" : formattedAverage(assessmentAverageForClass(assessment))}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div className={`${styles.card} ${styles.wide}`}>
        <div className={styles.inlineTitle}>
          <div>
            <h2>{preschool ? "Saisie détaillée d’une observation" : "Saisie détaillée d’une évaluation"}</h2>
            <p className={styles.muted}>
              {preschool ? "Sélectionnez un niveau de maîtrise pour chaque enfant : acquis, en cours d’acquisition, non encore acquis ou non évalué." : "Sélectionnez une colonne du relevé ou une évaluation dans le registre. Absent, dispensé et non noté sont exclus des moyennes."}
            </p>
          </div>
          <div className={styles.miniActions}>
            <button onClick={p.exportScores} disabled={!p.currentAssessment}>
              <Download /> Export CSV
            </button>
            <label>
              <Upload /> Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={p.importScores}
              />
            </label>
          </div>
        </div>
        {!p.currentAssessment || !currentClass ? (
          <div className={styles.empty}>
            <FileSpreadsheet /> Sélectionnez une classe, une période et une
            évaluation.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Élève</th>
                  <th>{preschool ? "Niveau de maîtrise" : `Note / ${p.currentAssessment.maxScore}`}</th>
                  {!preschool && <th>Statut</th>}
                  <th>Enregistrement</th>
                </tr>
              </thead>
              <tbody>
                {currentClass.students.map((student) => {
                  const score = p.workspace.scores.find(
                    (item) =>
                      item.assessmentId === p.currentAssessment!.id &&
                      item.studentId === student.id,
                  );
                  const status = score?.status || "not_graded";
                  return (
                    <tr key={`${p.currentAssessment!.id}-${student.id}`}>
                      <td>
                        <b>
                          {student.lastName.toLocaleUpperCase("fr")}{" "}
                          {student.firstName}
                        </b>
                      </td>
                      <td>
                        {preschool ? (
                          <select
                            value={score?.mastery || "not_evaluated"}
                            disabled={locked || p.currentAssessment!.locked}
                            onChange={(e) => void p.changeScore(p.currentAssessment!.id, student.id, "", e.target.value === "not_evaluated" ? "not_graded" : "graded", e.target.value as MasteryLevel)}
                          >
                            {MASTERY_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : (
                        <input
                          type="number"
                          min="0"
                          max={p.currentAssessment!.maxScore}
                          step="0.01"
                          disabled={locked || p.currentAssessment!.locked || status !== "graded"}
                          defaultValue={score?.value ?? ""}
                          onBlur={(e) =>
                            void p.changeScore(
                              p.currentAssessment!.id,
                              student.id,
                              e.target.value,
                              status,
                            )
                          }
                        />)}
                      </td>
                      {!preschool && <td>
                        <select
                          value={status}
                          disabled={locked || p.currentAssessment!.locked}
                          onChange={(e) =>
                            void p.changeScore(
                              p.currentAssessment!.id,
                              student.id,
                              score?.value?.toString() || "",
                              e.target.value as ScoreStatus,
                            )
                          }
                        >
                          <option value="graded">Noté</option>
                          <option value="absent">Absent</option>
                          <option value="exempt">Dispensé</option>
                          <option value="not_graded">Non noté</option>
                        </select>
                      </td>}
                      <td>
                        <span className={styles.pill}>
                          {score ? "Brouillon enregistré" : "À saisir"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editorOpen && (
        <div className={styles.assessmentOverlay} role="dialog" aria-modal="true" aria-labelledby="assessment-editor-title">
          <form
            className={styles.assessmentEditor}
            onSubmit={async (event) => {
              if (await p.addAssessment(event)) setEditorOpen(false);
            }}
          >
            <div className={styles.editorHeader}>
              <div>
                <small>{preschool ? "NOUVELLE OBSERVATION" : "NOUVELLE COLONNE DE NOTES"}</small>
                <h2 id="assessment-editor-title">{preschool ? "Créer une observation" : "Créer un devoir"}</h2>
                <p>{currentClass?.name || "Classe"} · {p.workspace.periods.find((item) => item.id === p.periodId)?.label || "Période"}</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => setEditorOpen(false)}><X /></button>
            </div>
            <div className={styles.editorBody}>
              <label className={styles.check}>
                <input name="locked" type="checkbox" />
                Verrouiller {preschool ? "l’observation" : "le devoir"} après sa création
              </label>
              <div className={styles.two}>
                <label>
                  Titre {preschool ? "de l’observation" : "du devoir"}
                  <input name="title" required minLength={3} placeholder={preschool ? "Ex. Reconnaître son prénom" : "Ex. Contrôle de lecture"} autoFocus />
                </label>
                <label>
                  Catégorie
                  <select name="category" defaultValue="Devoir surveillé">
                    <option>Interrogation</option>
                    <option>Devoir surveillé</option>
                    <option>Exercice</option>
                    <option>Évaluation diagnostique</option>
                    <option>Évaluation formative</option>
                    <option>Évaluation sommative</option>
                  </select>
                </label>
              </div>
              <div className={styles.two}>
                <label>
                  {preschool ? "Domaine d’apprentissage" : "Matière"}
                  <select name="subject" defaultValue={selectedSubject}>
                    {subjectOptions.map((item) => <option key={item}>{item}</option>)}
                  </select>
                </label>
                <label>
                  Sujet existant <span className={styles.muted}>(facultatif)</span>
                  <select name="evaluationId">
                    <option value="">Aucun</option>
                    {p.evaluations
                      .filter((item) => !item.classId || item.classId === p.classId)
                      .map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
              </div>
              <div className={styles.two}>
                <label>
                  Date {preschool ? "de l’observation" : "du devoir"}
                  <input key={plannedDate} name="date" type="date" required defaultValue={plannedDate} />
                </label>
                <label>
                  Publication {preschool ? "du suivi" : "des notes"}
                  <input name="publishedOn" type="date" defaultValue={plannedDate} />
                </label>
              </div>
              {!preschool && <div className={styles.two}>
                <label>
                  Notation sur
                  <input name="maxScore" type="number" min="1" step="0.01" defaultValue={p.workspace.settings.maxScore} />
                </label>
                <label>
                  Coefficient
                  <input name="coefficient" type="number" min="0.01" step="0.01" defaultValue="1" />
                </label>
              </div>}
              <label>
                Thème ou compétence travaillée <span className={styles.muted}>(facultatif)</span>
                <input name="theme" placeholder="Ex. Compréhension du texte" />
              </label>
              {p.selectedWeek && <small className={styles.muted}>Semaine {p.selectedWeek} sélectionnée dans le calendrier.</small>}
            </div>
            <div className={styles.editorActions}>
              <button type="button" className="btn btn-light" onClick={() => setEditorOpen(false)}>Annuler</button>
              <button className="btn btn-primary"><Save /> {preschool ? "Créer et observer" : "Créer et saisir les notes"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
