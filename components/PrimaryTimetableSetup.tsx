"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadActiveSchoolClasses } from "@/lib/active-school-classes";
import type { ClassRecord } from "@/lib/class-store";
import {
  buildPrimaryTimetableSetup,
  subjectsForPrimaryClass,
  type PrimaryTimetableExceptionInput,
} from "@/lib/platform/primary-timetable-setup";
import { inspectTimetableGeneration } from "@/lib/platform/timetable-generator";
import {
  defaultPlatformWorkspace,
  loadPlatformWorkspace,
  savePlatformWorkspace,
} from "@/lib/platform/store";
import type { PlatformWorkspace } from "@/lib/platform/types";
import { assertSubscriptionWriteAllowed } from "@/lib/subscriptions/write-guard";
import styles from "./PrimaryTimetableSetup.module.css";

type ExceptionRow = PrimaryTimetableExceptionInput & { id: string };

function teacherName(workspace: PlatformWorkspace, teacherId: string) {
  const teacher = workspace.users.find((item) => item.id === teacherId);
  return teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : "";
}

export function PrimaryTimetableSetup() {
  const [workspace, setWorkspace] = useState<PlatformWorkspace>(defaultPlatformWorkspace);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [hours, setHours] = useState<Record<string, number>>({});
  const [titulars, setTitulars] = useState<Record<string, string>>({});
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"info" | "success" | "error">("info");

  const hydrateForm = useCallback((nextWorkspace: PlatformWorkspace, nextClasses: ClassRecord[]) => {
    const schoolId = nextWorkspace.school?.id || "";
    const yearId =
      nextWorkspace.academicYears.find((item) => item.active)?.id ||
      nextWorkspace.school?.activeAcademicYearId ||
      nextWorkspace.academicYears[0]?.id ||
      "";
    const schoolSubjects = nextWorkspace.subjects.filter(
      (subject) => subject.active && (!subject.schoolId || subject.schoolId === schoolId),
    );
    setHours(
      Object.fromEntries(schoolSubjects.map((subject) => [subject.id, Number(subject.weeklyHours) || 0])),
    );

    const activeTeachers = nextWorkspace.users.filter(
      (user) =>
        (!user.schoolId || user.schoolId === schoolId) &&
        user.status === "active" &&
        ["teacher", "head_teacher"].includes(user.role),
    );
    const nextTitulars: Record<string, string> = {};
    for (const schoolClass of nextClasses) {
      const existing = nextWorkspace.assignments.find(
        (assignment) =>
          assignment.active &&
          assignment.classId === schoolClass.id &&
          assignment.headTeacher &&
          (!yearId || !assignment.academicYearId || assignment.academicYearId === yearId),
      );
      const scopedTeacher = activeTeachers.find((teacher) => teacher.scopeClassIds?.includes(schoolClass.id));
      nextTitulars[schoolClass.id] = existing?.teacherId || scopedTeacher?.id || "";
    }
    setTitulars(nextTitulars);

    const deduped = new Map<string, ExceptionRow>();
    for (const assignment of nextWorkspace.assignments) {
      if (
        !assignment.active ||
        assignment.headTeacher ||
        !nextClasses.some((item) => item.id === assignment.classId) ||
        (yearId && assignment.academicYearId && assignment.academicYearId !== yearId)
      ) {
        continue;
      }
      const key = `${assignment.classId}|${assignment.subjectId}`;
      if (!deduped.has(key)) {
        deduped.set(key, {
          id: assignment.id || crypto.randomUUID(),
          classId: assignment.classId,
          subjectId: assignment.subjectId,
          teacherId: assignment.teacherId,
        });
      }
    }
    setExceptions([...deduped.values()]);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [workspaceResult, classResult] = await Promise.all([
        loadPlatformWorkspace(),
        loadActiveSchoolClasses(),
      ]);
      setWorkspace(workspaceResult.workspace);
      setClasses(classResult.items);
      hydrateForm(workspaceResult.workspace, classResult.items);
      setMessage("");
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Chargement du paramétrage EDT impossible.");
    } finally {
      setLoading(false);
    }
  }, [hydrateForm]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const schoolId = workspace.school?.id || "";
  const subjects = useMemo(
    () =>
      workspace.subjects.filter(
        (subject) => subject.active && (!subject.schoolId || subject.schoolId === schoolId),
      ),
    [workspace.subjects, schoolId],
  );
  const teachers = useMemo(
    () =>
      workspace.users
        .filter(
          (user) =>
            (!user.schoolId || user.schoolId === schoolId) &&
            user.status === "active" &&
            ["teacher", "head_teacher"].includes(user.role),
        )
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr")),
    [workspace.users, schoolId],
  );
  const levelById = useMemo(
    () => new Map(workspace.levels.map((level) => [level.id, level.label])),
    [workspace.levels],
  );
  const generation = useMemo(
    () => inspectTimetableGeneration(workspace, classes),
    [workspace, classes],
  );

  function addException() {
    setExceptions((items) => [
      ...items,
      { id: crypto.randomUUID(), classId: "", subjectId: "", teacherId: "" },
    ]);
  }

  function updateException(id: string, patch: Partial<ExceptionRow>) {
    setExceptions((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeException(id: string) {
    setExceptions((items) => items.filter((item) => item.id !== id));
  }

  async function saveAutomaticSetup() {
    if (saving) return;
    setMessage("");
    setMessageKind("info");
    const result = buildPrimaryTimetableSetup(workspace, classes, {
      titularByClassId: titulars,
      weeklyHoursBySubjectId: hours,
      exceptions: exceptions.map(({ classId, subjectId, teacherId }) => ({
        classId,
        subjectId,
        teacherId,
      })),
    });
    if (!result.ready) {
      setMessageKind("error");
      setMessage(result.errors.join("\n"));
      return;
    }

    setSaving(true);
    try {
      await assertSubscriptionWriteAllowed(schoolId);
      if (!result.metadata.length) {
        setWorkspace(result.workspace);
        setMessageKind("success");
        setMessage("Le paramétrage est déjà à jour. Vous pouvez générer l’emploi du temps.");
        return;
      }
      const saved = await savePlatformWorkspace(result.workspace, result.metadata);
      setWorkspace(saved.workspace);
      hydrateForm(saved.workspace, classes);
      if (saved.blocked) {
        setMessageKind("error");
        setMessage(saved.message);
        return;
      }
      setMessageKind("success");
      setMessage(
        `Paramétrage enregistré : ${result.summary.classes} classe(s), ${result.summary.titularAssignments} affectation(s) de titulaire, ${result.summary.exceptions} exception(s). Vous pouvez maintenant utiliser « Générer automatiquement » ci-dessous.`,
      );
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Enregistrement du paramétrage impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className={styles.shell}><div className={styles.card}>Chargement du paramétrage automatique…</div></section>;
  }
  if (workspace.school?.schoolType !== "primary") return null;

  return (
    <section className={styles.shell} aria-label="Paramétrage automatique de l’emploi du temps">
      <div className={styles.hero}>
        <div>
          <span className={styles.kicker}>EDT · PRIMAIRE</span>
          <h1>Paramétrage automatique</h1>
          <p>
            Le titulaire enseigne toutes les matières de sa classe par défaut. Vous ne définissez
            séparément que les matières confiées à un enseignant spécialisé, comme le sport ou
            l’informatique.
          </p>
        </div>
        <div className={generation.ready ? styles.ready : styles.pending}>
          <strong>{generation.ready ? "Prêt à générer" : "À compléter"}</strong>
          <span>{generation.ready ? `${generation.plannedPeriods} créneau(x) prévu(s)` : `${generation.blockers.length} point(s) bloquant(s)`}</span>
        </div>
      </div>

      {message ? (
        <div className={`${styles.message} ${styles[messageKind]}`} role={messageKind === "error" ? "alert" : "status"}>
          {message.split("\n").map((line) => <div key={line}>{line}</div>)}
        </div>
      ) : null}

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div><span>1</span><div><h2>Volumes hebdomadaires</h2><p>Une seule saisie par matière, jamais créneau par créneau.</p></div></div>
          </div>
          <div className={styles.subjectList}>
            {subjects.map((subject) => (
              <label key={subject.id} className={styles.subjectRow}>
                <span><b>{subject.label}</b><small>{levelById.get(subject.levelId) || "Tous niveaux"}</small></span>
                <span className={styles.hoursField}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={hours[subject.id] ?? 0}
                    onChange={(event) => setHours((values) => ({ ...values, [subject.id]: Number(event.target.value) }))}
                    aria-label={`Volume hebdomadaire de ${subject.label}`}
                  />
                  <small>h/sem.</small>
                </span>
              </label>
            ))}
          </div>
        </article>

        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div><span>2</span><div><h2>Titulaires des classes</h2><p>Le titulaire est automatiquement affecté à toutes les matières de sa classe.</p></div></div>
          </div>
          <div className={styles.classList}>
            {classes.map((schoolClass) => (
              <label key={schoolClass.id} className={styles.classRow}>
                <span><b>{schoolClass.name}</b><small>{schoolClass.level}</small></span>
                <select
                  value={titulars[schoolClass.id] || ""}
                  onChange={(event) => setTitulars((values) => ({ ...values, [schoolClass.id]: event.target.value }))}
                >
                  <option value="">Choisir le titulaire</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </article>
      </div>

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <div><span>3</span><div><h2>Exceptions par matière</h2><p>Ajoutez uniquement les cours assurés par un autre enseignant : sport, informatique, langue, etc.</p></div></div>
          <button type="button" className={styles.secondaryButton} onClick={addException}>+ Ajouter une exception</button>
        </div>
        {!exceptions.length ? (
          <div className={styles.empty}>Aucune exception : chaque titulaire garde toutes les matières de sa classe.</div>
        ) : (
          <div className={styles.exceptionList}>
            {exceptions.map((exception) => {
              const selectedClass = classes.find((item) => item.id === exception.classId);
              const availableSubjects = selectedClass
                ? subjectsForPrimaryClass(workspace, selectedClass)
                : subjects;
              return (
                <div className={styles.exceptionRow} key={exception.id}>
                  <select value={exception.classId} onChange={(event) => updateException(exception.id, { classId: event.target.value, subjectId: "" })}>
                    <option value="">Classe</option>
                    {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <select value={exception.subjectId} onChange={(event) => updateException(exception.id, { subjectId: event.target.value })}>
                    <option value="">Matière</option>
                    {availableSubjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <select value={exception.teacherId} onChange={(event) => updateException(exception.id, { teacherId: event.target.value })}>
                    <option value="">Enseignant spécialisé</option>
                    {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}
                  </select>
                  <button type="button" className={styles.removeButton} onClick={() => removeException(exception.id)}>Retirer</button>
                </div>
              );
            })}
          </div>
        )}
      </article>

      <div className={styles.footerBar}>
        <div>
          <b>{classes.length} classe(s) · {subjects.length} matière(s) · {teachers.length} enseignant(s)</b>
          <small>
            {exceptions.length
              ? `${exceptions.length} exception(s) prévue(s)`
              : "Aucune exception prévue"}
            {generation.ready && generation.assignmentCount
              ? ` · configuration actuelle : ${generation.assignmentCount} affectation(s)`
              : ""}
          </small>
        </div>
        <button type="button" className={styles.primaryButton} onClick={() => void saveAutomaticSetup()} disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer le paramétrage automatique"}
        </button>
      </div>

      {generation.blockers.length ? (
        <details className={styles.diagnostics}>
          <summary>Voir ce qui manque encore pour la génération</summary>
          <ul>{generation.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      ) : null}

      {exceptions.some((item) => item.teacherId && item.teacherId === titulars[item.classId]) ? (
        <p className={styles.note}>Une exception désigne actuellement le même enseignant que le titulaire ; elle est autorisée mais inutile.</p>
      ) : null}

      {teachers.length === 0 ? <p className={styles.note}>Créez d’abord au moins un profil enseignant pédagogique.</p> : null}
      {classes.some((item) => !titulars[item.id]) ? <p className={styles.note}>Chaque classe doit avoir un titulaire avant la génération.</p> : null}
      {subjects.some((item) => Number(hours[item.id] || 0) <= 0) ? <p className={styles.note}>Les matières à 0 h/semaine bloquent volontairement la génération : définissez leur volume réel.</p> : null}
      {exceptions.filter((item) => item.teacherId).map((item) => teacherName(workspace, item.teacherId)).filter(Boolean).length ? null : null}
    </section>
  );
}
