"use client";

import { createClient } from "@/lib/supabase/client";
import { readLocal, writeLocal } from "@/lib/storage-mode";

/**
 * Conservation des fiches d'inscription.
 *
 * Deux emplacements, avec des rôles différents :
 *   — Supabase est la référence : c'est là que la fiche survit au changement
 *     de poste, au nettoyage du cache et à la navigation privée ;
 *   — le stockage local n'est plus qu'un cache de secours, qui permet de
 *     continuer à saisir quand le réseau tombe et de ne jamais perdre une
 *     fiche déjà tapée.
 *
 * Rien n'est mis dans la file de synchronisation. Une fiche d'inscription est
 * un document que le secrétariat doit pouvoir retrouver immédiatement : mieux
 * vaut lui dire tout de suite que l'envoi a échoué que de la laisser croire au
 * classement pendant qu'une file invisible accumule les retards.
 */

export type EnrollmentStatus = "draft" | "validated";

export type EnrollmentRecord = {
  id: string;
  schoolId: string;
  academicYearId: string;
  status: EnrollmentStatus;
  linkedStudentId: string;
  createdAt: string;
  updatedAt: string;
  data: Record<string, string>;
};

export const ENROLLMENTS_KEY = "gabon-educ-plus:v1:student-enrollments";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Les identifiants locaux (« local », chaînes libres) ne peuvent pas être
 * écrits dans une colonne uuid : PostgreSQL rejette la ligne entière avec
 * « invalid input syntax for type uuid ». La colonne étant facultative, on
 * préfère écrire la fiche sans la référence plutôt que de perdre la fiche.
 */
function uuidOrNull(value: string) {
  return uuidPattern.test(value) ? value : null;
}

function describe(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return String(
      record.message || record.details || record.hint || JSON.stringify(record),
    );
  }
  return String(error);
}

export function readEnrollmentCache() {
  return readLocal<EnrollmentRecord[]>(ENROLLMENTS_KEY, []);
}

function writeEnrollmentCache(items: EnrollmentRecord[]) {
  writeLocal(ENROLLMENTS_KEY, items);
}

/** Remplace les fiches d'un établissement en laissant celles des autres. */
function replaceSchoolSlice(schoolId: string, items: EnrollmentRecord[]) {
  const others = readEnrollmentCache().filter(
    (item) => item.schoolId !== schoolId,
  );
  writeEnrollmentCache([...items, ...others]);
}

type EnrollmentRow = {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  status: string;
  linked_student_id: string | null;
  data: Record<string, string> | null;
  created_at: string;
  updated_at: string;
};

function fromRow(row: EnrollmentRow): EnrollmentRecord {
  return {
    id: row.id,
    schoolId: row.school_id,
    academicYearId: row.academic_year_id || "",
    status: row.status === "validated" ? "validated" : "draft",
    linkedStudentId: row.linked_student_id || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: row.data || {},
  };
}

function toRow(record: EnrollmentRecord, userId: string | null) {
  return {
    id: record.id,
    school_id: record.schoolId,
    academic_year_id: uuidOrNull(record.academicYearId),
    status: record.status,
    linked_student_id: uuidOrNull(record.linkedStudentId),
    data: record.data,
    saved_by: userId,
    updated_at: record.updatedAt || new Date().toISOString(),
  };
}

async function currentUserId(client: ReturnType<typeof createClient>) {
  const { data } = await client.auth.getUser();
  return data.user?.id || null;
}

export type EnrollmentLoadResult = {
  items: EnrollmentRecord[];
  syncError: string;
  /** Nombre de fiches restées locales qui viennent d'être remontées en base. */
  migrated: number;
};

/**
 * Charge les fiches d'un établissement.
 *
 * Au passage, les fiches qui n'existaient que dans le navigateur sont
 * remontées en base. C'est ce qui rattrape l'existant : le secrétariat n'a
 * rien à ressaisir, il lui suffit d'ouvrir la page depuis le poste où les
 * fiches avaient été tapées.
 */
