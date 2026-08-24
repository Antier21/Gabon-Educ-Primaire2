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
};

export type AttendanceEntry = {
  id: string;
  date: string;
  kind: "absence" | "late" | "early_leave";
  durationMinutes: number;
  reason: string;
  justified: boolean;
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
    children: [],
    reason: "",
  };
  if (!userId) return { ...empty, reason: "Session expirée. Reconnectez-vous." };

  if (space === "student") {
    const { data, error } = await client
      .from("student_records")
      .select("id,first_name,last_name,class_group_id,class_groups(name)")
      .eq("profile_id", userId)
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
    return { kind: "student", userId, displayName: child.fullName, guardianId: "", children: [child], reason: "" };
  }

  const guardian = await client
    .from("guardians")
    .select("id,first_name,last_name")
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
    children,
    reason: children.length
      ? ""
      : "Aucun enfant n'est rattaché à votre fiche. Signalez-le au secrétariat de l'établissement.",
  };
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
      "id,report_status,general_average,general_rank,class_average,grading_period_id,grading_periods(label,period_kind),report_card_subjects(subject_name,average_value,coefficient,appreciation),report_card_comments(general_comment)",
    )
    .eq("class_student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(describe(error));

  type ReportRow = {
    id: string;
    report_status?: string;
    general_average?: number | null;
    general_rank?: number | null;
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
    };
  });
}

export async function loadAttendance(studentId: string): Promise<AttendanceEntry[]> {
  const { data, error } = await createClient()
    .from("attendance_records")
    .select("id,attendance_date,attendance_kind,duration_minutes,reason,is_justified")
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
