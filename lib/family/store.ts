"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Lectures de l'espace famille.
 *
 * Tout part du compte connecté : on ne demande jamais à l'utilisateur qui il
 * est. Un parent est retrouvé par guardians.profile_id, un élève par
 * student_records.profile_id. Les politiques RLS de la migration 067 font le
 * reste : même en cas d'erreur ici, personne ne peut lire les données d'un
 * autre enfant.
 */

export type FamilyChild = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  classId: string;
  className: string;
  relationship: string;
};

export type ReportCardSummary = {
  id: string;
  periodLabel: string;
  average: number | null;
  rank: string;
  status: string;
  subjects: Array<{ name: string; average: number | null; coefficient: number; comment: string }>;
  generalComment: string;
  /** Dernière mise à jour, qui sert à signaler un bulletin nouvellement publié. */
  publishedAt: string;
};

export type AttendanceEntry = {
  id: string;
  date: string;
  kind: "absence" | "late" | "early_leave";
  durationMinutes: number;
  reason: string;
  justified: boolean;
  /**
   * Quand l'établissement a saisi le fait — distinct du jour de l'absence.
   * Une absence de lundi saisie jeudi est une nouveauté du jeudi pour la
   * famille : c'est ce jour-là qu'elle pouvait l'apprendre.
   */
  recordedAt: string;
};

export type TimetableEntry = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  subject: string;
  room: string;
};

export type FamilyMessage = {
  id: string;
  title: string;
  body: string;
  studentName: string;
  receivedAt: string;
};

/** Une séance du cahier de texte, telle qu'elle est présentée à la famille. */
export type FamilyLesson = {
  id: string;
  title: string;
  subject: string;
  weekNumber: number | null;
  summary: string;
  homework: string;
  updatedAt: string;
};

/**
 * Relevé de notes : ce que la famille voit en continu, dès la première
 * évaluation. À ne pas confondre avec le bulletin, qui n'apparaît qu'une fois
 * publié par l'établissement.
 */
export type FamilyScoreLine = {
  title: string;
  date: string;
  score: number | null;
  rawScore: number | null;
  maxScore: number;
  coefficient: number;
  status: string;
};

export type FamilyScoreSubject = {
  subject: string;
  coefficient: number;
  average: number | null;
  assessments: FamilyScoreLine[];
};

export type FamilyScoreStatement = {
  periodLabel: string;
  academicYear: string;
  maxScore: number;
  generalAverage: number | null;
  assessmentCount: number;
  updatedAt: string;
  subjects: FamilyScoreSubject[];
};

/** Une évaluation programmée par un enseignant et publiée à la classe. */
export type FamilyEvaluation = {
  id: string;
  title: string;
  subject: string;
  date: string;
  /** Vrai tant que la date n'est pas passée. */
  upcoming: boolean;
  /**
   * Quand l'enseignant a programmé l'épreuve. La date de composition ne peut
   * pas servir de repère de nouveauté : elle est dans l'avenir, et une
   * évaluation resterait « nouvelle » jusqu'au jour où elle a lieu.
   */
  announcedAt: string;
};

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [raw.message, raw.details]
      .map((value) => (typeof value === "string" ? value : ""))
      .filter(Boolean);
    const code = typeof raw.code === "string" && raw.code ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "Lecture impossible.";
}

const RELATIONSHIPS: Record<string, string> = {
  father: "Père",
  mother: "Mère",
  guardian: "Tuteur",
  legal_guardian: "Tuteur légal",
  other: "Responsable",
};

export type FamilyIdentity = {
  kind: "parent" | "student" | "unlinked";
  userId: string;
  displayName: string;
  guardianId: string;
  /**
   * Coordonnées du responsable, qu'il peut corriger lui-même. Vides pour un
   * élève : sa fiche appartient à l'établissement.
   */
  contact: { phone: string; email: string; address: string };
  children: FamilyChild[];
  /** Explication à afficher quand aucun rattachement n'a été trouvé. */
  reason: string;
};

/**
 * Identifie la personne connectée et la rattache à ses enfants — ou à
 * lui-même s'il s'agit d'un élève.
 */
