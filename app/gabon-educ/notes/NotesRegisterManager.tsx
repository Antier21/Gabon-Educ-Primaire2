"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpenCheck,
  Cloud,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { AcademicWeekStrip } from "@/components/AcademicWeekStrip";
import { SubscriptionReadOnlyPanel } from "@/components/SubscriptionReadOnlyPanel";
import styles from "@/components/Gradebook.module.css";
import { SUBJECTS, listClasses, type ClassRecord } from "@/lib/class-store";
import { listEvaluations, type EvaluationRecord } from "@/lib/evaluation-store";
import { getDefaultSubjectsForLevel, isPreschoolLevel } from "@/lib/school-profiles";
import { validScore } from "@/lib/grading/calculations";
import { syncScoreStatements } from "@/lib/grading/statements";
import {
  defaultWorkspace,
  loadGradingWorkspace,
  parseScoresCsv,
  periodIsLocked,
  saveGradingWorkspace,
  scoresToCsv,
  upsertAssessment,
  upsertScore,
} from "@/lib/grading/store";
import type {
  AssessmentScore,
  GradeAssessment,
  GradingWorkspace,
  MasteryLevel,
  ScoreStatus,
} from "@/lib/grading/types";
import { MASTERY_LEVEL_OPTIONS, masteryLevelLabel } from "@/lib/grading/types";
import { storageModeLabel, type StorageMode } from "@/lib/storage-mode";
import { useSubscriptionAccess } from "@/lib/subscriptions/use-subscription-access";

type Notice = { kind: "success" | "error"; text: string } | null;

type CellValue = {
  status: ScoreStatus;
  value: number | null;
};

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
) {
  const normalized = workspace.assessments.map((assessment) => {
    const level = classes.find((item) => item.id === assessment.classId)?.level;
    const evaluationMode = isPreschoolLevel(level) ? "mastery" as const : "numeric" as const;
    return assessment.evaluationMode === evaluationMode ? assessment : { ...assessment, evaluationMode };
  });
  const existingKeys = new Set(normalized.map((item) => item.evaluationId || item.id));
  const activePeriodId = workspace.settings.activePeriodId || workspace.periods[0]?.id || "period-t1";
  const additions: GradeAssessment[] = evaluations
    .filter((evaluation) => evaluation.classId && !existingKeys.has(evaluation.id))
    .map((evaluation) => {
      const level = classes.find((item) => item.id === evaluation.classId)?.level;
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
        evaluationMode: isPreschoolLevel(level) ? "mastery" : "numeric",
      };
    });
  return additions.length
    ? { ...workspace, assessments: [...normalized, ...additions] }
    : normalized.some((item, index) => item !== workspace.assessments[index])
      ? { ...workspace, assessments: normalized }
      : workspace;
}

function displayCell(score?: AssessmentScore) {
  if (!score || score.status === "not_graded") return "";
  if (score.status === "absent") return "Abs";
  if (score.status === "zero_penalty") return "Z";
  if (score.status === "not_ranked") return "N";
  if (score.status === "exempt") return "Disp";
  return score.value === null ? "" : String(score.value).replace(".", ",");
}

function parseCell(raw: string, maxScore: number): CellValue {
  const trimmed = raw.trim();
  if (!trimmed) return { status: "not_graded", value: null };
  const code = trimmed.toLocaleUpperCase("fr").replace(/\.$/, "");
  if (code === "ABS") return { status: "absent", value: null };
  if (code === "Z") return { status: "zero_penalty", value: 0 };
  if (code === "N") return { status: "not_ranked", value: null };
  if (code === "DISP" || code === "DISPENSÉ" || code === "DISPENSE")
    return { status: "exempt", value: null };
  const numeric = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > maxScore)
    throw new Error(`Saisissez une note entre 0 et ${maxScore}, ou Abs, Z, N, Disp.`);
  return { status: "graded", value: numeric };
}

