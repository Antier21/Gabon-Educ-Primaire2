import type { ClassRecord } from "@/lib/class-store";
import type { PlatformWorkspace, TimetableSlot } from "@/lib/platform/types";

const PERIODS = [
  ["07:30", "08:25"],
  ["08:25", "09:20"],
  ["09:30", "10:25"],
  ["10:25", "11:20"],
  ["11:30", "12:25"],
  ["12:25", "13:15"],
  ["13:15", "14:10"],
  ["14:25", "15:20"],
  ["15:20", "16:10"],
  ["16:10", "16:55"],
  ["16:55", "17:40"],
] as const;

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5, 6] as const;

export type TimetableGenerationOptions = {
  weekdays?: readonly number[];
  startsAt?: string;
  endsAt?: string;
};

export type TimetableGenerationCheck = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  classCount: number;
  assignmentCount: number;
  plannedPeriods: number;
};

export type TimetableGenerationResult = {
  slots: TimetableSlot[];
  unscheduledHours: number;
  warnings: string[];
};

type GenerationAvailability = {
  weekdays: number[];
  periods: Array<readonly [string, string]>;
  startsAt: string;
  endsAt: string;
};

function overlaps(a: TimetableSlot, weekday: number, start: string, end: string) {
  return a.weekday === weekday && a.startsAt < end && start < a.endsAt;
}

function sameSchool(id: string | undefined, schoolId: string) {
  return !id || id === schoolId;
}

function activeYearId(workspace: PlatformWorkspace) {
  return workspace.academicYears.find((item) => item.active)?.id || workspace.school?.activeAcademicYearId || workspace.academicYears[0]?.id || "";
}

function generationAvailability(options: TimetableGenerationOptions = {}): GenerationAvailability {
  const requestedWeekdays = options.weekdays?.length ? options.weekdays : DEFAULT_WEEKDAYS;
  const weekdays = Array.from(
    new Set(requestedWeekdays.filter((weekday) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 6)),
  ).sort((a, b) => a - b);
  const startsAt = options.startsAt || PERIODS[0][0];
  const endsAt = options.endsAt || PERIODS[PERIODS.length - 1][1];
  const periods = PERIODS.filter(
    ([start, end]) => start >= startsAt && end <= endsAt,
  );
  return { weekdays, periods, startsAt, endsAt };
}

function effectiveAssignments(
  workspace: PlatformWorkspace,
  schoolId: string,
  classIds: Set<string>,
  yearId: string,
) {
  const primary = workspace.school?.schoolType === "primary";
  const grouped = new Map<string, (typeof workspace.assignments)[number][]>();
  for (const item of workspace.assignments.filter(
    (assignment) =>
      assignment.active &&
      sameSchool(assignment.schoolId, schoolId) &&
      classIds.has(assignment.classId) &&
      (!yearId || !assignment.academicYearId || assignment.academicYearId === yearId),
  )) {
    const key = `${item.classId}|${item.subjectId}`;
    const items = grouped.get(key) || [];
    items.push(item);
    grouped.set(key, items);
  }
  const selected: (typeof workspace.assignments)[number][] = [];
  for (const items of grouped.values()) {
    // Au primaire, une exception spécialisée remplace le titulaire uniquement
    // pour la matière concernée. L'année active a déjà été filtrée ci-dessus.
    selected.push(primary ? (items.find((item) => !item.headTeacher) || items[0]) : items[0]);
  }
  return selected;
}