export async function loadEnrollmentForms(
  schoolId: string,
): Promise<EnrollmentLoadResult> {
  const cached = readEnrollmentCache().filter(
    (item) => item.schoolId === schoolId,
  );
  if (!schoolId || !uuidPattern.test(schoolId)) {
    return {
      items: cached,
      syncError: schoolId
        ? "Établissement sans identifiant cloud : les fiches restent sur ce poste."
        : "",
      migrated: 0,
    };
  }

  const client = createClient();
  const { data, error } = await client
    .from("student_enrollment_forms")
    .select("*")
    .eq("school_id", schoolId)
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      items: cached,
      syncError: `Fiches en ligne indisponibles (${describe(error)}). Affichage de la copie locale.`,
      migrated: 0,
    };
  }

  const remote = ((data || []) as EnrollmentRow[]).map(fromRow);
  const remoteIds = new Set(remote.map((item) => item.id));
  const onlyLocal = cached.filter((item) => !remoteIds.has(item.id));

  let migrated = 0;
  let migrationError = "";
  if (onlyLocal.length) {
    const userId = await currentUserId(client);
    const payload = onlyLocal.map((item) => toRow(item, userId));
    const upsert = await client
      .from("student_enrollment_forms")
      .upsert(payload, { onConflict: "id" });
    if (upsert.error) {
      migrationError = `Fiches encore locales non transférées : ${describe(upsert.error)}`;
    } else {
      migrated = onlyLocal.length;
    }
  }

  // Les fiches locales non transférées restent affichées : les faire
  // disparaître de l'écran parce que le transfert a échoué reviendrait à les
  // perdre aux yeux du secrétariat.
  const merged = [...remote, ...(migrated ? [] : onlyLocal)].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  replaceSchoolSlice(schoolId, merged);
  return { items: merged, syncError: migrationError, migrated };
}

export type EnrollmentWriteResult = { syncError: string };

/**
 * Enregistre une fiche.
 *
 * Le cache local est écrit d'abord, systématiquement : quoi qu'il arrive
 * ensuite au réseau, la saisie n'est pas perdue. L'échec éventuel de
 * l'écriture en base est renvoyé à l'appelant, qui doit l'afficher.
 */
export async function saveEnrollmentForm(
  record: EnrollmentRecord,
): Promise<EnrollmentWriteResult> {
  const cached = readEnrollmentCache().filter(
    (item) => item.schoolId === record.schoolId && item.id !== record.id,
  );
  replaceSchoolSlice(record.schoolId, [record, ...cached]);

  if (!uuidPattern.test(record.schoolId)) {
    return {
      syncError:
        "Fiche enregistrée sur ce poste uniquement : aucun établissement cloud actif.",
    };
  }

  const client = createClient();
  const userId = await currentUserId(client);
  const { error } = await client
    .from("student_enrollment_forms")
    .upsert(toRow(record, userId), { onConflict: "id" });
  if (error) {
    console.error(
      "[Gabon Éduc+] Fiche d’inscription non enregistrée en base :",
      error,
      record.id,
    );
    return {
      syncError: `Fiche conservée sur ce poste, mais non enregistrée en ligne : ${describe(error)}`,
    };
  }
  return { syncError: "" };
}

/** Supprime une fiche localement et en base. */
export async function deleteEnrollmentForm(
  record: EnrollmentRecord,
): Promise<EnrollmentWriteResult> {
  const remaining = readEnrollmentCache().filter(
    (item) => item.schoolId === record.schoolId && item.id !== record.id,
  );
  replaceSchoolSlice(record.schoolId, remaining);

  if (!uuidPattern.test(record.schoolId)) return { syncError: "" };

  const client = createClient();
  const { error } = await client
    .from("student_enrollment_forms")
    .delete()
    .eq("id", record.id)
    .eq("school_id", record.schoolId);
  if (error) {
    console.error(
      "[Gabon Éduc+] Suppression de fiche refusée :",
      error,
      record.id,
    );
    return {
      syncError: `Fiche retirée de cet écran, mais toujours présente en ligne : ${describe(error)}`,
    };
  }
  return { syncError: "" };
}
