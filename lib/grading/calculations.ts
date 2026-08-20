import type {
  AssessmentScore,
  ClassSubject,
  GeneralComment,
  GradeAssessment,
  GradingWorkspace,
  ReportSnapshot,
  ReportSubjectRow,
  SchoolSettings,
  SubjectComment,
} from "./types";
import { getDefaultSubjectsForLevel, isPreschoolLevel } from "@/lib/school-profiles";
import type { MasteryLevel } from "./types";

export function roundTo(value: number, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** Math.max(0, Math.min(6, decimals));
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
export function normalizedScore(
  value: number,
  maxScore: number,
  targetMax = 20,
  decimals = 2,
) {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(maxScore) ||
    maxScore <= 0 ||
    !Number.isFinite(targetMax) ||
    targetMax <= 0
  )
    return null;
  return roundTo((value / maxScore) * targetMax, decimals);
}
export function validScore(score: AssessmentScore) {
  return (
    score.status === "graded" &&
    score.value !== null &&
    Number.isFinite(score.value)
  );
}
export function assessmentAverage(
  scores: AssessmentScore[],
  assessmentId: string,
  maxScore: number,
  targetMax = 20,
  decimals = 2,
) {
  const values = scores
    .filter((score) => score.assessmentId === assessmentId && validScore(score))
    .map((score) =>
      normalizedScore(score.value as number, maxScore, targetMax, decimals),
    )
    .filter((value): value is number => value !== null);
  return values.length
    ? roundTo(
        values.reduce((sum, value) => sum + value, 0) / values.length,
        decimals,
      )
    : null;
}
export function studentSubjectAverage(
  studentId: string,
  subject: string,
  assessments: GradeAssessment[],
  scores: AssessmentScore[],
  targetMax = 20,
  decimals = 2,
) {
  const included = assessments.filter(
    (item) =>
      item.subject === subject &&
      item.active &&
      Number.isFinite(item.coefficient) &&
      item.coefficient > 0,
  );
  let weighted = 0,
    totalWeight = 0,
    count = 0;
  for (const assessment of included) {
    const score = scores.find(
      (item) =>
        item.assessmentId === assessment.id && item.studentId === studentId,
    );
    if (!score || !validScore(score)) continue;
    const normalized = normalizedScore(
      score.value as number,
      assessment.maxScore,
      targetMax,
      decimals,
    );
    if (normalized === null) continue;
    weighted += normalized * assessment.coefficient;
    totalWeight += assessment.coefficient;
    count += 1;
  }
  return {
    average: totalWeight ? roundTo(weighted / totalWeight, decimals) : null,
    count,
  };
}
export function weightedGeneralAverage(
  subjects: Array<{ average: number | null; coefficient: number }>,
  decimals = 2,
) {
  const included = subjects.filter(
    (item) =>
      item.average !== null &&
      Number.isFinite(item.coefficient) &&
      item.coefficient > 0,
  );
  const total = included.reduce((sum, item) => sum + item.coefficient, 0);
  return total
    ? roundTo(
        included.reduce(
          (sum, item) => sum + (item.average as number) * item.coefficient,
          0,
        ) / total,
        decimals,
      )
    : null;
}
export function rankValues(
  values: Array<{ id: string; average: number | null }>,
  decimals = 2,
) {
  const comparable = values
    .filter((item) => item.average !== null)
    .map((item) => ({
      ...item,
      average: roundTo(item.average as number, decimals),
    }))
    .sort((a, b) => b.average - a.average);
  const ranks = new Map<string, number>();
  let previous: number | null = null;
  let rank = 0;
  comparable.forEach((item, index) => {
    if (previous === null || item.average !== previous) rank = index + 1;
    ranks.set(item.id, rank);
    previous = item.average;
  });
  return ranks;
}
export function classStatistics(values: Array<number | null>, decimals = 2) {
  const valid = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (!valid.length) return { average: null, best: null, lowest: null };
  return {
    average: roundTo(
      valid.reduce((sum, value) => sum + value, 0) / valid.length,
      decimals,
    ),
    best: roundTo(Math.max(...valid), decimals),
    lowest: roundTo(Math.min(...valid), decimals),
  };
}

type Student = { id: string; firstName: string; lastName: string };

export function findReportStudent(
  students: Student[],
  studentId: string,
): Student | null {
  return students.find((student) => student.id === studentId) ?? null;
}

