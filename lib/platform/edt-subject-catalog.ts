"use client";

import { resolveActiveSchoolContext } from "@/lib/active-school";
import { createClient } from "@/lib/supabase/client";
import { readLocal, STORAGE_KEYS, writeLocal } from "@/lib/storage-mode";
import type { PlatformWorkspace, SchoolSubject } from "@/lib/platform/types";

type SubjectAssignmentsCache = Pick<PlatformWorkspace, "subjects" | "assignments">;

export type EdtSubjectCatalogHydration = {
  count: number;
  source: "cloud" | "cache";
  warning: string;
};

export function mapRemoteSchoolSubjects(
  rows: Array<Record<string, unknown>>,
): SchoolSubject[] {
  return rows
    .map((row) => ({
      id: String(row.id || ""),
      schoolId: String(row.school_id || ""),
      code: String(row.code || ""),
      label: String(row.label || ""),
      color: String(row.color || ""),
      icon: String(row.icon || ""),
      levelId: String(row.school_level_id || ""),
      coefficient: Number(row.coefficient ?? 1) || 1,
      weeklyHours: Number(row.weekly_hours ?? 0) || 0,
      category: String(row.category || ""),
      bulletinOrder: Number(row.bulletin_order ?? 0) || 0,
      active: row.is_active !== false,
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    }))
    .filter((subject) => subject.id && subject.label);
}

export function mergeSchoolSubjectsForCache(
  current: SchoolSubject[],
  remote: SchoolSubject[],
  schoolId: string,
) {
  if (!remote.length) return current;
  // Pour l’établissement actif, Supabase est la source de vérité : on remplace
  // les anciennes copies locales afin de conserver les vrais identifiants de
  // school_subjects, indispensables aux affectations et aux créneaux.
  const otherSchools = current.filter(
    (subject) => subject.schoolId && subject.schoolId !== schoolId,
  );
  return [...remote, ...otherSchools];
}

export async function hydrateEdtSubjectCatalog(): Promise<EdtSubjectCatalogHydration> {
  const context = await resolveActiveSchoolContext();
  const schoolId = context.school.id;
  const cached = readLocal<SubjectAssignmentsCache>(STORAGE_KEYS.subjectAssignments, {
    subjects: [],
    assignments: [],
  });
  const cachedCount = cached.subjects.filter(
    (subject) => subject.active && (!subject.schoolId || subject.schoolId === schoolId),
  ).length;

  const { data, error } = await createClient()
    .from("school_subjects")
    .select(
      "id,school_id,code,label,color,icon,school_level_id,coefficient,weekly_hours,category,bulletin_order,is_active,created_at,updated_at",
    )
    .eq("school_id", schoolId)
    .order("bulletin_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return {
      count: cachedCount,
      source: "cache",
      warning: cachedCount
        ? "Catalogue Supabase momentanément indisponible ; les matières déjà présentes sur cet appareil sont conservées."
        : `Impossible de charger les matières de l’établissement : ${error.message}`,
    };
  }

  const remoteSubjects = mapRemoteSchoolSubjects(
    (data || []) as Array<Record<string, unknown>>,
  );
  if (!remoteSubjects.length) {
    return {
      count: cachedCount,
      source: "cache",
      warning: cachedCount
        ? "Aucune matière distante n’a été renvoyée ; le catalogue local est conservé."
        : "Aucune matière n’est actuellement disponible dans school_subjects pour cet établissement.",
    };
  }

  const subjects = mergeSchoolSubjectsForCache(cached.subjects, remoteSubjects, schoolId);
  writeLocal(STORAGE_KEYS.subjectAssignments, {
    subjects,
    assignments: cached.assignments,
  });

  return {
    count: remoteSubjects.filter((subject) => subject.active).length,
    source: "cloud",
    warning: "",
  };
}
