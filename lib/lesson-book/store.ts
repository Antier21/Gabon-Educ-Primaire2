"use client";

/**
 * Lecture et écriture du cahier de textes.
 *
 * Écritures directes vers Supabase, sans passer par la file de
 * synchronisation. Le cahier de textes fait foi : une séance doit être
 * enregistrée ou ne pas l'être, jamais rester en attente à l'insu de
 * l'enseignant qui croirait sa progression consignée.
 */

import { createClient } from "@/lib/supabase/client";
import { confirmWrite } from "@/lib/supabase/confirm-write";
import { sanitizeRichText } from "./rich-text";
import { shortTime, toISODate, weekDays } from "./week";

/** Un créneau de l'emploi du temps de l'enseignant. */
export type TeacherSlot = {
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

export type LessonBookEntry = {
  id: string;
  classId: string;
  subjectId: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  title: string;
  contentHtml: string;
  programElements: string;
  category: string;
  themes: string[];
  isPublished: boolean;
  publishedAt: string;
  updatedAt: string;
};

/**
 * Les catégories proposées.
 *
 * Reprises du cahier de textes réel : ce sont les mots qu'un enseignant écrit
 * déjà. La liste est une proposition, pas une contrainte — le champ reste
 * libre, parce qu'aucune liste ne couvrira toutes les disciplines.
 */
export const LESSON_CATEGORIES = [
  "Cours et activités orales",
  "Applications",
  "Exercices",
  "Évaluation",
  "Correction",
  "Révision",
  "Travaux dirigés",
  "Travaux pratiques",
] as const;

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
  return "Cahier de textes indisponible.";
}

/**
 * L'emploi du temps de l'enseignant connecté.
 *
 * Il sert de squelette à la grille de la semaine. Un établissement qui n'a pas
 * encore saisi ses emplois du temps rendra une liste vide : l'écran propose
 * alors la saisie libre, plutôt que de rester inutilisable jusqu'à ce que
 * l'administration ait fini son travail.
 */
export async function loadTeacherSlots(teacherId: string): Promise<TeacherSlot[]> {
  if (!teacherId) return [];
  const { data, error } = await createClient()
    .from("timetable_slots")
    .select(
      "id,class_group_id,school_subject_id,weekday,starts_at,ends_at,room," +
        "class_groups(name),school_subjects(label)",
    )
    .eq("teacher_id", teacherId)
    .order("weekday")
    .order("starts_at");
  if (error) throw new Error(describe(error));

  type Row = {
    id: string;
    class_group_id: string;
    school_subject_id: string;
    weekday: number;
    starts_at: string;
    ends_at: string;
    room?: string | null;
    class_groups?: { name?: string } | null;
    school_subjects?: { label?: string } | null;
  };

  return ((data || []) as unknown as Row[]).map((row) => ({
    id: String(row.id),
    classId: String(row.class_group_id || ""),
    className: String(row.class_groups?.name || "Classe"),
    subjectId: String(row.school_subject_id || ""),
    subjectLabel: String(row.school_subjects?.label || "Matière"),
    weekday: Number(row.weekday || 1),
    startsAt: shortTime(row.starts_at),
    endsAt: shortTime(row.ends_at),
    room: String(row.room || ""),
  }));
}

function toEntry(row: Record<string, unknown>): LessonBookEntry {
  return {
    id: String(row.id || ""),
    classId: String(row.class_group_id || ""),
    subjectId: String(row.school_subject_id || ""),
    sessionDate: String(row.session_date || ""),
    startsAt: shortTime(row.starts_at as string),
    endsAt: shortTime(row.ends_at as string),
    title: String(row.title || ""),
    // Filtré à la lecture autant qu'à l'écriture : ce qui est entré par un
    // autre chemin — import, base, version antérieure — doit l'être aussi.
    contentHtml: sanitizeRichText(String(row.content_html || "")),
    programElements: String(row.program_elements || ""),
    category: String(row.category || ""),
    themes: Array.isArray(row.themes) ? (row.themes as string[]).map(String) : [],
    isPublished: row.is_published === true,
    publishedAt: String(row.published_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

/** Les séances déjà consignées pendant une semaine donnée. */
export async function loadWeekEntries(
  teacherId: string,
  monday: Date,
): Promise<LessonBookEntry[]> {
  if (!teacherId) return [];
  const jours = weekDays(monday);
  const { data, error } = await createClient()
    .from("lesson_book_entries")
    .select("*")
    .eq("teacher_id", teacherId)
    .gte("session_date", toISODate(jours[0]))
    .lte("session_date", toISODate(jours[jours.length - 1]))
    .order("session_date")
    .order("starts_at");
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map(toEntry);
}

export type EntryDraft = {
  id?: string;
  schoolId: string;
  academicYearId?: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  timetableSlotId?: string;
  sessionDate: string;
  startsAt: string;
  endsAt: string;
  title: string;
  contentHtml: string;
  programElements: string;
  category: string;
  themes: string[];
};

/**
 * Enregistre une séance.
 *
 * Le contenu est filtré ici, avant d'atteindre la base : un contenu dangereux
 * ne doit pas y séjourner, même une seconde, même s'il est refiltré à
 * l'affichage. Défendre en deux endroits est le seul moyen de ne pas dépendre
 * d'un seul.
 */
export async function saveEntry(draft: EntryDraft): Promise<string> {
  const client = createClient();
  const payload = {
    school_id: draft.schoolId,
    academic_year_id: draft.academicYearId || null,
    class_group_id: draft.classId,
    school_subject_id: draft.subjectId || null,
    teacher_id: draft.teacherId,
    timetable_slot_id: draft.timetableSlotId || null,
    session_date: draft.sessionDate,
    starts_at: draft.startsAt || null,
    ends_at: draft.endsAt || null,
    title: draft.title.trim(),
    content_html: sanitizeRichText(draft.contentHtml),
    program_elements: draft.programElements.trim(),
    category: draft.category.trim(),
    themes: draft.themes.map((theme) => theme.trim()).filter(Boolean),
  };

  if (draft.id) {
    const result = await client
      .from("lesson_book_entries")
      .update(payload)
      .eq("id", draft.id)
      .select("id");
    confirmWrite(result, "l’enregistrement de cette séance");
    return draft.id;
  }

  const { data, error } = await client
    .from("lesson_book_entries")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(describe(error));
  return String((data as { id?: string })?.id || "");
}

/**
 * Remet la séance aux familles, ou la retire.
 *
 * Même règle que le bulletin : écrire et remettre sont deux gestes. Une séance
 * en cours de rédaction ne doit pas atteindre les parents à moitié écrite.
 */
export async function setEntryPublished(id: string, published: boolean): Promise<void> {
  const result = await createClient()
    .from("lesson_book_entries")
    .update({
      is_published: published,
      published_at: published ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id");
  confirmWrite(
    result,
    published ? "la publication de cette séance" : "le retrait de cette séance",
  );
}

export async function deleteEntry(id: string): Promise<void> {
  const result = await createClient()
    .from("lesson_book_entries")
    .delete()
    .eq("id", id)
    .select("id");
  confirmWrite(result, "la suppression de cette séance");
}