function normalizeImportedStatus(score: AssessmentScore): AssessmentScore {
  const raw = String(score.status || "not_graded").toLocaleLowerCase("fr");
  let status: ScoreStatus;
  if (["abs", "absent"].includes(raw)) status = "absent";
  else if (["z", "zero_penalty", "zéro", "zero"].includes(raw)) status = "zero_penalty";
  else if (["n", "not_ranked", "non noté", "non note"].includes(raw)) status = "not_ranked";
  else if (["disp", "dispensé", "dispense", "exempt"].includes(raw)) status = "exempt";
  else if (["graded", "noté", "note"].includes(raw)) status = "graded";
  else status = "not_graded";
  return {
    ...score,
    status,
    value: status === "zero_penalty" ? 0 : status === "graded" ? score.value : null,
  };
}

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

export function NotesRegisterManager() {
  const subscriptionAccess = useSubscriptionAccess();
  const [workspace, setWorkspace] = useState<GradingWorkspace>(defaultWorkspace);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [mode, setMode] = useState<StorageMode>("demo");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [ready, setReady] = useState(false);
  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [selectedWeek, setSelectedWeek] = useState<number | undefined>();
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    void Promise.all([loadGradingWorkspace(), listClasses(), listEvaluations()])
      .then(async ([grading, classData, evaluationData]) => {
        const synchronized = synchronizeEvaluationsWithGradebook(
          grading.workspace,
          evaluationData.items,
          classData.items,
        );
        if (synchronized !== grading.workspace) {
          try {
            await saveGradingWorkspace(synchronized);
          } catch {
            // La lecture reste possible même si la synchronisation automatique ne peut pas écrire.
          }
        }
        setWorkspace(synchronized);
        setClasses(classData.items);
        setEvaluations(evaluationData.items);
        setMode(grading.mode);
        setMessage(grading.message);
        const firstClass = classData.items[0]?.id || "";
        setClassId(firstClass);
        setPeriodId(
          synchronized.settings.activePeriodId || synchronized.periods[0]?.id || "",
        );
      })
      .catch((error) => {
        setNotice({ kind: "error", text: error instanceof Error ? error.message : "Chargement impossible." });
      })
      .finally(() => setReady(true));
  }, []);

  const currentClass = classes.find((item) => item.id === classId);
  const preschool = isPreschoolLevel(currentClass?.level);
  const locked = periodIsLocked(workspace, periodId);

  const configuredSubjects = workspace.classSubjects.filter(
    (item) =>
      item.classId === classId &&
      (!item.periodId || item.periodId === periodId) &&
      item.active,
  );
  const subjectOptions = useMemo(
    () => Array.from(new Set((configuredSubjects.length
      ? configuredSubjects.map((item) => item.subject)
      : [
          ...workspace.assessments.filter((item) => item.classId === classId).map((item) => item.subject),
          ...(currentClass ? getDefaultSubjectsForLevel(currentClass.level) : SUBJECTS),
        ]).filter(Boolean))),
    [configuredSubjects, workspace.assessments, classId, currentClass],
  );
  const selectedSubject = subjectOptions.includes(subjectFilter) ? subjectFilter : "";
  const allPeriodAssessments = workspace.assessments
    .filter((item) => item.classId === classId && item.periodId === periodId && item.active)
    .sort((a, b) => `${a.date}${a.title}`.localeCompare(`${b.date}${b.title}`, "fr"));
  const periodAssessments = selectedSubject
    ? allPeriodAssessments.filter((item) => item.subject === selectedSubject)
    : allPeriodAssessments;
  const currentAssessment =
    periodAssessments.find((item) => item.id === assessmentId) || periodAssessments[0];

  const scoreFor = (assessmentIdValue: string, studentId: string) =>
    workspace.scores.find(
      (item) => item.assessmentId === assessmentIdValue && item.studentId === studentId,
    );
  const normalized = (value: number, assessment: GradeAssessment) =>
    assessment.maxScore > 0
      ? (value / assessment.maxScore) * workspace.settings.maxScore
      : value;
  const studentAverage = (studentId: string) => {
    let total = 0;
    let coefficients = 0;
    for (const assessment of periodAssessments) {
      const score = scoreFor(assessment.id, studentId);
      if (!score || !validScore(score)) continue;
      const coefficient = Number.isFinite(assessment.coefficient) ? assessment.coefficient : 1;
      total += normalized(score.value as number, assessment) * coefficient;
      coefficients += coefficient;
    }
    if (!coefficients) return null;
    return Number((total / coefficients).toFixed(workspace.settings.decimals));
  };
  const assessmentAverageForClass = (assessment: GradeAssessment) => {
    if (!currentClass) return null;
    const values = currentClass.students
      .map((student) => {
        const score = scoreFor(assessment.id, student.id);
        return score && validScore(score)
          ? normalized(score.value as number, assessment)
          : null;
      })
      .filter((value): value is number => value !== null);
    if (!values.length) return null;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(workspace.settings.decimals));
  };
  const classPeriodAverage = () => {
    if (!currentClass) return null;
    const values = currentClass.students
      .map((student) => studentAverage(student.id))
      .filter((value): value is number => value !== null);
    if (!values.length) return null;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(workspace.settings.decimals));
  };
  const formattedAverage = (value: number | null) =>
    value === null
      ? "—"
      : value.toLocaleString("fr-FR", {
          minimumFractionDigits: workspace.settings.decimals,
          maximumFractionDigits: workspace.settings.decimals,
        });

  async function persist(next: GradingWorkspace, success = "Relevé enregistré.") {
    try {
      const result = await saveGradingWorkspace(next);
      setWorkspace(result.workspace);
      setMode(result.mode);
      setNotice({ kind: "success", text: success });
      return result.workspace;
    } catch (error) {
      const text = error instanceof Error ? error.message : "Enregistrement impossible.";
      setNotice({ kind: "error", text });
      throw error;
    }
  }

  async function refreshStatements(next: GradingWorkspace) {
    if (!currentClass || !classId || !periodId) return;
    const result = await syncScoreStatements({
      workspace: next,
      classId,
      periodId,
      periodLabel: next.periods.find((item) => item.id === periodId)?.label || "",
      students: currentClass.students,
    });
    if (result.error) setMessage(result.error);
  }

  async function saveScore(
    assessment: GradeAssessment,
    studentId: string,
    status: ScoreStatus,
    value: number | null,
    mastery?: MasteryLevel,
  ) {
    const existing = scoreFor(assessment.id, studentId);
    if (
      existing &&
      existing.status === status &&
      existing.value === value &&
      existing.mastery === mastery
    ) return;
    const score: AssessmentScore = {
      id: existing?.id || crypto.randomUUID(),
      assessmentId: assessment.id,
      studentId,
      value: status === "zero_penalty" ? 0 : status === "graded" ? value : null,
      status,
      mastery,
      updatedAt: new Date().toISOString(),
    };
    try {
      const next = upsertScore(workspace, score);
      const saved = await persist(next, "Note enregistrée.");
      await refreshStatements(saved);
    } catch {
      // persist affiche déjà le message d'erreur.
    }
  }

  async function handleCell(assessment: GradeAssessment, studentId: string, raw: string) {
    try {
      const parsed = parseCell(raw, assessment.maxScore);
      await saveScore(assessment, studentId, parsed.status, parsed.value);
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Valeur de note invalide.",
      });
    }
  }

  async function addAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId || !periodId) return;
    const data = new FormData(event.currentTarget);
    const linked = evaluations.find((item) => item.id === String(data.get("evaluationId")));
    const item: GradeAssessment = {
      id: crypto.randomUUID(),
      evaluationId: linked?.id || "",
      classId,
      subject: String(data.get("subject") || linked?.subject || subjectOptions[0] || ""),
      periodId,
      title: String(data.get("title") || linked?.title || "Évaluation"),
      date: String(data.get("date") || linked?.date || new Date().toISOString().slice(0, 10)),
      maxScore: preschool ? workspace.settings.maxScore : Number(data.get("maxScore")) || linked?.maxScore || workspace.settings.maxScore,
      coefficient: preschool ? 1 : Number(data.get("coefficient")) || linked?.coefficient || 1,
      active: true,
      category: String(data.get("category") || "Devoir surveillé"),
      theme: String(data.get("theme") || ""),
      locked: data.get("locked") === "on",
      evaluationMode: preschool ? "mastery" : "numeric",
    };
    try {
      const saved = await persist(upsertAssessment(workspace, item), "Évaluation ajoutée au relevé.");
      setAssessmentId(item.id);
      setWorkspace(saved);
      setEditorOpen(false);
    } catch {
      // persist affiche déjà le message.
    }
  }

  function exportScores() {
    if (!currentAssessment || !currentClass) return;
    const blob = new Blob(
      ["\uFEFF" + scoresToCsv(currentAssessment, currentClass.students, workspace.scores)],
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
      for (const imported of parseScoresCsv(await file.text(), currentAssessment)) {
        next = upsertScore(next, normalizeImportedStatus(imported));
      }
      const saved = await persist(next, "Notes CSV importées.");
      await refreshStatements(saved);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Import CSV impossible." });
    } finally {
      event.target.value = "";
    }
  }

  if (!ready) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>
          <LoaderCircle className={styles.spin} /> Chargement du relevé…
        </div>
      </main>
    );
  }

  const plannedDate = selectedWeek ? weekToPlanningDate(selectedWeek) : new Date().toISOString().slice(0, 10);

  return (
    <main className={`${styles.page} gradebook-print-page`}>
      {subscriptionAccess.blocked && <SubscriptionReadOnlyPanel message={subscriptionAccess.message} />}
      <fieldset className="subscription-write-lock gradebook-print-fieldset" disabled={subscriptionAccess.blocked}>
        <header className={styles.topbar}>
          <div className={styles.topLeft}>
            <Link className="icon-btn" href="/gabon-educ/tableau-de-bord" aria-label="Retour"><ArrowLeft /></Link>
            <Brand />
            <div><b>Notes</b><small>Relevé évolutif et saisie directe</small></div>
          </div>
          <span className={styles.mode}><Cloud /> {storageModeLabel(mode)} · {message}</span>
        </header>
        <section className={styles.shell}>
          <div className={styles.hero}>
            <div>
              <small>ESPACE PROFESSEUR</small>
              <h1>Relevé de notes</h1>
              <p>Chaque évaluation ajoute une colonne. Saisissez la note ou un code directement dans la case correspondante.</p>
            </div>
            <Link className="btn btn-light" href="/gabon-educ/evaluations"><BookOpenCheck /> Gérer les sujets d’évaluation</Link>
          </div>
          <AcademicWeekStrip compact selectedWeek={selectedWeek} onSelect={setSelectedWeek} title="Repère des semaines du relevé" />
          {notice && <div className={`${styles.notice} ${notice.kind === "error" ? styles.error : ""}`}>{notice.text}</div>}

          <div className={`${styles.card} ${styles.wide} ${styles.gradebookToolbar}`}>
            <div className={styles.contextSelectors}>
              <label>
                Classe
                <select value={classId} onChange={(e) => { setClassId(e.target.value); setAssessmentId(""); }}>
                  <option value="">Sélectionner</option>
                  {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label>
                Période
                <select value={periodId} onChange={(e) => { setPeriodId(e.target.value); setAssessmentId(""); }}>
                  {workspace.periods.map((item) => <option key={item.id} value={item.id}>{item.label}{item.locked ? " (verrouillée)" : ""}</option>)}
                </select>
              </label>
              <label>
                {preschool ? "Domaine" : "Matière"}
                <select value={selectedSubject} onChange={(e) => { setSubjectFilter(e.target.value); setAssessmentId(""); }}>
                  <option value="">{preschool ? "Tous les domaines" : "Toutes les matières"}</option>
                  {subjectOptions.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </div>
            <button className="btn btn-primary" type="button" disabled={locked || !classId} onClick={() => setEditorOpen(true)}>
              <Plus /> {preschool ? "Créer une observation" : "Créer un devoir"}
            </button>
          </div>

          {locked && <p className={`${styles.roleNote} ${styles.wide}`}>Cette période est verrouillée. Le relevé est en lecture seule.</p>}

          <div className={`${styles.card} ${styles.wide}`}>
            <div className={styles.inlineTitle}>
              <div>
                <h2>{preschool ? "Carnet d’observations de la période" : "Relevé de notes de la période"}</h2>
                <p className={styles.muted}>
                  {preschool
                    ? "Chaque observation renseigne un niveau de maîtrise, sans note numérique."
                    : "Codes : Abs = absence justifiée, exclue de la moyenne · Z = absence non justifiée, comptée comme 0 · N = non noté, sans classement dans la matière · Disp = dispensé."}
                </p>
              </div>
              <div className={styles.miniActions}>
                <span className={styles.pill}>{periodAssessments.length} évaluation{periodAssessments.length > 1 ? "s" : ""}</span>
                {!preschool && (
                  <>
                    <button type="button" onClick={exportScores} disabled={!currentAssessment}><Download /> Export CSV</button>
                    <label title={currentAssessment ? `Importer les notes de ${currentAssessment.title}` : "Sélectionnez une colonne"}>
                      <Upload /> Import CSV
                      <input type="file" accept=".csv,text/csv" onChange={importScores} disabled={!currentAssessment} />
                    </label>
                  </>
                )}
              </div>
            </div>

            {!currentClass || !classId ? (
              <div className={styles.empty}><FileSpreadsheet /> Sélectionnez une classe pour construire le relevé.</div>
            ) : periodAssessments.length === 0 ? (
              <div className={styles.empty}><FileSpreadsheet /> Aucune évaluation pour cette période. Créez-en une : une nouvelle colonne apparaîtra automatiquement.</div>
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
                            className={`${styles.columnButton} ${currentAssessment?.id === assessment.id ? styles.selectedColumn : ""}`}
                            onClick={() => setAssessmentId(assessment.id)}
                            title="Sélectionner cette évaluation"
                          >
                            {assessment.title || assessment.category || "Évaluation"}
                            {!selectedSubject && assessment.subject && <em className={styles.columnSubject}>{assessment.subject}</em>}
                          </button>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      {periodAssessments.map((assessment) => (
                        <th key={`${assessment.id}-meta`}><small>{assessment.date || "date non précisée"}<br />{preschool ? "Maîtrise" : `Coef. ${assessment.coefficient} · /${assessment.maxScore}`}</small></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentClass.students.map((student) => (
                      <tr key={student.id}>
                        <td className={styles.studentNameCell}><b>{student.lastName.toLocaleUpperCase("fr")} {student.firstName}</b></td>
                        <td><span className={styles.matrixAverage}>{preschool ? masteryLevelLabelForStudent(periodAssessments, workspace.scores, student.id) : formattedAverage(studentAverage(student.id))}</span></td>
                        {periodAssessments.map((assessment) => {
                          const score = scoreFor(assessment.id, student.id);
                          return (
                            <td key={`${assessment.id}-${student.id}`} className={!score || score.status === "not_graded" ? styles.missingScore : styles.scoreCell}>
                              {preschool ? (
                                <select
                                  aria-label={`Niveau de maîtrise de ${student.lastName} ${student.firstName} pour ${assessment.title}`}
                                  value={score?.mastery || "not_evaluated"}
                                  disabled={locked || assessment.locked}
                                  onFocus={() => setAssessmentId(assessment.id)}
                                  onChange={(e) => void saveScore(
                                    assessment,
                                    student.id,
                                    e.target.value === "not_evaluated" ? "not_graded" : "graded",
                                    null,
                                    e.target.value as MasteryLevel,
                                  )}
                                >
                                  {MASTERY_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.shortLabel}</option>)}
                                </select>
                              ) : (
                                <input
                                  key={`${assessment.id}-${student.id}-${score?.updatedAt || score?.status || "new"}`}
                                  className={styles.matrixScoreInput}
                                  aria-label={`Note de ${student.lastName} ${student.firstName} pour ${assessment.title}`}
                                  type="text"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  disabled={locked || assessment.locked}
                                  defaultValue={displayCell(score)}
                                  placeholder="—"
                                  onFocus={(e) => { setAssessmentId(assessment.id); e.currentTarget.select(); }}
                                  onBlur={(e) => void handleCell(assessment, student.id, e.currentTarget.value)}
                                  title="Note, Abs, Z, N ou Disp"
                                />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td><b>{preschool ? "Synthèse" : "Moyenne de classe"}</b></td>
                      <td>{preschool ? "Sans classement" : formattedAverage(classPeriodAverage())}</td>
                      {periodAssessments.map((assessment) => (
                        <td key={`${assessment.id}-average`}>{preschool ? "—" : formattedAverage(assessmentAverageForClass(assessment))}</td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {editorOpen && (
            <div className={styles.assessmentOverlay} role="dialog" aria-modal="true" aria-labelledby="notes-assessment-editor-title">
              <form className={styles.assessmentEditor} onSubmit={addAssessment}>
                <div className={styles.editorHeader}>
                  <div>
                    <small>{preschool ? "NOUVELLE OBSERVATION" : "NOUVELLE COLONNE DE NOTES"}</small>
                    <h2 id="notes-assessment-editor-title">{preschool ? "Créer une observation" : "Créer un devoir"}</h2>
                    <p>{currentClass?.name || "Classe"} · {workspace.periods.find((item) => item.id === periodId)?.label || "Période"}</p>
                  </div>
                  <button type="button" className="icon-btn" aria-label="Fermer" onClick={() => setEditorOpen(false)}><X /></button>
                </div>
                <div className={styles.editorBody}>
                  <label className={styles.check}><input name="locked" type="checkbox" /> Verrouiller après la création</label>
                  <div className={styles.two}>
                    <label>Titre<input name="title" required minLength={3} placeholder="Ex. Contrôle de lecture" autoFocus /></label>
                    <label>Catégorie
                      <select name="category" defaultValue="Devoir surveillé">
                        <option>Interrogation</option><option>Devoir surveillé</option><option>Exercice</option><option>Évaluation diagnostique</option><option>Évaluation formative</option><option>Évaluation sommative</option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.two}>
                    <label>{preschool ? "Domaine" : "Matière"}
                      <select name="subject" defaultValue={selectedSubject || subjectOptions[0] || ""}>{subjectOptions.map((item) => <option key={item}>{item}</option>)}</select>
                    </label>
                    <label>Sujet existant <span className={styles.muted}>(facultatif)</span>
                      <select name="evaluationId"><option value="">Aucun</option>{evaluations.filter((item) => !item.classId || item.classId === classId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
                    </label>
                  </div>
                  <div className={styles.two}>
                    <label>Date<input key={plannedDate} name="date" type="date" required defaultValue={plannedDate} /></label>
                    {!preschool && <label>Coefficient<input name="coefficient" type="number" min="0.01" step="0.01" defaultValue="1" /></label>}
                  </div>
                  {!preschool && <label>Notation sur<input name="maxScore" type="number" min="1" step="0.01" defaultValue={workspace.settings.maxScore} /></label>}
                  <label>Thème ou compétence <span className={styles.muted}>(facultatif)</span><input name="theme" placeholder="Ex. Compréhension du texte" /></label>
                </div>
                <div className={styles.editorActions}>
                  <button type="button" className="btn btn-light" onClick={() => setEditorOpen(false)}>Annuler</button>
                  <button className="btn btn-primary"><Save /> Créer</button>
                </div>
              </form>
            </div>
          )}
        </section>
      </fieldset>
    </main>
  );
}
