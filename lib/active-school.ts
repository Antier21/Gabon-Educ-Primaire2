"use client";

import { createClient } from "@/lib/supabase/client";
import { PRODUCT, productAllowsSchoolType } from "@/lib/product-edition";
import { normalizeSchoolSector, normalizeSchoolType } from "@/lib/school-profiles";
import {
  hasSupabaseEnvironment,
  readLocal,
  STORAGE_KEYS,
  withTimeout,
  writeLocal,
  type StorageMode,
} from "@/lib/storage-mode";
import type { SchoolProfile } from "@/lib/platform/types";

const ACTIVE_SCHOOL_USER_KEY = "gabon-educ-plus:v1:active-school-user";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ActiveSchoolContext = {
  school: SchoolProfile;
  userId: string;
  mode: StorageMode;
};

function schoolProfileFromRow(row: Record<string, unknown>): SchoolProfile {
  const now = new Date().toISOString();
  return {
    id: String(row.id || ""),
    name: String(row.name || "Établissement"),
    acronym: String(row.slug || ""),
    schoolType: normalizeSchoolType(String(row.school_type || PRODUCT.defaultSchoolType)),
    schoolSector: normalizeSchoolSector(String(row.school_sector || "private")),
    registrationNumber: String(row.registration_number || ""),
    province: String(row.province || ""),
    city: String(row.city || ""),
    district: String(row.district || ""),
    neighborhood: "",
    address: String(row.address || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    website: "",
    logoUrl: String(row.logo_url || ""),
    stampUrl: "",
    headName: "",
    motto: "",
    activeAcademicYearId: "",
    periodSystem: "trimester",
    maxScore: PRODUCT.maxScore,
    passThreshold: PRODUCT.passThreshold,
    bulletinModel: PRODUCT.bulletinTemplate,
    timezone: "Africa/Libreville",
    language: "fr",
    isActive: row.is_active !== false,
    createdAt: String(row.created_at || now),
    updatedAt: String(row.updated_at || now),
  };
}

export function readCachedActiveSchool(): SchoolProfile | null {
  const school = readLocal<SchoolProfile | null>(STORAGE_KEYS.school, null);
  if (!school?.id || !productAllowsSchoolType(school.schoolType)) return null;
  return school;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

/** Résout la session et son établissement sans charger les autres modules. */
export async function resolveActiveSchoolContext(): Promise<ActiveSchoolContext> {
  const cachedSchool = readCachedActiveSchool();
  if (!hasSupabaseEnvironment()) {
    if (!cachedSchool) throw new Error("Aucun établissement actif n’est enregistré sur cet appareil.");
    return { school: cachedSchool, userId: "local-user", mode: "demo" };
  }

  const client = createClient();
  const { data: sessionData, error: sessionError } = await withTimeout(client.auth.getSession(), 4000);
  const user = sessionData.session?.user;
  if (sessionError || !user) {
    throw new Error("Session Supabase absente ou expirée. Reconnectez-vous à l’espace Administration.");
  }

  const previousUserId = readLocal<string>(ACTIVE_SCHOOL_USER_KEY, "");
  if (previousUserId && previousUserId !== user.id) {
    localStorage.removeItem(STORAGE_KEYS.activeSchool);
    localStorage.removeItem(STORAGE_KEYS.school);
  }

  // Cette RPC SECURITY DEFINER ne renvoie que les établissements auxquels
  // auth.uid() appartient. Elle évite qu'une politique RLS ancienne ou
  // récursive sur school_memberships empêche l'ouverture de l'espace.
  const rpcResult = await withTimeout(client.rpc("get_my_active_schools"));
  if (!rpcResult.error && Array.isArray(rpcResult.data)) {
    const rpcSchools = (rpcResult.data as Array<Record<string, unknown>>)
      .map(schoolProfileFromRow)
      .filter((school) => school.id && school.isActive && productAllowsSchoolType(school.schoolType));
    if (rpcSchools.length) {
      const storedSchoolId = previousUserId === user.id
        ? readLocal<string>(STORAGE_KEYS.activeSchool, "")
        : "";
      const school = rpcSchools.find((item) => item.id === storedSchoolId) || rpcSchools[0];
      writeLocal(ACTIVE_SCHOOL_USER_KEY, user.id);
      writeLocal(STORAGE_KEYS.activeSchool, school.id);
      writeLocal(STORAGE_KEYS.school, school);
      return { school, userId: user.id, mode: "cloud" };
    }
  }

  // Compatibilité avec une base qui n'a pas encore reçu la migration 061.
  const memberships = await withTimeout(
    client.from("school_memberships").select("school_id").eq("user_id", user.id).eq("status", "active"),
  );
  if (memberships.error) {
    throw new Error(errorMessage(
      rpcResult.error || memberships.error,
      "Impossible de lire les établissements associés à cette session.",
    ));
  }

  const schoolIds = Array.from(new Set((memberships.data || [])
    .map((row) => String(row.school_id || ""))
    .filter((value) => uuidPattern.test(value))));
  if (!schoolIds.length) {
    throw new Error(errorMessage(rpcResult.error, "Aucun établissement actif n’est associé à ce compte."));
  }

  // Si le profil déjà validé appartient toujours à la session, il peut être
  // utilisé immédiatement sans seconde requête. Cela accélère aussi A/B.
  const storedSchoolId = previousUserId === user.id
    ? readLocal<string>(STORAGE_KEYS.activeSchool, "")
    : "";
  if (cachedSchool && schoolIds.includes(cachedSchool.id) && productAllowsSchoolType(cachedSchool.schoolType)) {
    writeLocal(ACTIVE_SCHOOL_USER_KEY, user.id);
    writeLocal(STORAGE_KEYS.activeSchool, cachedSchool.id);
    return { school: cachedSchool, userId: user.id, mode: "cloud" };
  }

  const schoolsResult = await withTimeout(
    client
      .from("schools")
      .select("id,name,slug,school_type,school_sector,registration_number,province,city,district,address,phone,email,logo_url,is_active,created_at,updated_at")
      .in("id", schoolIds),
  );
  if (schoolsResult.error) {
    throw new Error(errorMessage(schoolsResult.error, "Impossible de charger le profil de l’établissement."));
  }

  const schools = ((schoolsResult.data || []) as Array<Record<string, unknown>>)
    .map(schoolProfileFromRow)
    .filter((school) => school.isActive && productAllowsSchoolType(school.schoolType));
  if (!schools.length) {
    throw new Error(`Ce compte ne possède aucun établissement actif compatible avec ${PRODUCT.name}.`);
  }

  const school = schools.find((item) => item.id === storedSchoolId) || schools[0];

  writeLocal(ACTIVE_SCHOOL_USER_KEY, user.id);
  writeLocal(STORAGE_KEYS.activeSchool, school.id);
  writeLocal(STORAGE_KEYS.school, school);
  return { school, userId: user.id, mode: "cloud" };
}
