"use client";

import { createClient } from "@/lib/supabase/client";
import { SyncConflictError } from "./sync-manager";
import { subscriptionFriendlyMessage } from "@/lib/subscriptions/errors";
import {
  buildSupabaseMutation,
  type SyncActor,
  type TableMutation,
} from "./supabase-mapping";
import type {
  SyncExecutionResult,
  SyncOperation,
  SyncTransport,
} from "./types";

type SupabaseClient = ReturnType<typeof createClient>;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveActor(
  client: SupabaseClient,
  operation: SyncOperation,
): Promise<SyncActor> {
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user)
    throw new Error("Session Supabase absente ou expirée.");
  const userId = authData.user.id;
  let schoolId: string | null = null;

  if (uuidPattern.test(operation.schoolId)) {
    const { data } = await client
      .from("school_memberships")
      .select("school_id")
      .eq("user_id", userId)
      .eq("school_id", operation.schoolId)
      .eq("status", "active")
      .maybeSingle();
    if (data?.school_id) schoolId = String(data.school_id);
  }
  if (!schoolId) {
    const { data } = await client
      .from("platform_workspaces")
      .select("school_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data?.school_id) schoolId = String(data.school_id);
  }
  if (!schoolId) {
    const { data } = await client
      .from("school_memberships")
      .select("school_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (data?.school_id) schoolId = String(data.school_id);
  }
  return { userId, schoolId };
}

async function resolveGradeLevel(
  client: SupabaseClient,
  operation: SyncOperation,
  mutation: TableMutation,
) {
  if (mutation.table !== "class_groups") return;
  const item = operation.payload.class;
  const level =
    item && typeof item === "object" && !Array.isArray(item)
      ? String((item as Record<string, unknown>).level || "")
      : "";
  if (!mutation.row.grade_level_id) {
    if (!level) throw new Error("Niveau de classe absent de la file locale.");
    const schoolId = String(mutation.row.school_id || "");
    if (!schoolId) throw new Error("Établissement absent lors de la résolution du niveau.");
    // grade_levels est une table de référence GLOBALE : elle ne possède pas de
    // colonne school_id. Filtrer dessus provoquait une erreur PostgREST
    // (« column grade_levels.school_id does not exist ») qui faisait échouer
    // silencieusement toute création de classe.
    let result = await client
      .from("grade_levels")
      .select("id")
      .eq("code", level)
      .maybeSingle();
    if (!result.data)
      result = await client
        .from("grade_levels")
        .select("id")
        .ilike("name", level)
        .maybeSingle();
    if (result.error || !result.data?.id)
      throw new Error(`Niveau Supabase introuvable : ${level}.`);
    mutation.row.grade_level_id = result.data.id;
  }

  const schoolId = String(mutation.row.school_id || "");
  const classRecord = operation.payload.class as
    | Record<string, unknown>
    | undefined;
  const yearLabel = String(classRecord?.academicYear || "");
  if (!schoolId || !yearLabel)
    throw new Error("Établissement ou année scolaire absent de la classe.");
  const year = await client
    .from("academic_years")
    .select("id")
    .eq("school_id", schoolId)
    .eq("label", yearLabel)
    .maybeSingle();
  if (year.error || !year.data?.id)
    throw new Error(`Année scolaire Supabase introuvable : ${yearLabel}.`);
  mutation.row.academic_year_id = year.data.id;
}

async function resolveAssignmentReferences(
  client: SupabaseClient,
  mutation: TableMutation,
) {
  if (mutation.table !== "school_teaching_assignments") return;
  const classId = String(mutation.row.class_group_id || "");
  const teacherId = String(mutation.row.teacher_id || "");
  if (!uuidPattern.test(classId))
    throw new Error("La classe sélectionnée ne possède pas d’identifiant cloud valide.");
  if (!uuidPattern.test(teacherId))
    throw new Error("L’enseignant sélectionné n’a pas encore activé son compte.");
  const schoolId = String(mutation.row.school_id || "");
  const classResult = await client
    .from("class_groups")
    .select("academic_year_id,school_id")
    .eq("id", classId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (classResult.error || !classResult.data?.academic_year_id)
    throw new Error("Aucune année scolaire cloud n’est rattachée à cette classe.");
  mutation.row.academic_year_id = classResult.data.academic_year_id;

  const membership = await client
    .from("school_memberships")
    .select("user_id")
    .eq("school_id", schoolId)
    .eq("user_id", teacherId)
    .eq("status", "active")
    .eq("invitation_status", "accepted")
    .in("role", ["teacher", "head_teacher"])
    .maybeSingle();
  if (membership.error || !membership.data?.user_id)
    throw new Error("Cet enseignant n’a pas encore accepté son invitation.");
}

async function resolveLessonReferences(
  client: SupabaseClient,
  operation: SyncOperation,
  mutation: TableMutation,
) {
  if (mutation.table !== "lesson_plans" || operation.type === "delete") return;
  const value = operation.payload.lesson;
  const item =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!item) throw new Error("Fiche pédagogique absente de la file locale.");
  const subject = String(item.subject || "");
  const grade = String(item.grade || "");
  if (!subject || !grade)
    throw new Error("Matière ou niveau absent de la fiche pédagogique.");

  const subjectResult = await client
    .from("subjects")
    .select("id")
    .ilike("name", subject)
    .limit(1)
    .maybeSingle();
  if (subjectResult.error || !subjectResult.data?.id)
    throw new Error(`Matière Supabase introuvable : ${subject}.`);

  let gradeResult = await client
    .from("grade_levels")
    .select("id")
    .eq("code", grade)
    .maybeSingle();
  if (!gradeResult.data)
    gradeResult = await client
      .from("grade_levels")
      .select("id")
      .ilike("name", grade)
      .maybeSingle();
  if (gradeResult.error || !gradeResult.data?.id)
    throw new Error(`Niveau Supabase introuvable : ${grade}.`);

  mutation.row.subject_id = subjectResult.data.id;
  mutation.row.grade_level_id = gradeResult.data.id;

  const classGroup = String(item.classGroup || "").trim();
  if (!classGroup)
    throw new Error("Classe absente de la fiche pédagogique.");
  let classQuery = client
    .from("class_groups")
    .select("id,school_id")
    .eq("school_id", mutation.row.school_id);
  classQuery = uuidPattern.test(classGroup)
    ? classQuery.eq("id", classGroup)
    : classQuery.eq("name", classGroup);
  const classResult = await classQuery.limit(1).maybeSingle();
  if (classResult.error || !classResult.data?.id)
    throw new Error(`Classe Supabase introuvable : ${classGroup}.`);
  mutation.row.class_group_id = classResult.data.id;
}

async function executeTableMutation(
  client: SupabaseClient,
  operation: SyncOperation,
  mutation: TableMutation,
  checkConflict: boolean,
): Promise<Record<string, unknown> | null> {
  if (checkConflict) {
    const { data: remote, error: readError } = await client
      .from(mutation.table)
      .select("*")
      .eq(mutation.key, mutation.entityId)
      .maybeSingle();
    if (readError)
      throw new Error(`Lecture cloud impossible : ${readError.message}`);
    const remoteRecord = remote as Record<string, unknown> | null;
    const remoteUpdatedAt =
      typeof remoteRecord?.updated_at === "string"
        ? remoteRecord.updated_at
        : null;
    if (
      remoteRecord &&
      operation.baseUpdatedAt &&
      remoteUpdatedAt &&
      remoteUpdatedAt > operation.baseUpdatedAt
    )
      throw new SyncConflictError(
        "La version cloud a également été modifiée.",
        remoteRecord,
        remoteUpdatedAt,
      );
  }

  if (operation.type === "delete") {
    const { error } = await client
      .from(mutation.table)
      .delete()
      .eq(mutation.key, mutation.entityId);
    if (error)
      throw new Error(subscriptionFriendlyMessage(error));
    return null;
  }
  const { data, error } = await client
    .from(mutation.table)
    .upsert(mutation.row, { onConflict: mutation.conflictTarget || mutation.key })
    .select()
    .single();
  if (error) {
    // Journalise la table et les colonnes réellement transmises : sans cela,
    // un message comme « invalid input syntax for type uuid » ne dit pas quelle
    // colonne pose problème, et le diagnostic devient impossible.
    console.error(
      `[Gabon Éduc+] Écriture refusée sur ${mutation.table} :`,
      error,
      mutation.row,
    );
    throw new Error(subscriptionFriendlyMessage(error));
  }
  return data as Record<string, unknown>;
}

export function createSupabaseSyncTransport(
  clientOverride?: SupabaseClient,
): SyncTransport {
  return {
    async execute(operation: SyncOperation): Promise<SyncExecutionResult> {
      const client = clientOverride || createClient();
      const actor = await resolveActor(client, operation);
      const mutation = buildSupabaseMutation(operation, actor);

      if (mutation.kind === "rpc") {
        const { data, error } = await client.rpc(
          mutation.functionName,
          mutation.parameters,
        );
        if (error)
          throw new Error(subscriptionFriendlyMessage(error));
        return {
          remotePayload: data === null ? null : { result: data },
          remoteUpdatedAt: new Date().toISOString(),
        };
      }

      await resolveGradeLevel(client, operation, mutation);
      await resolveLessonReferences(client, operation, mutation);
      await resolveAssignmentReferences(client, mutation);
      const saved = await executeTableMutation(
        client,
        operation,
        mutation,
        operation.module !== "grading" && operation.module !== "settings",
      );
      for (const related of mutation.related || [])
        await executeTableMutation(client, operation, related, false);
      return {
        remotePayload: saved,
        remoteUpdatedAt:
          typeof saved?.updated_at === "string"
            ? saved.updated_at
            : new Date().toISOString(),
      };
    },
  };
}
