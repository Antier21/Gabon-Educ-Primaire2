"use client";

import { createClient } from "@/lib/supabase/client";
import type { PlatformWorkspace, TimetableSlot } from "@/lib/platform/types";

const CHUNK_SIZE = 40;

function describe(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [value.message, value.details, value.hint]
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    const code = typeof value.code === "string" && value.code ? ` (code ${value.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "Erreur Supabase inconnue.";
}

function chunks<T>(items: T[], size = CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

type CloudClass = {
  id: string;
  academic_year_id: string;
};

type CloudSubject = {
  id: string;
};

/**
 * Publie le planning complet dans la table relationnelle utilisée par les
 * espaces Parent et Élève.
 *
 * Le workspace local conserve volontairement sa propre copie pour le travail
 * hors ligne, mais cette fonction ne considère la publication réussie qu'après
 * une relecture des lignes dans `timetable_slots`.
 */
export async function publishTimetableToCloud(
  workspace: PlatformWorkspace,
  slots: TimetableSlot[],
): Promise<number> {
  const schoolId = workspace.school?.id || "";
  if (!schoolId || schoolId === "local") {
    throw new Error("Établissement Supabase introuvable : l’emploi du temps ne peut pas être publié.");
  }
  if (!slots.length) return 0;

  const client = createClient();
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user?.id) {
    throw new Error("Session Supabase absente ou expirée. Reconnectez-vous avant de publier l’emploi du temps.");
  }

  const classIds = Array.from(new Set(slots.map((slot) => slot.classId).filter(Boolean)));
  const subjectIds = Array.from(new Set(slots.map((slot) => slot.subjectId).filter(Boolean)));

  if (!classIds.length) throw new Error("Aucune classe valide n’est rattachée à l’emploi du temps.");
  if (!subjectIds.length) throw new Error("Aucune matière valide n’est rattachée à l’emploi du temps.");

  const classRows: CloudClass[] = [];
  for (const ids of chunks(classIds)) {
    const { data, error } = await client
      .from("class_groups")
      .select("id,academic_year_id")
      .eq("school_id", schoolId)
      .in("id", ids);
    if (error) throw new Error(`Classes Supabase illisibles : ${describe(error)}`);
    classRows.push(...((data || []) as CloudClass[]));
  }
  const yearByClass = new Map(classRows.map((row) => [String(row.id), String(row.academic_year_id || "")]));
  const missingClasses = classIds.filter((id) => !yearByClass.get(id));
  if (missingClasses.length) {
    throw new Error(
      `${missingClasses.length} classe(s) de l’emploi du temps ne sont pas enregistrée(s) correctement dans Supabase.`,
    );
  }

  const cloudSubjects: CloudSubject[] = [];
  for (const ids of chunks(subjectIds)) {
    const { data, error } = await client
      .from("school_subjects")
      .select("id")
      .eq("school_id", schoolId)
      .in("id", ids);
    if (error) throw new Error(`Matières Supabase illisibles : ${describe(error)}`);
    cloudSubjects.push(...((data || []) as CloudSubject[]));
  }
  const validSubjects = new Set(cloudSubjects.map((row) => String(row.id)));
  const missingSubjects = subjectIds.filter((id) => !validSubjects.has(id));
  if (missingSubjects.length) {
    const labels = missingSubjects
      .map((id) => workspace.subjects.find((subject) => subject.id === id)?.label || "Matière")
      .slice(0, 4)
      .join(", ");
    throw new Error(
      `Certaines matières de l’emploi du temps ne correspondent pas au catalogue Supabase${labels ? ` : ${labels}` : ""}.`,
    );
  }

  const rows = slots.map((slot) => ({
    id: slot.id,
    school_id: schoolId,
    // L’année de la classe cloud est la source d’autorité. Cela évite qu’un
    // identifiant d’année resté en cache fasse échouer tous les créneaux.
    academic_year_id: yearByClass.get(slot.classId),
    class_group_id: slot.classId,
    school_subject_id: slot.subjectId,
    teacher_id: slot.teacherId || null,
    room: slot.room || null,
    weekday: slot.weekday,
    starts_at: slot.startsAt,
    ends_at: slot.endsAt,
    week_label: slot.weekLabel || null,
    created_by: auth.user.id,
  }));

  for (const batch of chunks(rows)) {
    const { error } = await client
      .from("timetable_slots")
      .upsert(batch, { onConflict: "id" });
    if (error) {
      throw new Error(`Publication de l’emploi du temps refusée : ${describe(error)}`);
    }
  }

  // Une écriture locale ou un upsert sans exception n'est pas une preuve
  // suffisante : on recompte les identifiants réellement relus dans le cloud.
  let verified = 0;
  for (const ids of chunks(rows.map((row) => row.id))) {
    const { data, error } = await client
      .from("timetable_slots")
      .select("id")
      .eq("school_id", schoolId)
      .in("id", ids);
    if (error) throw new Error(`Vérification de l’emploi du temps impossible : ${describe(error)}`);
    verified += (data || []).length;
  }

  if (verified !== rows.length) {
    throw new Error(
      `Publication incomplète : ${verified} créneau(x) confirmé(s) sur ${rows.length}. L’emploi du temps reste conservé localement.`,
    );
  }

  return verified;
}