export function inspectTimetableGeneration(
  workspace: PlatformWorkspace,
  classes: ClassRecord[],
  options: TimetableGenerationOptions = {},
): TimetableGenerationCheck {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const schoolId = workspace.school?.id || "";
  const yearId = activeYearId(workspace);
  const availability = generationAvailability(options);

  if (!schoolId || schoolId === "local") blockers.push("Établissement actif non résolu dans Supabase.");
  if (!yearId || yearId === "local") blockers.push("Aucune année scolaire active n’est disponible.");
  if (!availability.weekdays.length) blockers.push("Sélectionnez au moins un jour d’enseignement.");
  if (availability.endsAt <= availability.startsAt) blockers.push("L’heure de fin de journée doit être postérieure à l’heure de début.");
  if (availability.endsAt > availability.startsAt && !availability.periods.length) {
    blockers.push("La plage horaire choisie ne contient aucun créneau utilisable.");
  }

  const schoolClasses = classes.filter((item) => sameSchool(item.schoolId, schoolId));
  if (!schoolClasses.length) blockers.push("Aucune classe de l’établissement n’est disponible.");

  const schoolSubjects = workspace.subjects.filter((item) => item.active && sameSchool(item.schoolId, schoolId));
  if (!schoolSubjects.length) blockers.push("Aucune matière active n’est configurée.");

  const schoolClassIds = new Set(schoolClasses.map((item) => item.id));
  const subjectIds = new Set(schoolSubjects.map((item) => item.id));
  const teacherIds = new Set(
    workspace.users
      .filter((item) => sameSchool(item.schoolId, schoolId) && ["teacher", "head_teacher"].includes(item.role) && item.status === "active")
      .map((item) => item.id),
  );

  const activeAssignments = effectiveAssignments(workspace, schoolId, schoolClassIds, yearId);
  if (!activeAssignments.length) blockers.push("Aucune affectation matière–classe–enseignant n’est enregistrée.");

  let plannedPeriods = 0;
  const plannedByClass = new Map<string, number>();
  const seen = new Set<string>();
  for (const assignment of activeAssignments) {
    const key = `${assignment.classId}|${assignment.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const schoolClass = schoolClasses.find((item) => item.id === assignment.classId);
    const subject = schoolSubjects.find((item) => item.id === assignment.subjectId);
    if (!schoolClass) {
      blockers.push("Une affectation référence une classe absente de l’établissement.");
      continue;
    }
    if (!subject || !subjectIds.has(assignment.subjectId)) {
      blockers.push(`${schoolClass.name} : une affectation référence une matière absente ou inactive.`);
      continue;
    }
    const weekly = Number(subject.weeklyHours) || 0;
    if (weekly <= 0) {
      blockers.push(`${schoolClass.name} · ${subject.label} : volume hebdomadaire non défini.`);
    } else {
      const periods = Math.max(0, Math.round(weekly));
      plannedPeriods += periods;
      plannedByClass.set(
        assignment.classId,
        (plannedByClass.get(assignment.classId) || 0) + periods,
      );
      if (!Number.isInteger(weekly)) warnings.push(`${subject.label} : ${weekly} h/semaine sera converti en ${Math.round(weekly)} créneau(x).`);
    }
    if (!assignment.teacherId) {
      blockers.push(`${schoolClass.name} · ${subject.label} : aucun enseignant affecté.`);
    } else if (!teacherIds.has(assignment.teacherId)) {
      blockers.push(`${schoolClass.name} · ${subject.label} : l’enseignant affecté n’est pas actif dans cet établissement.`);
    }
  }

  const weeklyCapacity = availability.weekdays.length * availability.periods.length;
  if (weeklyCapacity > 0) {
    for (const schoolClass of schoolClasses) {
      const planned = plannedByClass.get(schoolClass.id) || 0;
      if (planned > weeklyCapacity) {
        blockers.push(
          `${schoolClass.name} : ${planned} créneau(x) sont prévus mais la plage choisie n’en offre que ${weeklyCapacity}.`,
        );
      }
    }
  }

  return {
    ready: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    classCount: schoolClasses.length,
    assignmentCount: seen.size,
    plannedPeriods,
  };
}

export function generateMissingTimetable(
  workspace: PlatformWorkspace,
  classes: ClassRecord[],
  options: TimetableGenerationOptions = {},
): TimetableGenerationResult {
  const check = inspectTimetableGeneration(workspace, classes, options);
  if (!check.ready) return { slots: [], unscheduledHours: 0, warnings: check.blockers };

  const schoolId = workspace.school!.id;
  const yearId = activeYearId(workspace);
  const availability = generationAvailability(options);
  const generated: TimetableSlot[] = [];
  const warnings = [...check.warnings];
  let unscheduledHours = 0;
  const schoolClasses = classes.filter((item) => sameSchool(item.schoolId, schoolId));
  const classIds = new Set(schoolClasses.map((item) => item.id));
  const existing = workspace.timetable.filter(
    (slot) => sameSchool(slot.schoolId, schoolId) && (!yearId || slot.academicYearId === yearId),
  );
  const all = () => [...existing, ...generated];

  const uniqueAssignments = effectiveAssignments(workspace, schoolId, classIds, yearId);

  for (const assignment of uniqueAssignments) {
    const subject = workspace.subjects.find(
      (item) => item.id === assignment.subjectId && item.active && sameSchool(item.schoolId, schoolId),
    );
    if (!subject) continue;
    const target = Math.max(0, Math.round(Number(subject.weeklyHours) || 0));
    if (!target) continue;

    const already = existing.filter(
      (slot) => slot.classId === assignment.classId && slot.subjectId === assignment.subjectId,
    ).length;
    let remaining = Math.max(0, target - already);
    if (!remaining) continue;

    const schoolClass = schoolClasses.find((item) => item.id === assignment.classId);

    while (remaining > 0) {
      const candidates: Array<{ weekday: number; startsAt: string; endsAt: string; score: number }> = [];
      for (const weekday of availability.weekdays) {
        for (let periodIndex = 0; periodIndex < availability.periods.length; periodIndex += 1) {
          const [startsAt, endsAt] = availability.periods[periodIndex];
          const occupied = all().some((slot) => {
            if (!overlaps(slot, weekday, startsAt, endsAt)) return false;
            if (slot.classId === assignment.classId) return true;
            if (assignment.teacherId && slot.teacherId === assignment.teacherId) return true;
            if (schoolClass?.room && slot.room && slot.room === schoolClass.room) return true;
            return false;
          });
          if (occupied) continue;

          const classDayLoad = all().filter((slot) => slot.classId === assignment.classId && slot.weekday === weekday).length;
          const teacherDayLoad = all().filter((slot) => slot.teacherId === assignment.teacherId && slot.weekday === weekday).length;
          const sameSubjectDay = all().filter(
            (slot) => slot.classId === assignment.classId && slot.subjectId === assignment.subjectId && slot.weekday === weekday,
          ).length;
          // Répartit une matière sur plusieurs jours avant d'en doubler une sur
          // la même journée, puis équilibre la charge de la classe et du titulaire.
          const score = sameSubjectDay * 100 + classDayLoad * 10 + teacherDayLoad * 3 + periodIndex * 0.05;
          candidates.push({ weekday, startsAt, endsAt, score });
        }
      }

      candidates.sort((a, b) => a.score - b.score || a.weekday - b.weekday || a.startsAt.localeCompare(b.startsAt));
      const best = candidates[0];
      if (!best) break;

      const created = new Date().toISOString();
      generated.push({
        id: crypto.randomUUID(),
        schoolId,
        academicYearId: assignment.academicYearId || yearId,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
        room: schoolClass?.room || "",
        weekday: best.weekday,
        startsAt: best.startsAt,
        endsAt: best.endsAt,
        weekLabel: "Toutes les semaines",
        createdAt: created,
        updatedAt: created,
      });
      remaining -= 1;
    }

    if (remaining > 0) {
      unscheduledHours += remaining;
      warnings.push(`${subject.label} : ${remaining} créneau(x) non placé(s) pour ${schoolClass?.name || "une classe"}.`);
    }
  }

  return { slots: generated, unscheduledHours, warnings: Array.from(new Set(warnings)) };
}
