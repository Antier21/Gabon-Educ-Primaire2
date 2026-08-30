"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadActiveSchoolClasses } from "@/lib/active-school-classes";
import type { ClassRecord } from "@/lib/class-store";
import {
  buildPrimaryTimetableSetup,
  subjectsForPrimaryClass,
  type PrimaryTimetableExceptionInput,
} from "@/lib/platform/primary-timetable-setup";
import {
  generateMissingTimetable,
  inspectTimetableGeneration,
  type TimetableGenerationOptions,
} from "@/lib/platform/timetable-generator";
import {
  defaultPlatformWorkspace,
  loadPlatformWorkspace,
  savePlatformWorkspace,
} from "@/lib/platform/store";
import type { PlatformWorkspace } from "@/lib/platform/types";
import type { SyncOperationMetadata } from "@/lib/sync/types";
import { assertSubscriptionWriteAllowed } from "@/lib/subscriptions/write-guard";
import styles from "./PrimaryTimetableSetup.module.css";

type ExceptionRow = PrimaryTimetableExceptionInput & { id: string };
type DayNumber = 1 | 2 | 3 | 4 | 5 | 6;

type SavedGenerationPreferences = {
  firstDay: DayNumber;
  lastDay: DayNumber;
  startsAt: string;
  endsAt: string;
};

const DAYS: Array<{ value: DayNumber; label: string }> = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
];
const DEFAULT_PREFERENCES: SavedGenerationPreferences = {
  firstDay: 1,
  lastDay: 5,
  startsAt: "07:30",
  endsAt: "17:40",
};

function preferenceKey(schoolId: string) {
  return `gabon-educ:primary-edt-generation:${schoolId || "local"}`;
}