export function buildReportCardSnapshot(args: {
  workspace: GradingWorkspace;
  settings: SchoolSettings;
  classId: string;
  className: string;
  classLevel?: string;
  periodId: string;
  periodLabel: string;
  student: Student;
  students: Student[];
}): ReportSnapshot {
  const {
    workspace,
    settings,
    classId,
    className,
    classLevel,
    periodId,
    periodLabel,
    student,
    students,
  } = args;
  const decimals = settings.decimals;
  const configuredSubjects = workspace.classSubjects.filter(
    (item) =>
      item.classId === classId &&
      (!item.periodId || item.periodId === periodId) &&
      item.active &&
      item.coefficient > 0,
  );
  const assessments = workspace.assessments.filter(
    (item) =>
      item.classId === classId && item.periodId === periodId && item.active,
  );
  const fallbackSubjectNames = classLevel
    ? getDefaultSubjectsForLevel(classLevel)
    : Array.from(new Set(assessments.map((item) => item.subject).filter(Boolean)));
  const subjects: ClassSubject[] = configuredSubjects.length
    ? configuredSubjects
    : fallbackSubjectNames.map((subject, index) => ({
        id: `default-${classId}-${index}`,
        classId,
        periodId,
        subject,
        coefficient: assessments.find((item) => item.subject === subject)?.coefficient || 1,
        teacherName: "",
        principal: false,
        active: true,
      }));
  const preschool = isPreschoolLevel(classLevel);
  const perStudent = students.map((candidate) => {
    const rows = subjects.map((subject) => ({
      average: studentSubjectAverage(
        candidate.id,
        subject.subject,
        assessments,
        workspace.scores,
        settings.maxScore,
        decimals,
      ).average,
      coefficient: subject.coefficient,
    }));
    return {
      id: candidate.id,
      average: weightedGeneralAverage(rows, decimals),
    };
  });
  const generalRanks = rankValues(perStudent, decimals);
  const stats = classStatistics(
    perStudent.map((item) => item.average),
    decimals,
  );
  const rows: ReportSubjectRow[] = subjects.map((subject) => {
    const own = studentSubjectAverage(
      student.id,
      subject.subject,
      assessments,
      workspace.scores,
      settings.maxScore,
      decimals,
    );
    const subjectValues = students.map((candidate) => ({
      id: candidate.id,
      ...studentSubjectAverage(
        candidate.id,
        subject.subject,
        assessments,
        workspace.scores,
        settings.maxScore,
        decimals,
      ),
    }));
    const subjectStats = classStatistics(
      subjectValues.map((item) => item.average),
      decimals,
    );
    const ranks = rankValues(
      subjectValues.map((item) => ({ id: item.id, average: item.average })),
      decimals,
    );
    const comment =
      workspace.subjectComments.find(
        (item) =>
          item.studentId === student.id &&
          item.periodId === periodId &&
          item.subject === subject.subject,
      )?.comment || "";
    const masteryScores = assessments
      .filter((assessment) => assessment.subject === subject.subject)
      .sort((a, b) => `${b.date}${b.id}`.localeCompare(`${a.date}${a.id}`))
      .map((assessment) => workspace.scores.find((score) => score.assessmentId === assessment.id && score.studentId === student.id)?.mastery)
      .filter((value): value is MasteryLevel => Boolean(value));
    return {
      subject: subject.subject,
      average: own.average,
      coefficient: subject.coefficient,
      weighted:
        own.average === null
          ? null
          : roundTo(own.average * subject.coefficient, decimals),
      classAverage: subjectStats.average,
      rank: ranks.get(student.id) || null,
      assessmentCount: preschool
        ? masteryScores.filter((value) => value !== "not_evaluated").length
        : own.count,
      comment,
      mastery: preschool ? (masteryScores[0] || "not_evaluated") : undefined,
    };
  });
  const general =
    workspace.generalComments.find(
      (item) => item.studentId === student.id && item.periodId === periodId,
    ) ||
    ({
      studentId: student.id,
      periodId,
      general: "",
      work: "",
      conduct: "",
      decision: "",
      mention: "",
    } as GeneralComment);
  const attendance = workspace.attendance.find(
    (item) => item.studentId === student.id && item.periodId === periodId,
  ) || { studentId: student.id, periodId, absences: 0, lateCount: 0 };
  const average =
    perStudent.find((item) => item.id === student.id)?.average ?? null;
  return {
    id: crypto.randomUUID(),
    studentId: student.id,
    studentName: `${student.lastName.toLocaleUpperCase("fr")} ${student.firstName}`,
    classId,
    className,
    classLevel,
    periodId,
    periodLabel,
    academicYear: settings.academicYear,
    createdAt: new Date().toISOString(),
    status: "calculated",
    settings: { ...settings },
    subjects: rows,
    generalAverage: preschool ? null : average,
    generalRank: preschool ? null : generalRanks.get(student.id) || null,
    classAverage: preschool ? null : stats.average,
    bestAverage: preschool ? null : stats.best,
    lowestAverage: preschool ? null : stats.lowest,
    totalCoefficients: subjects.reduce(
      (sum, item) => sum + item.coefficient,
      0,
    ),
    attendance: { ...attendance },
    comments: { ...general },
    classSize: students.length,
  };
}

export function snapshotIsStable(
  snapshot: ReportSnapshot,
  workspace: GradingWorkspace,
) {
  const archived = workspace.reports.find((item) => item.id === snapshot.id);
  return archived?.status === "locked"
    ? JSON.stringify(archived.snapshot) === JSON.stringify(snapshot)
    : true;
}
