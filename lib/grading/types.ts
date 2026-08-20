export type GradingRole =
  | "teacher"
  | "head_teacher"
  | "school_admin"
  | "headmaster";
export type PeriodKind = "trimester" | "semester";
export type ScoreStatus = "graded" | "absent" | "exempt" | "not_graded";
export type EvaluationMode = "numeric" | "mastery";
export type MasteryLevel = "acquired" | "developing" | "not_acquired" | "not_evaluated";
export const MASTERY_LEVEL_OPTIONS: Array<{ value: MasteryLevel; label: string; shortLabel: string }> = [
  { value: "acquired", label: "Acquis", shortLabel: "A" },
  { value: "developing", label: "En cours d’acquisition", shortLabel: "ECA" },
  { value: "not_acquired", label: "Non encore acquis", shortLabel: "NA" },
  { value: "not_evaluated", label: "Non évalué", shortLabel: "NE" },
];
export function masteryLevelLabel(value?: MasteryLevel) {
  return MASTERY_LEVEL_OPTIONS.find((option) => option.value === value)?.label || "Non évalué";
}
export type ReportStatus =
  | "draft"
  | "calculated"
  | "review"
  | "validated"
  | "locked"
  | "published";
export type Mention =
  | ""
  | "Encouragements"
  | "Tableau d’honneur"
  | "Félicitations"
  | "Avertissement travail"
  | "Avertissement conduite";

export type SchoolSettings = {
  academicYear: string;
  periodKind: PeriodKind;
  activePeriodId: string;
  maxScore: number;
  passThreshold: number;
  decimals: number;
  schoolName: string;
  logoUrl: string;
  address: string;
  phone: string;
  email: string;
  headName: string;
  bulletinModel: string;
  individualMode: boolean;
  simulatedRole: GradingRole;
};
export type GradingPeriod = {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
  locked: boolean;
};
export type ClassSubject = {
  id: string;
  classId: string;
  periodId?: string;
  subject: string;
  coefficient: number;
  teacherName: string;
  principal: boolean;
  active: boolean;
};
export type GradeAssessment = {
  id: string;
  evaluationId: string;
  classId: string;
  subject: string;
  periodId: string;
  title: string;
  date: string;
  maxScore: number;
  coefficient: number;
  active: boolean;
  category?: string;
  publishedOn?: string;
  theme?: string;
  locked?: boolean;
  evaluationMode?: EvaluationMode;
};
export type AssessmentScore = {
  id: string;
  assessmentId: string;
  studentId: string;
  value: number | null;
  status: ScoreStatus;
  mastery?: MasteryLevel;
  updatedAt: string;
};
export type AttendanceRecord = {
  studentId: string;
  periodId: string;
  absences: number;
  lateCount: number;
};
export type SubjectComment = {
  studentId: string;
  periodId: string;
  subject: string;
  comment: string;
};
export type GeneralComment = {
  studentId: string;
  periodId: string;
  general: string;
  work: string;
  conduct: string;
  decision: string;
  mention: Mention;
};
export type ReportSubjectRow = {
  subject: string;
  average: number | null;
  coefficient: number;
  weighted: number | null;
  classAverage: number | null;
  rank: number | null;
  assessmentCount: number;
  comment: string;
  mastery?: MasteryLevel;
};
export type ReportSnapshot = {
  id: string;
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  classLevel?: string;
  periodId: string;
  periodLabel: string;
  academicYear: string;
  createdAt: string;
  status: ReportStatus;
  settings: SchoolSettings;
  subjects: ReportSubjectRow[];
  generalAverage: number | null;
  generalRank: number | null;
  classAverage: number | null;
  bestAverage: number | null;
  lowestAverage: number | null;
  totalCoefficients: number;
  attendance: AttendanceRecord;
  comments: GeneralComment;
  classSize: number;
};
export type ArchivedReport = {
  id: string;
  studentId: string;
  classId: string;
  periodId: string;
  status: ReportStatus;
  snapshot: ReportSnapshot;
  createdAt: string;
  lockedAt: string | null;
  reopenedReason?: string;
  history?: Array<{
    status: ReportStatus;
    role: GradingRole;
    reason: string;
    createdAt: string;
  }>;
};
export type GradingWorkspace = {
  settings: SchoolSettings;
  periods: GradingPeriod[];
  classSubjects: ClassSubject[];
  assessments: GradeAssessment[];
  scores: AssessmentScore[];
  attendance: AttendanceRecord[];
  subjectComments: SubjectComment[];
  generalComments: GeneralComment[];
  reports: ArchivedReport[];
  updatedAt: string;
};
