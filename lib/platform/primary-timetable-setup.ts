import type { ClassRecord } from "@/lib/class-store";
import type { PlatformWorkspace, TeachingAssignment } from "@/lib/platform/types";
import type { SyncOperationMetadata } from "@/lib/sync/types";
import {
  getDefaultSubjectsForLevel,
  getDefaultSubjectsForSchoolType,
  normalizeSchoolLevel,
} from "@/lib/school-profiles";

export type PrimaryTimetableExceptionInput = {
  classId: string;
  subjectId: string;
  teacherId: string;
};

export type PrimaryTimetableSetupInput = {
  titularByClassId: Record<string, string>;
  weeklyHoursBySubjectId: Record<string, number>;
  exceptions: PrimaryTimetableExceptionInput[];
};

export type PrimaryTimetableSetupResult = {
  ready: boolean;
  errors: string[];
  workspace: PlatformWorkspace;
  metadata: SyncOperationMetadata[];
  summary: {
    classes: number;
    subjects: number;
    titularAssignments: number;
    exceptions: number;
    updatedVolumes: number;
  };
};

type BuildOptions = {
  now?: string;
  makeId?: () => string;
};

function sameSchool(id: string | undefined, schoolId: string) {
  return !id || id === schoolId;
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]/g, "");
}

function activeYear(workspace: PlatformWorkspace) {
  return (
    workspace.academicYears.find((item) => item.active) ||
    workspace.academicYears.find((item) => item.id === workspace.school?.activeAcademicYearId) ||
    workspace.academicYears[0]
  );
}

/**
 * Matières réellement enseignées dans une classe primaire.
 *
 * Le catalogue de l'édition Primaire contient à la fois les domaines de
 * maternelle et les matières élémentaires. On s'appuie donc d'abord sur le
 * profil officiel du niveau de la classe. Une matière personnalisée reste
 * possible : elle est conservée si son levelId vise explicitement ce niveau,
 * ou globalement lorsque le niveau n'a pas pu être résolu.
 */
export function subjectsForPrimaryClass(
  workspace: PlatformWorkspace,
  schoolClass: ClassRecord,
) {
  const schoolId = workspace.school?.id || "";
  const activeSubjects = workspace.subjects.filter(
    (subject) => subject.active && sameSchool(subject.schoolId, schoolId),
  );
  const expectedLabels = new Set(
    getDefaultSubjectsForLevel(schoolClass.level).map(normalizeLabel),
  );
  const knownPrimaryLabels = new Set(
    getDefaultSubjectsForSchoolType("primary").map(normalizeLabel),
  );
  const normalizedClassLevel = normalizeSchoolLevel(schoolClass.level);
  const level = workspace.levels.find(
    (item) =>
      item.active &&
      (normalizeSchoolLevel(item.code) === normalizedClassLevel ||
        normalizeSchoolLevel(item.label) === normalizedClassLevel),
  );

  const selected = activeSubjects.filter((subject) => {
    const label = normalizeLabel(subject.label);
    if (expectedLabels.has(label)) return true;
    if (knownPrimaryLabels.has(label)) return false;
    return level ? subject.levelId === level.id : true;
  });

  // Compatibilité avec les anciens catalogues entièrement personnalisés : ne
  // jamais rendre une classe vide si aucun libellé standard n'est reconnu.
  return selected.length ? selected : activeSubjects;
}

function makeAssignment(
  workspace: PlatformWorkspace,
  classId: string,
  subjectId: string,
  teacherId: string,
  headTeacher: boolean,
  createdAt: string,
  makeId: () => string,
): TeachingAssignment {
  const year = activeYear(workspace);
  return {
    id: makeId(),
    schoolId: workspace.school?.id || "",
    academicYearId: year?.id || "",
    classId,
    subjectId,
    teacherId,
    startsOn: year?.startsOn || "",
    endsOn: year?.endsOn || "",
    temporary: false,
    headTeacher,
    active: true,
    createdAt,
    updatedAt: createdAt,
  };
}