export async function resolveFamilyIdentity(
  space: "parent" | "student",
): Promise<FamilyIdentity> {
  const client = createClient();
  const { data: auth } = await client.auth.getUser();
  const userId = auth.user?.id || "";
  const empty: FamilyIdentity = {
    kind: "unlinked",
    userId,
    displayName: "",
    guardianId: "",
    contact: { phone: "", email: "", address: "" },
    children: [],
    reason: "",
  };
  if (!userId) return { ...empty, reason: "Session expirée. Reconnectez-vous." };

  if (space === "student") {
    // Un même profil peut se retrouver rattaché à deux dossiers d'élève —
    // réinscription, doublon de saisie. maybeSingle() échouerait alors sur une
    // erreur technique incompréhensible pour l'élève ; on prend le dossier le
    // plus récent, qui est celui de sa scolarité en cours.
    const { data, error } = await client
      .from("student_records")
      .select("id,first_name,last_name,class_group_id,status,class_groups(name)")
      .eq("profile_id", userId)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(describe(error));
    if (!data)
      return {
        ...empty,
        reason:
          "Votre compte n'est rattaché à aucun dossier d'élève. Demandez au secrétariat de faire le rattachement.",
      };
    const row = data as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      class_group_id: string;
      class_groups?: { name?: string } | null;
    };
    const child: FamilyChild = {
      id: String(row.id),
      firstName: String(row.first_name || ""),
      lastName: String(row.last_name || ""),
      fullName: `${row.last_name || ""} ${row.first_name || ""}`.trim(),
      classId: String(row.class_group_id || ""),
      className: String(row.class_groups?.name || ""),
      relationship: "Élève",
    };
    return {
      kind: "student",
      userId,
      displayName: child.fullName,
      guardianId: "",
      contact: { phone: "", email: "", address: "" },
      children: [child],
      reason: "",
    };
  }

  const guardian = await client
    .from("guardians")
    .select("id,first_name,last_name,phone,email,address")
    .eq("profile_id", userId)
    .maybeSingle();
  if (guardian.error) throw new Error(describe(guardian.error));
  if (!guardian.data)
    return {
      ...empty,
      reason:
        "Votre compte n'est rattaché à aucune fiche de responsable. Demandez au secrétariat de faire le rattachement.",
    };

  const links = await client
    .from("guardian_student_links")
    .select("relationship,student_records(id,first_name,last_name,class_group_id,status,class_groups(name))")
    .eq("guardian_id", guardian.data.id);
  if (links.error) throw new Error(describe(links.error));

  type LinkRow = {
    relationship: string;
    student_records?: {
      id?: string;
      first_name?: string;
      last_name?: string;
      class_group_id?: string;
      status?: string;
      class_groups?: { name?: string } | null;
    } | null;
  };

  const children = ((links.data || []) as unknown as LinkRow[])
    .map((link) => {
      const student = link.student_records;
      if (!student?.id || student.status === "archived") return null;
      return {
        id: String(student.id),
        firstName: String(student.first_name || ""),
        lastName: String(student.last_name || ""),
        fullName: `${student.last_name || ""} ${student.first_name || ""}`.trim(),
        classId: String(student.class_group_id || ""),
        className: String(student.class_groups?.name || ""),
        relationship: RELATIONSHIPS[String(link.relationship)] || "Responsable",
      } satisfies FamilyChild;
    })
    .filter((item): item is FamilyChild => item !== null)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "fr"));

  return {
    kind: "parent",
    userId,
    displayName: `${guardian.data.last_name || ""} ${guardian.data.first_name || ""}`.trim(),
    guardianId: String(guardian.data.id),
    contact: {
      phone: String(guardian.data.phone || ""),
      email: String(guardian.data.email || ""),
      address: String(guardian.data.address || ""),
    },
    children,
    reason: children.length
      ? ""
      : "Aucun enfant n'est rattaché à votre fiche. Signalez-le au secrétariat de l'établissement.",
  };
}

/**
 * Cahier de texte de la classe : séances publiées et travail à faire.
 *
 * Les brouillons sont écartés par la politique de la migration 073, pas ici —
 * un filtre côté navigateur ne protégerait rien.
 */
