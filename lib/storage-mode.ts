"use client";

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export type StorageMode = "cloud" | "demo" | "offline";
export type StorageStatus = { mode: StorageMode; user: User | null; message: string };

export const STORAGE_KEYS = {
  lessons: "gabon-educ-plus:v2:lessons",
  classes: "gabon-educ-plus:v2:classes",
  evaluations: "gabon-educ-plus:v1:evaluations",
  profile: "gabon-educ-plus:v1:profile",
  sync: "gabon-educ-plus:v1:sync",
  grading: "gabon-educ-plus:v1:grading",
  school: "gabon-educ-plus:v1:school",
  schoolUsers: "gabon-educ-plus:v1:school-users",
  academicStructure: "gabon-educ-plus:v1:academic-structure",
  students: "gabon-educ-plus:v1:students",
  guardians: "gabon-educ-plus:v1:guardians",
  subjectAssignments: "gabon-educ-plus:v1:subject-assignments",
  timetable: "gabon-educ-plus:v1:timetable",
  attendance: "gabon-educ-plus:v1:attendance",
  announcements: "gabon-educ-plus:v1:announcements",
  documents: "gabon-educ-plus:v1:documents",
  migrationJournal: "gabon-educ-plus:v1:migration-journal",
  syncQueue: "gabon-educ-plus:v0.9:sync-queue",
  syncMetadata: "gabon-educ-plus:v0.9:sync-metadata",
  auditLog: "gabon-educ-plus:v0.9:audit-log",
  notifications: "gabon-educ-plus:v0.9:notifications",
  importJobs: "gabon-educ-plus:v0.9:import-jobs",
  errorLog: "gabon-educ-plus:v0.9:error-log",
  activeSchool: "gabon-educ-plus:v0.9:active-school",
} as const;

export const LEGACY_KEYS = {
  lessons: "gabon-educ-plus-lessons",
  classes: "gabon-educ-plus-classes",
} as const;

export function hasSupabaseEnvironment() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}

export async function withTimeout<T>(promise: PromiseLike<T>, milliseconds = 7000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error("Le service distant met trop de temps à répondre.")), milliseconds); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

export async function resolveStorageStatus(): Promise<StorageStatus> {
  if (!hasSupabaseEnvironment()) return { mode: "demo", user: null, message: "Données enregistrées sur cet appareil" };
  try {
    // La session est déjà vérifiée par les requêtes RLS lors des lectures et
    // écritures. La relire localement évite un aller-retour réseau de 7 secondes
    // à chaque module et empêche un faux passage en « Démonstration locale ».
    const { data, error } = await withTimeout(createClient().auth.getSession(), 4000);
    const user = data.session?.user || null;
    if (error || !user) return { mode: "demo", user: null, message: "Session cloud absente : mode local conservé" };
    return { mode: "cloud", user, message: "Synchronisation Supabase active" };
  } catch {
    return { mode: "offline", user: null, message: "Connexion indisponible : sauvegarde locale active" };
  }
}

export function readLocal<T>(key: string, fallback: T, legacyKey?: string): T {
  try {
    const current = localStorage.getItem(key);
    if (current) return JSON.parse(current) as T;
    if (legacyKey) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) { localStorage.setItem(key, legacy); return JSON.parse(legacy) as T; }
    }
  } catch {}
  return fallback;
}

export function writeLocal<T>(key: string, value: T, legacyKey?: string) {
  const serialized = JSON.stringify(value);
  localStorage.setItem(key, serialized);
  if (legacyKey) localStorage.setItem(legacyKey, serialized);
  window.dispatchEvent(new CustomEvent("gabon-educ:storage", { detail: { key } }));
}

export function storageModeLabel(mode: StorageMode) {
  if (mode === "cloud") return "Supabase";
  if (mode === "offline") return "Hors ligne temporaire";
  return "Démonstration locale";
}
