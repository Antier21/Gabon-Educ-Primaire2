export type SchoolRole =
  | "super_admin"
  | "school_admin"
  | "headmaster"
  | "academic_director"
  | "supervisor"
  | "secretary"
  | "head_teacher"
  | "teacher"
  | "guardian"
  | "student";

export type AccountStatus = "invited" | "active" | "suspended";
export type PublicationStatus = "draft" | "published" | "archived";
export type AttendanceKind = "absence" | "late" | "early_leave";

export type SchoolEducationLevel = "primary" | "middle_school" | "high_school" | "complex_school";
export type SchoolSector = "public" | "private";

export type SchoolProfile = {
  id: string;
  name: string;
  acronym: string;
  schoolType: SchoolEducationLevel;
  schoolSector: SchoolSector;
  registrationNumber: string;
  province: string;
  city: string;
  district: string;
  neighborhood: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  stampUrl: string;
  headName: string;
  motto: string;
  activeAcademicYearId: string;
  periodSystem: "trimester" | "semester";
  maxScore: number;
  passThreshold: number;
  bulletinModel: string;
  timezone: string;
  language: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SchoolUser = {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  accessIdentifier?: string;
  authEmail?: string;
  mustChangePassword?: boolean;
  role: SchoolRole;
  status: AccountStatus;
  scopeClassIds: string[];
  invitationStatus: "pending" | "accepted" | "revoked" | "expired";
  invitedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AcademicYear = {
  id: string;
  schoolId: string;
  label: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SchoolPeriod = {
  id: string;
  schoolId: string;
  academicYearId: string;
  label: string;
  startsOn: string;
  endsOn: string;
  active: boolean;
  locked: boolean;
  lockedAt: string;
  reopenedReason: string;
  updatedAt: string;
};

export type SchoolLevel = {
  id: string;
  schoolId: string;
  code: string;
  label: string;
  cycle: string;
  active: boolean;
};

export type StudentRecord = {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  registrationNumber: string;
  firstName: string;
  lastName: string;
  gender: "" | "female" | "male";
  dateOfBirth: string;
  placeOfBirth: string;
  nationality: string;
  photoUrl: string;
  address: string;
  phone: string;
  email: string;
  previousSchool: string;
  enrolledOn: string;
  status: "active" | "transferred" | "archived";
  specialNeeds: string;
  emergencyContact: string;
  administrativeNotes: string;
  limitedMedicalNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type Guardian = {
  id: string;
  schoolId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  contactAllowed: boolean;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type GuardianLink = {
  id: string;
  schoolId: string;
  guardianId: string;
  studentId: string;
  relationship: "father" | "mother" | "guardian" | "legal_guardian" | "other";
  primary: boolean;
  createdAt: string;
};

export type SchoolSubject = {
  id: string;
  schoolId: string;
  code: string;
  label: string;
  color: string;
  icon: string;
  levelId: string;
  coefficient: number;
  weeklyHours: number;
  category: string;
  bulletinOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TeachingAssignment = {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  startsOn: string;
  endsOn: string;
  temporary: boolean;
  headTeacher: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TimetableSlot = {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  room: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  weekLabel: string;
  createdAt: string;
  updatedAt: string;
};

export type AttendanceEntry = {
  id: string;
  schoolId: string;
  academicYearId: string;
  periodId: string;
  classId: string;
  studentId: string;
  timetableSlotId: string;
  kind: AttendanceKind;
  date: string;
  durationMinutes: number;
  reason: string;
  proofName: string;
  justified: boolean;
  recordedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AnnouncementAudience =
  | "school"
  | "teachers"
  | "guardians"
  | "students"
  | "class"
  | "group"
  | "user";

export type Announcement = {
  id: string;
  schoolId: string;
  title: string;
  content: string;
  audience: AnnouncementAudience;
  targetId: string;
  attachmentName: string;
  publishesAt: string;
  expiresAt: string;
  status: PublicationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DocumentKind =
  | "enrollment_certificate"
  | "registration_attestation"
  | "student_record"
  | "class_list"
  | "teacher_list"
  | "transcript"
  | "report_card"
  | "timetable"
  | "attendance_sheet"
  | "student_card"
  | "summons";

export type SchoolDocument = {
  id: string;
  schoolId: string;
  kind: DocumentKind;
  title: string;
  studentId: string;
  classId: string;
  payload: Record<string, unknown>;
  status: "draft" | "generated" | "archived";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MigrationJournalEntry = {
  id: string;
  detectedAt: string;
  confirmedAt: string;
  status: "detected" | "confirmed" | "cancelled";
  sourceCounts: Record<string, number>;
  importedCounts: Record<string, number>;
  notes: string;
};

export type ReportWorkflowEvent = {
  id: string;
  reportId: string;
  schoolId: string;
  actorId: string;
  actorRole: SchoolRole;
  action: "subject_validated" | "head_teacher_validated" | "admin_checked" | "headmaster_validated" | "locked" | "reopened" | "published";
  reason: string;
  createdAt: string;
};

export type PlatformWorkspace = {
  school: SchoolProfile | null;
  users: SchoolUser[];
  academicYears: AcademicYear[];
  periods: SchoolPeriod[];
  levels: SchoolLevel[];
  students: StudentRecord[];
  guardians: Guardian[];
  guardianLinks: GuardianLink[];
  subjects: SchoolSubject[];
  assignments: TeachingAssignment[];
  timetable: TimetableSlot[];
  attendance: AttendanceEntry[];
  announcements: Announcement[];
  documents: SchoolDocument[];
  migrationJournal: MigrationJournalEntry[];
  reportWorkflow: ReportWorkflowEvent[];
  updatedAt: string;
};
