"use client";

import { createClient } from "@/lib/supabase/client";
import { readLocal, resolveStorageStatus, STORAGE_KEYS, withTimeout, writeLocal, type StorageMode } from "@/lib/storage-mode";
import { PRODUCT } from "@/lib/product-edition";
import { getDefaultLevelsForSchoolType, getDefaultSubjectsForSchoolType } from "@/lib/school-profiles";

export type TeacherProfile = {
  firstName: string; lastName: string; email: string; phone: string; city: string;
  schoolName: string; mainSubject: string; mainGrade: string; updatedAt: string;
};

const productLevels = getDefaultLevelsForSchoolType(PRODUCT.defaultSchoolType);
const productSubjects = getDefaultSubjectsForSchoolType(PRODUCT.defaultSchoolType);
export const defaultProfile: TeacherProfile = { firstName: "Enseignant", lastName: PRODUCT.name, email: "", phone: "", city: "", schoolName: "", mainSubject: productSubjects[0] || "Français", mainGrade: productLevels[0] || "", updatedAt: "" };

export function readLocalProfile() {
  const stored = readLocal<Partial<TeacherProfile>>(STORAGE_KEYS.profile, {});
  const demo = readLocal<Partial<TeacherProfile>>("gabon-educ-demo-user", {});
  const profile = { ...defaultProfile, ...demo, ...stored };
  return {
    ...profile,
    mainSubject: productSubjects.includes(profile.mainSubject) ? profile.mainSubject : defaultProfile.mainSubject,
    mainGrade: productLevels.includes(profile.mainGrade) ? profile.mainGrade : defaultProfile.mainGrade,
  };
}

export async function loadProfile(): Promise<{ profile: TeacherProfile; mode: StorageMode; message: string }> {
  const local = readLocalProfile(); const status = await resolveStorageStatus();
  if (status.mode !== "cloud" || !status.user) return { profile: local, mode: status.mode, message: status.message };
  try {
    const { data, error } = await withTimeout(createClient().from("profiles").select("first_name,last_name,phone,city,school_name,main_subject,main_grade,updated_at").eq("id", status.user.id).single());
    if (error) throw error;
    const profile: TeacherProfile = { firstName: data.first_name, lastName: data.last_name, email: status.user.email || "", phone: data.phone || "", city: data.city || "", schoolName: data.school_name || "", mainSubject: productSubjects.includes(data.main_subject) ? data.main_subject : defaultProfile.mainSubject, mainGrade: productLevels.includes(data.main_grade) ? data.main_grade : defaultProfile.mainGrade, updatedAt: data.updated_at || "" };
    writeLocal(STORAGE_KEYS.profile, profile); return { profile, mode: "cloud", message: "Profil synchronisé" };
  } catch { return { profile: local, mode: "offline", message: "Profil local affiché : service distant indisponible" }; }
}

export async function saveProfile(profile: TeacherProfile): Promise<{ profile: TeacherProfile; mode: StorageMode }> {
  const normalized = { ...profile, firstName: profile.firstName.trim(), lastName: profile.lastName.trim(), updatedAt: new Date().toISOString() };
  if (normalized.firstName.length < 2 || normalized.lastName.length < 2) throw new Error("Le prénom et le nom doivent comporter au moins deux caractères.");
  writeLocal(STORAGE_KEYS.profile, normalized);
  const status = await resolveStorageStatus();
  if (status.mode !== "cloud" || !status.user) return { profile: normalized, mode: status.mode };
  const { error } = await withTimeout(createClient().from("profiles").update({ first_name: normalized.firstName, last_name: normalized.lastName, display_name: `${normalized.firstName} ${normalized.lastName}`, phone: normalized.phone || null, city: normalized.city || null, school_name: normalized.schoolName || null, main_subject: normalized.mainSubject || null, main_grade: normalized.mainGrade || null }).eq("id", status.user.id));
  if (error) throw error;
  return { profile: normalized, mode: "cloud" };
}

export async function signOut() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) {
    try { await withTimeout(createClient().auth.signOut(), 5000); } catch {}
  }
  document.cookie = "gabon-educ-demo-session=; path=/; max-age=0; samesite=lax";
}