export function buildPrimaryTimetableSetup(
  workspace: PlatformWorkspace,
  classes: ClassRecord[],
  input: PrimaryTimetableSetupInput,
  options: BuildOptions = {},
): PrimaryTimetableSetupResult {
  const errors: string[] = [];
  const schoolId = workspace.school?.id || "";
  const year = activeYear(workspace);
  const createdAt = options.now || new Date().toISOString();
  const makeId = options.makeId || (() => crypto.randomUUID());

  if (!schoolId || schoolId === "local") errors.push("Établissement actif non résolu.");
  if (workspace.school?.schoolType !== "primary") {
    errors.push("Ce paramétrage automatique est réservé à l’édition Primaire.");
  }
  if (!year?.id || year.id === "local") errors.push("Aucune année scolaire active n’est disponible.");

  const schoolClasses = classes.filter((item) => sameSchool(item.schoolId, schoolId));
  if (!schoolClasses.length) errors.push("Aucune classe n’est disponible.");

  const activeSubjects = workspace.subjects.filter(
    (subject) => subject.active && sameSchool(subject.schoolId, schoolId),
  );
  if (!activeSubjects.length) errors.push("Aucune matière active n’est configurée.");

  const managedSubjectMap = new Map<string, (typeof workspace.subjects)[number]>();
  for (const schoolClass of schoolClasses) {
    for (const subject of subjectsForPrimaryClass(workspace, schoolClass)) {
      managedSubjectMap.set(subject.id, subject);
    }
  }
  const managedSubjects = [...managedSubjectMap.values()];
  if (schoolClasses.length && activeSubjects.length && !managedSubjects.length) {
    errors.push("Aucune matière ne correspond aux niveaux des classes de l’établissement.");
  }

  const activeTeachers = new Set(
    workspace.users
      .filter(
        (user) =>
          sameSchool(user.schoolId, schoolId) &&
          user.status === "active" &&
          ["teacher", "head_teacher"].includes(user.role),
      )
      .map((user) => user.id),
  );
  if (!activeTeachers.size) errors.push("Aucun enseignant actif n’est disponible.");

  for (const schoolClass of schoolClasses) {
    const teacherId = input.titularByClassId[schoolClass.id] || "";
    if (!teacherId) errors.push(`${schoolClass.name} : titulaire non défini.`);
    else if (!activeTeachers.has(teacherId)) {
      errors.push(`${schoolClass.name} : le titulaire sélectionné n’est pas un enseignant actif.`);
    }
  }

  for (const subject of managedSubjects) {
    const hours = Number(input.weeklyHoursBySubjectId[subject.id] ?? subject.weeklyHours ?? 0);
    if (!Number.isFinite(hours) || hours <= 0) {
      errors.push(`${subject.label} : indiquez un volume hebdomadaire supérieur à 0.`);
    }
  }

  const desiredExceptionByPair = new Map<string, string>();
  for (const exception of input.exceptions) {
    if (!exception.classId || !exception.subjectId || !exception.teacherId) continue;
    const schoolClass = schoolClasses.find((item) => item.id === exception.classId);
    const subject = activeSubjects.find((item) => item.id === exception.subjectId);
    if (!schoolClass) {
      errors.push("Une exception référence une classe inconnue.");
      continue;
    }
    if (!subject) {
      errors.push(`${schoolClass.name} : une exception référence une matière inconnue.`);
      continue;
    }
    if (!activeTeachers.has(exception.teacherId)) {
      errors.push(`${schoolClass.name} · ${subject.label} : enseignant spécialisé inactif ou inconnu.`);
      continue;
    }
    if (!subjectsForPrimaryClass(workspace, schoolClass).some((item) => item.id === subject.id)) {
      errors.push(`${schoolClass.name} · ${subject.label} : cette matière ne correspond pas au niveau de la classe.`);
      continue;
    }
    desiredExceptionByPair.set(`${exception.classId}|${exception.subjectId}`, exception.teacherId);
  }

  if (errors.length) {
    return {
      ready: false,
      errors: Array.from(new Set(errors)),
      workspace,
      metadata: [],
      summary: {
        classes: schoolClasses.length,
        subjects: managedSubjects.length,
        titularAssignments: 0,
        exceptions: desiredExceptionByPair.size,
        updatedVolumes: 0,
      },
    };
  }

  const metadata: SyncOperationMetadata[] = [];
  let updatedVolumes = 0;
  const subjects = workspace.subjects.map((subject) => {
    if (!activeSubjects.some((item) => item.id === subject.id)) return subject;
    if (!(subject.id in input.weeklyHoursBySubjectId)) return subject;
    const weeklyHours = Number(input.weeklyHoursBySubjectId[subject.id]);
    if (!Number.isFinite(weeklyHours) || Number(subject.weeklyHours) === weeklyHours) return subject;
    const updated = { ...subject, weeklyHours, updatedAt: createdAt };
    metadata.push({
      module: "subjects",
      operation: "update",
      entityId: updated.id,
      payload: { subject: updated },
      baseUpdatedAt: subject.updatedAt,
    });
    updatedVolumes += 1;
    return updated;
  });

  /*
   * Le paramétrage automatique ne possède que les couples classe/matière qui
   * correspondent réellement au programme de la classe. Une affectation hors
   * de ce périmètre (ancienne donnée, module futur, autre niveau) doit rester
   * intacte plutôt que disparaître silencieusement du workspace.
   */
  const managedPairs = new Set<string>();
  const workspaceWithUpdatedSubjects = { ...workspace, subjects };
  for (const schoolClass of schoolClasses) {
    for (const subject of subjectsForPrimaryClass(workspaceWithUpdatedSubjects, schoolClass)) {
      managedPairs.add(`${schoolClass.id}|${subject.id}`);
    }
  }

  const isCurrentManagedAssignment = (assignment: TeachingAssignment) =>
    assignment.active &&
    sameSchool(assignment.schoolId, schoolId) &&
    assignment.academicYearId === year!.id &&
    managedPairs.has(`${assignment.classId}|${assignment.subjectId}`);

  const untouched = workspace.assignments.filter((assignment) => !isCurrentManagedAssignment(assignment));
  const current = workspace.assignments.filter(isCurrentManagedAssignment);
  const nextCurrent: TeachingAssignment[] = [];
  let titularAssignments = 0;

  for (const schoolClass of schoolClasses) {
    const titularId = input.titularByClassId[schoolClass.id];
    for (const subject of subjectsForPrimaryClass(workspaceWithUpdatedSubjects, schoolClass)) {
      const pair = `${schoolClass.id}|${subject.id}`;
      const existingTitulars = current.filter(
        (assignment) =>
          assignment.classId === schoolClass.id &&
          assignment.subjectId === subject.id &&
          assignment.headTeacher,
      );
      const reusable = existingTitulars.find((assignment) => assignment.teacherId === titularId);
      if (reusable) {
        nextCurrent.push(reusable);
        for (const duplicate of existingTitulars.filter((item) => item.id !== reusable.id)) {
          metadata.push({
            module: "assignments",
            operation: "delete",
            entityId: duplicate.id,
            payload: { assignment: duplicate },
            baseUpdatedAt: duplicate.updatedAt,
          });
        }
      } else {
        for (const previous of existingTitulars) {
          metadata.push({
            module: "assignments",
            operation: "delete",
            entityId: previous.id,
            payload: { assignment: previous },
            baseUpdatedAt: previous.updatedAt,
          });
        }
        const assignment = makeAssignment(
          workspace,
          schoolClass.id,
          subject.id,
          titularId,
          true,
          createdAt,
          makeId,
        );
        nextCurrent.push(assignment);
        metadata.push({
          module: "assignments",
          operation: "create",
          entityId: assignment.id,
          payload: { assignment },
        });
      }
      titularAssignments += 1;

      const desiredExceptionTeacher = desiredExceptionByPair.get(pair) || "";
      const existingExceptions = current.filter(
        (assignment) =>
          assignment.classId === schoolClass.id &&
          assignment.subjectId === subject.id &&
          !assignment.headTeacher,
      );
      if (desiredExceptionTeacher) {
        const reusableException = existingExceptions.find(
          (assignment) => assignment.teacherId === desiredExceptionTeacher,
        );
        if (reusableException) {
          nextCurrent.push(reusableException);
          for (const duplicate of existingExceptions.filter((item) => item.id !== reusableException.id)) {
            metadata.push({
              module: "assignments",
              operation: "delete",
              entityId: duplicate.id,
              payload: { assignment: duplicate },
              baseUpdatedAt: duplicate.updatedAt,
            });
          }
        } else {
          for (const previous of existingExceptions) {
            metadata.push({
              module: "assignments",
              operation: "delete",
              entityId: previous.id,
              payload: { assignment: previous },
              baseUpdatedAt: previous.updatedAt,
            });
          }
          const exceptionAssignment = makeAssignment(
            workspace,
            schoolClass.id,
            subject.id,
            desiredExceptionTeacher,
            false,
            createdAt,
            makeId,
          );
          nextCurrent.push(exceptionAssignment);
          metadata.push({
            module: "assignments",
            operation: "create",
            entityId: exceptionAssignment.id,
            payload: { assignment: exceptionAssignment },
          });
        }
      } else {
        for (const previous of existingExceptions) {
          metadata.push({
            module: "assignments",
            operation: "delete",
            entityId: previous.id,
            payload: { assignment: previous },
            baseUpdatedAt: previous.updatedAt,
          });
        }
      }
    }
  }

  return {
    ready: true,
    errors: [],
    workspace: {
      ...workspace,
      subjects,
      assignments: [...nextCurrent, ...untouched],
      updatedAt: createdAt,
    },
    metadata,
    summary: {
      classes: schoolClasses.length,
      subjects: managedSubjects.length,
      titularAssignments,
      exceptions: desiredExceptionByPair.size,
      updatedVolumes,
    },
  };
}