function readGenerationPreferences(schoolId: string): SavedGenerationPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(preferenceKey(schoolId));
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<SavedGenerationPreferences>;
    const firstDay = Number(parsed.firstDay) as DayNumber;
    const lastDay = Number(parsed.lastDay) as DayNumber;
    return {
      firstDay: DAYS.some((day) => day.value === firstDay) ? firstDay : DEFAULT_PREFERENCES.firstDay,
      lastDay: DAYS.some((day) => day.value === lastDay) ? lastDay : DEFAULT_PREFERENCES.lastDay,
      startsAt: String(parsed.startsAt || DEFAULT_PREFERENCES.startsAt),
      endsAt: String(parsed.endsAt || DEFAULT_PREFERENCES.endsAt),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writeGenerationPreferences(schoolId: string, value: SavedGenerationPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(preferenceKey(schoolId), JSON.stringify(value));
}

function weekdaysBetween(firstDay: DayNumber, lastDay: DayNumber) {
  if (lastDay < firstDay) return [];
  return DAYS.filter((day) => day.value >= firstDay && day.value <= lastDay).map((day) => day.value);
}

function dayLabel(value: DayNumber) {
  return DAYS.find((day) => day.value === value)?.label || "";
}

export function PrimaryTimetableSetup() {
  const [workspace, setWorkspace] = useState<PlatformWorkspace>(defaultPlatformWorkspace);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [hours, setHours] = useState<Record<string, number>>({});
  const [titulars, setTitulars] = useState<Record<string, string>>({});
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [firstDay, setFirstDay] = useState<DayNumber>(DEFAULT_PREFERENCES.firstDay);
  const [lastDay, setLastDay] = useState<DayNumber>(DEFAULT_PREFERENCES.lastDay);
  const [startsAt, setStartsAt] = useState(DEFAULT_PREFERENCES.startsAt);
  const [endsAt, setEndsAt] = useState(DEFAULT_PREFERENCES.endsAt);
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
      const scopedTeacher = activeTeachers.find((teacher) =>
        teacher.scopeClassIds?.includes(schoolClass.id),
      );
      nextTitulars[schoolClass.id] = existing?.teacherId || scopedTeacher?.id || "";
    }
    setTitulars(nextTitulars);

    const deduped = new Map<string, ExceptionRow>();
    for (const assignment of nextWorkspace.assignments) {
      const schoolClass = nextClasses.find((item) => item.id === assignment.classId);
      if (
        !assignment.active ||
        assignment.headTeacher ||
        !schoolClass ||
        (yearId && assignment.academicYearId && assignment.academicYearId !== yearId) ||
        !subjectsForPrimaryClass(nextWorkspace, schoolClass).some(
          (subject) => subject.id === assignment.subjectId,
        )
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
      const preferences = readGenerationPreferences(workspaceResult.workspace.school?.id || "");
      setFirstDay(preferences.firstDay);
      setLastDay(preferences.lastDay);
      setStartsAt(preferences.startsAt);
      setEndsAt(preferences.endsAt);
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
  const subjects = useMemo(() => {
    const byId = new Map<string, PlatformWorkspace["subjects"][number]>();
    if (classes.length) {
      for (const schoolClass of classes) {
        for (const subject of subjectsForPrimaryClass(workspace, schoolClass)) {
          byId.set(subject.id, subject);
        }
      }
    } else {
      for (const subject of workspace.subjects) {
        if (subject.active && (!subject.schoolId || subject.schoolId === schoolId)) {
          byId.set(subject.id, subject);
        }
      }
    }
    return [...byId.values()].sort(
      (a, b) => a.bulletinOrder - b.bulletinOrder || a.label.localeCompare(b.label, "fr"),
    );
  }, [workspace, classes, schoolId]);

  const teachers = useMemo(
    () =>
      workspace.users
        .filter(
          (user) =>
            (!user.schoolId || user.schoolId === schoolId) &&
            user.status === "active" &&
            ["teacher", "head_teacher"].includes(user.role),
        )
        .sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "fr"),
        ),
    [workspace.users, schoolId],
  );
  const levelById = useMemo(
    () => new Map(workspace.levels.map((level) => [level.id, level.label])),
    [workspace.levels],
  );
  const generationOptions = useMemo<TimetableGenerationOptions>(
    () => ({ weekdays: weekdaysBetween(firstDay, lastDay), startsAt, endsAt }),
    [firstDay, lastDay, startsAt, endsAt],
  );
  const generation = useMemo(() => {
    let previewIndex = 0;
    const preview = buildPrimaryTimetableSetup(
      workspace,
      classes,
      {
        titularByClassId: titulars,
        weeklyHoursBySubjectId: hours,
        exceptions: exceptions.map(({ classId, subjectId, teacherId }) => ({
          classId,
          subjectId,
          teacherId,
        })),
      },
      {
        now: workspace.updatedAt || "2026-08-30T00:00:00.000Z",
        makeId: () => `preview-assignment-${previewIndex++}`,
      },
    );
    if (!preview.ready) {
      return {
        ready: false,
        blockers: preview.errors,
        warnings: [] as string[],
        classCount: classes.length,
        assignmentCount: 0,
        plannedPeriods: 0,
      };
    }
    return inspectTimetableGeneration(preview.workspace, classes, generationOptions);
  }, [workspace, classes, titulars, hours, exceptions, generationOptions]);

  function addException() {
    setExceptions((items) => [
      ...items,
      { id: crypto.randomUUID(), classId: "", subjectId: "", teacherId: "" },
    ]);
  }

  function updateException(id: string, patch: Partial<ExceptionRow>) {
    setExceptions((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function removeException(id: string) {
    setExceptions((items) => items.filter((item) => item.id !== id));
  }

  async function saveAndGenerate() {
    if (saving) return;
    setMessage("");
    setMessageKind("info");

    const setup = buildPrimaryTimetableSetup(workspace, classes, {
      titularByClassId: titulars,
      weeklyHoursBySubjectId: hours,
      exceptions: exceptions.map(({ classId, subjectId, teacherId }) => ({
        classId,
        subjectId,
        teacherId,
      })),
    });
    if (!setup.ready) {
      setMessageKind("error");
      setMessage(setup.errors.join("\n"));
      return;
    }

    const check = inspectTimetableGeneration(setup.workspace, classes, generationOptions);
    if (!check.ready) {
      setMessageKind("error");
      setMessage(check.blockers.join("\n"));
      return;
    }

    setSaving(true);
    try {
      await assertSubscriptionWriteAllowed(schoolId);
      const generated = generateMissingTimetable(setup.workspace, classes, generationOptions);
      const nextWorkspace: PlatformWorkspace = {
        ...setup.workspace,
        timetable: [...generated.slots, ...setup.workspace.timetable],
      };
      const operations: SyncOperationMetadata[] = [
        ...setup.metadata,
        ...generated.slots.map((slot) => ({
          module: "timetables" as const,
          operation: "create" as const,
          entityId: slot.id,
          payload: { slot },
        })),
      ];
      if (!operations.length) {
        operations.push({
          module: "settings",
          operation: "update",
          entityId: schoolId || "edt-settings",
          payload: { workspace: nextWorkspace },
        });
      }

      const saved = await savePlatformWorkspace(nextWorkspace, operations);
      setWorkspace(saved.workspace);
      hydrateForm(saved.workspace, classes);
      if (saved.blocked) {
        setMessageKind("error");
        setMessage(saved.message);
        return;
      }

      writeGenerationPreferences(schoolId, {
        firstDay,
        lastDay,
        startsAt,
        endsAt,
      });

      if (generated.unscheduledHours > 0) {
        setMessageKind("info");
        setMessage(
          `${generated.slots.length} créneau(x) placé(s) automatiquement. ${generated.unscheduledHours} créneau(x) restent à placer. ${generated.warnings.join(" ")}`.trim(),
        );
      } else if (generated.slots.length > 0) {
        setMessageKind("success");
        setMessage(
          `Emploi du temps généré : ${generated.slots.length} créneau(x) ont été classés automatiquement du ${dayLabel(firstDay).toLowerCase()} au ${dayLabel(lastDay).toLowerCase()}.`,
        );
      } else {
        setMessageKind("success");
        setMessage("Le paramétrage est enregistré et l’emploi du temps couvre déjà tous les volumes horaires configurés.");
      }
    } catch (error) {
      setMessageKind("error");
      setMessage(error instanceof Error ? error.message : "Génération automatique impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className={styles.shell}>
        <div className={styles.card}>Chargement du paramétrage automatique…</div>
      </section>
    );
  }
  if (workspace.school?.schoolType !== "primary") return null;

  return (
    <section className={styles.shell} aria-label="Paramétrage automatique de l’emploi du temps">
      <div className={styles.hero}>
        <div>
          <span className={styles.kicker}>EDT · PRIMAIRE</span>
          <h1>Paramétrage automatique</h1>
          <p>
            Le titulaire enseigne toutes les matières de sa classe par défaut. Vous choisissez la
            semaine de travail et les volumes horaires ; seules les matières confiées à un
            enseignant spécialisé sont déclarées comme exceptions.
          </p>
        </div>
        <div className={generation.ready ? styles.ready : styles.pending}>
          <strong>{generation.ready ? "Prêt à générer" : "À compléter"}</strong>
          <span>
            {generation.ready
              ? `${generation.plannedPeriods} créneau(x) prévu(s)`
              : `${generation.blockers.length} point(s) à corriger`}
          </span>
        </div>
      </div>

      {message ? (
        <div
          className={`${styles.message} ${styles[messageKind]}`}
          role={messageKind === "error" ? "alert" : "status"}
        >
          {message.split("\n").map((line, index) => (
            <div key={`${index}-${line}`}>{line}</div>
          ))}
        </div>
      ) : null}

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <span>1</span>
            <div>
              <h2>Jours et horaires de fonctionnement</h2>
              <p>Définissez la plage dans laquelle Gabon Éduc+ peut répartir automatiquement les cours.</p>
            </div>
          </div>
        </div>
        <div className={styles.scheduleFields}>
          <label>
            Du
            <select
              value={firstDay}
              onChange={(event) => {
                const value = Number(event.target.value) as DayNumber;
                setFirstDay(value);
                if (value > lastDay) setLastDay(value);
              }}
            >
              {DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
            </select>
          </label>
          <label>
            Au
            <select
              value={lastDay}
              onChange={(event) => {
                const value = Number(event.target.value) as DayNumber;
                setLastDay(value);
                if (value < firstDay) setFirstDay(value);
              }}
            >
              {DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
            </select>
          </label>
          <label>
            Début de journée
            <input type="time" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </label>
          <label>
            Fin de journée
            <input type="time" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </label>
        </div>
        <p className={styles.scheduleHint}>
          Plage actuelle : <b>{dayLabel(firstDay)} → {dayLabel(lastDay)}</b>, de <b>{startsAt}</b> à <b>{endsAt}</b>. Les matières seront distribuées uniquement dans cette plage.
        </p>
      </article>

      <div className={styles.grid}>
        <article className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <span>2</span>
              <div>
                <h2>Volumes hebdomadaires</h2>
                <p>Une seule saisie par matière, jamais créneau par créneau.</p>
              </div>
            </div>
          </div>
          <div className={styles.subjectList}>
            {subjects.map((subject) => (
              <label key={subject.id} className={styles.subjectRow}>
                <span>
                  <b>{subject.label}</b>
                  <small>{levelById.get(subject.levelId) || subject.category || "Primaire"}</small>
                </span>
                <span className={styles.hoursField}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={hours[subject.id] ?? 0}
                    onChange={(event) =>
                      setHours((values) => ({
                        ...values,
                        [subject.id]: Number(event.target.value),
                      }))
                    }
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
            <div>
              <span>3</span>
              <div>
                <h2>Titulaires des classes</h2>
                <p>Le titulaire est automatiquement affecté à toutes les matières de sa classe.</p>
              </div>
            </div>
          </div>
          <div className={styles.classList}>
            {classes.map((schoolClass) => (
              <label key={schoolClass.id} className={styles.classRow}>
                <span>
                  <b>{schoolClass.name}</b>
                  <small>{schoolClass.level}</small>
                </span>
                <select
                  value={titulars[schoolClass.id] || ""}
                  onChange={(event) =>
                    setTitulars((values) => ({
                      ...values,
                      [schoolClass.id]: event.target.value,
                    }))
                  }
                >
                  <option value="">Choisir le titulaire</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.firstName} {teacher.lastName}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </article>
      </div>

      <article className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <span>4</span>
            <div>
              <h2>Exceptions par matière</h2>
              <p>
                Ajoutez uniquement les cours assurés par un autre enseignant : sport,
                informatique, langue, etc.
              </p>
            </div>
          </div>
          <button type="button" className={styles.secondaryButton} onClick={addException}>
            + Ajouter une exception
          </button>
        </div>
        {!exceptions.length ? (
          <div className={styles.empty}>
            Aucune exception : chaque titulaire garde toutes les matières de sa classe.
          </div>
        ) : (
          <div className={styles.exceptionList}>
            {exceptions.map((exception) => {
              const selectedClass = classes.find((item) => item.id === exception.classId);
              const availableSubjects = selectedClass
                ? subjectsForPrimaryClass(workspace, selectedClass)
                : subjects;
              return (
                <div className={styles.exceptionRow} key={exception.id}>
                  <select
                    value={exception.classId}
                    onChange={(event) =>
                      updateException(exception.id, {
                        classId: event.target.value,
                        subjectId: "",
                      })
                    }
                  >
                    <option value="">Classe</option>
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <select
                    value={exception.subjectId}
                    onChange={(event) =>
                      updateException(exception.id, { subjectId: event.target.value })
                    }
                  >
                    <option value="">Matière</option>
                    {availableSubjects.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                  <select
                    value={exception.teacherId}
                    onChange={(event) =>
                      updateException(exception.id, { teacherId: event.target.value })
                    }
                  >
                    <option value="">Enseignant spécialisé</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.firstName} {teacher.lastName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeException(exception.id)}
                  >
                    Retirer
                  </button>
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
            {dayLabel(firstDay)}–{dayLabel(lastDay)} · {startsAt}–{endsAt}
            {exceptions.length ? ` · ${exceptions.length} exception(s)` : " · aucune exception"}
          </small>
        </div>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => void saveAndGenerate()}
          disabled={saving}
        >
          {saving ? "Génération en cours…" : "Enregistrer et générer l’EDT"}
        </button>
      </div>

      {generation.blockers.length ? (
        <details className={styles.diagnostics}>
          <summary>Voir ce qui manque encore pour une génération complète</summary>
          <ul>
            {generation.blockers.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      ) : null}

      <p className={styles.manualNote}>
        <b>Important :</b> le formulaire « Ajouter un créneau » affiché plus bas sert uniquement aux retouches manuelles après génération. Il n’est pas nécessaire de choisir une matière ou un jour dans ce formulaire pour générer automatiquement l’emploi du temps.
      </p>

      {exceptions.some((item) => item.teacherId && item.teacherId === titulars[item.classId]) ? (
        <p className={styles.note}>
          Une exception désigne actuellement le même enseignant que le titulaire ; elle est
          autorisée mais inutile.
        </p>
      ) : null}
      {teachers.length === 0 ? (
        <p className={styles.note}>Créez d’abord au moins un profil enseignant pédagogique.</p>
      ) : null}
      {classes.some((item) => !titulars[item.id]) ? (
        <p className={styles.note}>Chaque classe doit avoir un titulaire avant la génération.</p>
      ) : null}
      {subjects.some((item) => Number(hours[item.id] || 0) <= 0) ? (
        <p className={styles.note}>
          Les matières à 0 h/semaine ne peuvent pas être placées automatiquement : définissez leur
          volume réel avant de générer.
        </p>
      ) : null}
    </section>
  );
}
