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

export type CloudClass = {
  id: string;
  name: string;
  academic_year_id: string;
};

type CloudSubject = {
  id: string;
};

type StudentClassRow = {
  class_group_id: string;
  status?: string | null;
};

function normalizedClassName(value: string) {
  return value.trim().toLocaleLowerCase("fr");
}

/**
 * En cas de doublon historique de `class_groups`, retient la ligne qui porte
 * réellement les élèves actifs. Deux classes ayant le même nom mais des années
 * scolaires différentes ne sont jamais confondues.
 */
export function chooseCanonicalClassId(
  sourceClassId: string,
  classes: CloudClass[],
  activeStudentsByClass: Map<string, number>,
): string {
  const source = classes.find((item) => item.id === sourceClassId);
  if (!source) return "";

  const candidates = classes.filter(
    (item) =>
      normalizedClassName(item.name) === normalizedClassName(source.name) &&
      item.academic_year_id === source.academic_year_id,
  );
  if (!candidates.length) return source.id;

  return [...candidates]
    .sort((a, b) => {
      const studentDelta =
        (activeStudentsByClass.get(b.id) || 0) -
        (activeStudentsByClass.get(a.id) || 0);
      if (studentDelta !== 0) return studentDelta;
      if (a.id === sourceClassId && b.id !== sourceClassId) return -1;
      if (b.id === sourceClassId && a.id !== sourceClassId) return 1;
      return a.id.localeCompare(b.id);
    })[0].id;
}

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

  // On charge toutes les classes de l'établissement, et non uniquement les
  // identifiants portés par l'EDT. Des doublons historiques peuvent exister :
  // l'élève peut être rattaché à une ligne tandis que l'EDT en vise une autre.
  const classResult = await client
    .from("class_groups")
    .select("id,name,academic_year_id")
    .eq("school_id", schoolId);
  if (classResult.error) {
    throw new Error(`Classes Supabase illisibles : ${describe(classResult.error)}`);
  }
  const cloudClasses = (classResult.data || []) as CloudClass[];
  const knownClassIds = new Set(cloudClasses.map((row) => String(row.id)));
  const missingClasses = classIds.filter((id) => !knownClassIds.has(id));
  if (missingClasses.length) {
    throw new Error(
      `${missingClasses.length} classe(s) de l’emploi du temps ne sont pas enregistrée(s) correctement dans Supabase.`,
    );
  }

  const activeStudentsByClass = new Map<string, number>();
  const allCloudClassIds = cloudClasses.map((row) => String(row.id)).filter(Boolean);
  for (const ids of chunks(allCloudClassIds)) {
    const { data, error } = await client
      .from("student_records")
      .select("class_group_id,status")
      .in("class_group_id", ids);
    if (error) throw new Error(`Rattachement des élèves illisible : ${describe(error)}`);
    for (const row of (data || []) as StudentClassRow[]) {
      if (String(row.status || "active") === "archived") continue;
      const classId = String(row.class_group_id || "");
      if (!classId) continue;
      activeStudentsByClass.set(classId, (activeStudentsByClass.get(classId) || 0) + 1);
    }
  }

  const canonicalClassBySource = new Map<string, string>();
  for (const classId of classIds) {
    const canonical = chooseCanonicalClassId(classId, cloudClasses, activeStudentsByClass);
    if (!canonical) {
      throw new Error("Impossible de déterminer la classe Supabase de référence pour l’emploi du temps.");
    }
    canonicalClassBySource.set(classId, canonical);
  }
  const classById = new Map(cloudClasses.map((row) => [String(row.id), row]));

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

  const rows = slots.map((slot) => {
    const canonicalClassId = canonicalClassBySource.get(slot.classId) || slot.classId;
    const canonicalClass = classById.get(canonicalClassId);
    if (!canonicalClass?.academic_year_id) {
      throw new Error("La classe de référence ne possède pas d’année scolaire Supabase valide.");
    }
    return {
      id: slot.id,
      school_id: schoolId,
      // La classe qui contient réellement les élèves devient l'autorité. Un
      // upsert sur le même `id` déplace aussi les créneaux déjà publiés sur une
      // ancienne ligne de classe en double.
      academic_year_id: canonicalClass.academic_year_id,
      class_group_id: canonicalClassId,
      school_subject_id: slot.subjectId,
      teacher_id: slot.teacherId || null,
      room: slot.room || null,
      weekday: slot.weekday,
      starts_at: slot.startsAt,
      ends_at: slot.endsAt,
      week_label: slot.weekLabel || null,
      created_by: auth.user.id,
    };
  });

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
      .select("id,class_group_id")
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
