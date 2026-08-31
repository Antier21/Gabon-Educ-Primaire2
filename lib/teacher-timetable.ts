"use client";

import { resolveActiveSchoolContext } from "@/lib/active-school";
import { createClient } from "@/lib/supabase/client";

export type TeacherTimetableSlot = {
  id: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectLabel: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string;
};

function shortTime(value: unknown) {
  return String(value || "").slice(0, 5);
}

function describe(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [raw.message, raw.details]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()));
    const code = typeof raw.code === "string" && raw.code ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "Emploi du temps enseignant indisponible.";
}

/**
 * Lit l'emploi du temps publié par l'administration pour l'enseignant connecté.
 *
 * `timetable_slots` est la source canonique : c'est dans cette table que la
 * génération automatique est publiée. Les espaces enseignants ne doivent donc
 * jamais dépendre de la copie locale du navigateur de l'administration.
 */
export async function loadCurrentTeacherTimetable(): Promise<TeacherTimetableSlot[]> {
  const client = createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError) throw new Error(describe(authError));
  if (!auth.user?.id) return [];

  const context = await resolveActiveSchoolContext();
  const schoolId = context.school.id;
  const academicYearId = context.school.activeAcademicYearId || "";

  let query = client
    .from("timetable_slots")
    .select(
      "id,class_group_id,school_subject_id,weekday,starts_at,ends_at,room," +
        "class_groups(name),school_subjects(label)",
    )
    .eq("school_id", schoolId)
    .eq("teacher_id", auth.user.id);

  if (academicYearId) query = query.eq("academic_year_id", academicYearId);

  const { data, error } = await query.order("weekday").order("starts_at");
  if (error) throw new Error(describe(error));

  type Row = {
    id: string;
    class_group_id: string;
    school_subject_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    room?: string | null;
    class_groups?: { name?: string } | Array<{ name?: string }> | null;
    school_subjects?: { label?: string } | Array<{ label?: string }> | null;
  };

  return ((data || []) as unknown as Row[]).map((row) => {
    const classRelation = Array.isArray(row.class_groups) ? row.class_groups[0] : row.class_groups;
    const subjectRelation = Array.isArray(row.school_subjects) ? row.school_subjects[0] : row.school_subjects;
    return {
      id: String(row.id),
      classId: String(row.class_group_id || ""),
      className: String(classRelation?.name || "Classe"),
      subjectId: String(row.school_subject_id || ""),
      subjectLabel: String(subjectRelation?.label || "Matière"),
      weekday: Number(row.weekday || 1),
      startsAt: shortTime(row.starts_at),
      endsAt: shortTime(row.ends_at),
      room: String(row.room || ""),
    };
  });
}