export async function loadClassLessons(classId: string): Promise<FamilyLesson[]> {
  if (!classId) return [];
  const { data, error } = await createClient()
    .from("lesson_plans")
    .select("id,title,week_number,lesson_summary,homework,updated_at,subjects(name)")
    .eq("class_group_id", classId)
    .order("updated_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(describe(error));

  type LessonRow = {
    id: string;
    title?: string;
    week_number?: number | null;
    lesson_summary?: string;
    homework?: string;
    updated_at?: string;
    subjects?: { name?: string } | Array<{ name?: string }> | null;
  };

  return ((data || []) as unknown as LessonRow[]).map((row) => {
    const subject = Array.isArray(row.subjects) ? row.subjects[0] : row.subjects;
    return {
      id: String(row.id),
      title: String(row.title || "Séance sans titre"),
      subject: String(subject?.name || ""),
      weekNumber: row.week_number ?? null,
      summary: String(row.lesson_summary || ""),
      homework: String(row.homework || ""),
      updatedAt: String(row.updated_at || ""),
    };
  });
}

/**
 * Évaluations publiées de la classe.
 *
 * Les évaluations à venir sont remontées en tête : c'est ce qu'un parent
 * cherche. Les passées restent consultables en dessous, car elles expliquent
 * les notes qui arriveront ensuite.
 */
export async function loadClassEvaluations(classId: string): Promise<FamilyEvaluation[]> {
  if (!classId) return [];
  const { data, error } = await createClient()
    .from("teacher_evaluations")
    .select("id,title,subject,evaluation_date,created_at")
    .eq("class_group_id", classId)
    .order("evaluation_date", { ascending: false })
    .limit(40);
  if (error) throw new Error(describe(error));

  // Comparaison au jour près : une composition prévue aujourd'hui est encore
  // « à venir » pour la famille qui consulte le matin.
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

  type EvaluationRow = {
    id: string;
    title?: string;
    subject?: string;
    evaluation_date?: string;
    created_at?: string;
  };

  return ((data || []) as unknown as EvaluationRow[])
    .map((row) => {
      const date = String(row.evaluation_date || "");
      const parsed = date ? new Date(date).getTime() : NaN;
      return {
        id: String(row.id),
        title: String(row.title || "Évaluation"),
        subject: String(row.subject || ""),
        date,
        upcoming: Number.isNaN(parsed) ? false : parsed >= startOfToday,
        announcedAt: String(row.created_at || ""),
      };
    })
    .sort((a, b) => {
      if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
      return a.upcoming ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
}

/**
 * Relevés de notes d'un élève, période par période.
 *
 * Plusieurs enseignants peuvent alimenter la même période, chacun pour ses
 * matières : leurs lignes sont réunies ici, et les matières triées par ordre
 * alphabétique pour que le relevé ne change pas d'aspect d'une visite à
 * l'autre selon l'ordre de saisie.
 */
export async function loadScoreStatements(studentId: string): Promise<FamilyScoreStatement[]> {
  if (!studentId) return [];
  const { data, error } = await createClient()
    .from("student_score_statements")
    .select(
      "period_ref,period_label,academic_year,max_score,general_average,assessment_count,statement,updated_at",
    )
    .eq("class_student_id", studentId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(describe(error));

  type StatementRow = {
    period_ref?: string;
    period_label?: string;
    academic_year?: string;
    max_score?: number;
    general_average?: number | null;
    assessment_count?: number;
    updated_at?: string;
    statement?: { subjects?: FamilyScoreSubject[] } | null;
  };

  const byPeriod = new Map<string, FamilyScoreStatement>();
  for (const row of (data || []) as unknown as StatementRow[]) {
    const key = String(row.period_ref || "");
    const subjects = row.statement?.subjects || [];
    const existing = byPeriod.get(key);
    if (!existing) {
      byPeriod.set(key, {
        periodLabel: String(row.period_label || "Période"),
        academicYear: String(row.academic_year || ""),
        maxScore: Number(row.max_score || 20),
        generalAverage: row.general_average ?? null,
        assessmentCount: Number(row.assessment_count || 0),
        updatedAt: String(row.updated_at || ""),
        subjects: [...subjects],
      });
      continue;
    }
    existing.subjects.push(...subjects);
    existing.assessmentCount += Number(row.assessment_count || 0);
    // Une moyenne générale calculée sur une partie des matières n'a pas de
    // sens une fois plusieurs enseignants réunis : on préfère ne rien
    // afficher plutôt qu'un chiffre trompeur.
    existing.generalAverage = null;
  }

  return [...byPeriod.values()]
    .map((statement) => ({
      ...statement,
      subjects: statement.subjects.sort((a, b) => a.subject.localeCompare(b.subject, "fr")),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Bulletins publiés d'un élève. Les notes sont rattachées à class_students,
 * dont l'identifiant est le même que celui du dossier de l'élève.
 */
export async function loadReportCards(studentId: string): Promise<ReportCardSummary[]> {
  const client = createClient();
  const { data, error } = await client
    .from("report_cards")
    .select(
      "id,report_status,general_average,general_rank,class_average,updated_at,grading_period_id,grading_periods(label,period_kind),report_card_subjects(subject_name,average_value,coefficient,appreciation),report_card_comments(general_comment)",
    )
    .eq("class_student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(describe(error));

  type ReportRow = {
    id: string;
    report_status?: string;
    general_average?: number | null;
    general_rank?: number | null;
    updated_at?: string;
    grading_period_id?: string;
    grading_periods?: { label?: string; period_kind?: string } | Array<{ label?: string; period_kind?: string }> | null;
    report_card_subjects?: Array<{
      subject_name?: string;
      average_value?: number | null;
      coefficient?: number;
      appreciation?: string;
    }> | null;
    report_card_comments?: { general_comment?: string } | Array<{ general_comment?: string }> | null;
  };

  return ((data || []) as unknown as ReportRow[]).map((row) => {
    const comments = Array.isArray(row.report_card_comments)
      ? row.report_card_comments[0]
      : row.report_card_comments;
    const period = Array.isArray(row.grading_periods)
      ? row.grading_periods[0]
      : row.grading_periods;
    return {
      id: String(row.id),
      // Le libellé saisi par l'établissement — « 1er trimestre », « 2e
      // semestre ». Le repli mentionne la nature de la période plutôt que son
      // identifiant : un parent ne doit jamais lire de suite hexadécimale sur
      // le bulletin de son enfant.
      periodLabel:
        String(period?.label || "").trim() ||
        (period?.period_kind === "semester" ? "Semestre" : "Période non nommée"),
      average: row.general_average ?? null,
      rank: row.general_rank === null || row.general_rank === undefined ? "" : String(row.general_rank),
      status: String(row.report_status || ""),
      subjects: (row.report_card_subjects || []).map((subject) => ({
        name: String(subject.subject_name || ""),
        average: subject.average_value ?? null,
        coefficient: Number(subject.coefficient || 1),
        comment: String(subject.appreciation || ""),
      })),
      generalComment: String(comments?.general_comment || ""),
      publishedAt: String(row.updated_at || ""),
    };
  });
}

export async function loadAttendance(studentId: string): Promise<AttendanceEntry[]> {
  const { data, error } = await createClient()
    .from("attendance_records")
    .select("id,attendance_date,attendance_kind,duration_minutes,reason,is_justified,created_at")
    .eq("student_id", studentId)
    .order("attendance_date", { ascending: false })
    .limit(60);
  if (error) throw new Error(describe(error));
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    date: String(row.attendance_date || ""),
    kind: String(row.attendance_kind || "absence") as AttendanceEntry["kind"],
    durationMinutes: Number(row.duration_minutes || 0),
    reason: String(row.reason || ""),
    justified: Boolean(row.is_justified),
    recordedAt: String(row.created_at || ""),
  }));
}

export async function loadTimetable(classId: string): Promise<TimetableEntry[]> {
  if (!classId) return [];
  const { data, error } = await createClient()
    .from("timetable_slots")
    .select("id,weekday,starts_at,ends_at,room,school_subjects(label)")
    .eq("class_group_id", classId)
    .order("weekday")
    .order("starts_at");
  if (error) throw new Error(describe(error));
  type SlotRow = {
    id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    room?: string | null;
    school_subjects?: { label?: string } | null;
  };
  return ((data || []) as unknown as SlotRow[]).map((row) => ({
    id: String(row.id),
    weekday: Number(row.weekday || 1),
    startsAt: String(row.starts_at || "").slice(0, 5),
    endsAt: String(row.ends_at || "").slice(0, 5),
    subject: String(row.school_subjects?.label || "Matière"),
    room: String(row.room || ""),
  }));
}

/** Messages adressés à ce responsable par l'établissement. */
export async function loadMessages(guardianId: string): Promise<FamilyMessage[]> {
  if (!guardianId) return [];
  const { data, error } = await createClient()
    .from("message_recipients")
    .select("id,resolved_body,student_name,created_at,message_campaigns(title,publish_to_parent_space)")
    .eq("guardian_id", guardianId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(describe(error));
  type MessageRow = {
    id: string;
    resolved_body?: string;
    student_name?: string;
    created_at?: string;
    message_campaigns?: { title?: string; publish_to_parent_space?: boolean } | null;
  };
  return ((data || []) as unknown as MessageRow[])
    .filter((row) => row.message_campaigns?.publish_to_parent_space !== false)
    .map((row) => ({
      id: String(row.id),
      title: String(row.message_campaigns?.title || "Message de l'établissement"),
      body: String(row.resolved_body || ""),
      studentName: String(row.student_name || ""),
      receivedAt: String(row.created_at || ""),
    }));
}

/**
 * Enregistre les coordonnées du responsable connecté.
 *
 * Passe par une fonction SQL plutôt que par une écriture directe : Supabase
 * accorde les droits colonne par colonne à tous les comptes authentifiés, si
 * bien qu'ouvrir la mise à jour de la ligne ouvrirait aussi la modification du
 * nom. La fonction, elle, ne touche que le téléphone, le courriel et
 * l'adresse — le reste de la fiche appartient à l'établissement.
 */
export async function saveMyContact(contact: {
  phone: string;
  email: string;
  address: string;
}): Promise<{ phone: string; email: string; address: string }> {
  const { data, error } = await createClient().rpc("update_my_guardian_contact", {
    new_phone: contact.phone,
    new_email: contact.email,
    new_address: contact.address,
  });
  if (error) throw new Error(describe(error));
  const row = (data || {}) as { phone?: string; email?: string; address?: string };
  return {
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    address: String(row.address || ""),
  };
}
