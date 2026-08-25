"use client";

import { createClient } from "@/lib/supabase/client";
import { SyncConflictError } from "./sync-manager";
import { subscriptionFriendlyMessage } from "@/lib/subscriptions/errors";
import { readPlatformWorkspace } from "@/lib/platform/store";
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

/**
 * Les niveaux d'établissement ne sont pas encore synchronisés : ils n'existent
 * que dans l'espace de travail local. Une matière référençant un niveau absent
 * de school_levels était rejetée par la clé étrangère, ce qui bloquait ensuite
 * les affectations. La colonne étant facultative, on préfère écrire la matière
 * sans son niveau plutôt que de la perdre.
 */
async function resolveSubjectLevel(
  client: SupabaseClient,
  mutation: TableMutation,
) {
  if (mutation.table !== "school_subjects") return;
  const levelId = String(mutation.row.school_level_id || "");
  if (!levelId) return;
  const schoolId = String(mutation.row.school_id || "");
  const existing = await client
    .from("school_levels")
    .select("id")
    .eq("id", levelId)
    .eq("school_id", schoolId)
    .maybeSingle();
  if (existing.error || !existing.data?.id) mutation.row.school_level_id = null;
}

/**
 * Rattache l'affectation à une matière qui existe réellement en base.
 *
 * L'affectation désigne sa matière par un identifiant local. Trois situations
 * le rendaient invalide, et toutes trois se soldaient par le même refus —
 * « violates foreign key constraint … school_subject_id » :
 *
 *   — la matière venait d'être créée dans la même fournée, et son écriture
 *     n'était pas encore passée quand l'affectation partait ;
 *   — la matière existait dans l'espace de travail local depuis longtemps,
 *     mais son écriture avait échoué autrefois sans que personne la reprenne ;
 *   — la matière existait en base sous un autre identifiant : les matières
 *     sont dédoublonnées sur le couple (établissement, code), si bien qu'une
 *     matière recréée localement porte un identifiant que la base ignore.
 *
 * On résout donc par identifiant, puis par code, puis par libellé, et l'on
 * crée la matière en dernier recours. L'affectation part ensuite avec
 * l'identifiant réellement présent en base.
 */
async function resolveAssignmentSubject(
  client: SupabaseClient,
  operation: SyncOperation,
  mutation: TableMutation,
) {
  const schoolId = String(mutation.row.school_id || "");
  const subjectId = String(mutation.row.school_subject_id || "");
  if (!schoolId) return;

  if (uuidPattern.test(subjectId)) {
    const found = await client
      .from("school_subjects")
      .select("id")
      .eq("id", subjectId)
      .eq("school_id", schoolId)
      .maybeSingle();
    if (found.data?.id) return;
  }

  const value = operation.payload.subject;
  let subject =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  // Repli sur l'espace de travail local. Les affectations mises en file avant
  // que la matière ne voyage avec elles n'en portent pas la description : sans
  // ce repli, l'arriéré déjà constitué resterait bloqué à jamais et il
  // faudrait ressaisir chaque affectation à la main.
  if (!subject && uuidPattern.test(subjectId)) {
    const local = readPlatformWorkspace().subjects.find((item) => item.id === subjectId);
    if (local) subject = local as unknown as Record<string, unknown>;
  }

  const code = String(subject?.code || "").trim();
  const label = String(subject?.label || "").trim();

  if (code) {
    const byCode = await client
      .from("school_subjects")
      .select("id")
      .eq("school_id", schoolId)
      .eq("code", code)
      .maybeSingle();
    if (byCode.data?.id) {
      mutation.row.school_subject_id = byCode.data.id;
      return;
    }
  }
  if (label) {
    const byLabel = await client
      .from("school_subjects")
      .select("id")
      .eq("school_id", schoolId)
      .ilike("label", label)
      .limit(1)
      .maybeSingle();
    if (byLabel.data?.id) {
      mutation.row.school_subject_id = byLabel.data.id;
      return;
    }
  }

  if (!code || !label)
    throw new Error(
      "La matière de cette affectation n’existe pas encore dans l’établissement. Enregistrez-la depuis « Matières », puis relancez l’affectation.",
    );

  const created = await client
    .from("school_subjects")
    .insert({
      school_id: schoolId,
      code,
      label,
      color: subject?.color || null,
      icon: subject?.icon || null,
      coefficient: Number(subject?.coefficient ?? 1) || 1,
      weekly_hours: Number(subject?.weeklyHours ?? 0) || 0,
      category: subject?.category || null,
      bulletin_order: Number(subject?.bulletinOrder ?? 0) || 0,
      is_active: true,
    })
    .select("id")
    .single();
  if (created.error || !created.data?.id)
    throw new Error(
      `Matière « ${label} » impossible à enregistrer : ${subscriptionFriendlyMessage(created.error)}`,
    );
  mutation.row.school_subject_id = created.data.id;
}

async function resolveAssignmentReferences(
  client: SupabaseClient,
  operation: SyncOperation,
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

  await resolveAssignmentSubject(client, operation, mutation);
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

      // Les résolveurs complètent les références d'une ligne à écrire : niveau,
      // année scolaire, matière, enseignant. Une suppression n'a besoin que de
      // l'identifiant, et sa charge utile est vide — les faire tourner ici
      // revenait à exiger des champs absents, puis à lever « La classe
      // sélectionnée ne possède pas d'identifiant cloud valide ». Aucune
      // suppression d'affectation ou de classe ne pouvait donc aboutir.
      if (operation.type !== "delete") {
        await resolveGradeLevel(client, operation, mutation);
        await resolveLessonReferences(client, operation, mutation);
        await resolveSubjectLevel(client, mutation);
        await resolveAssignmentReferences(client, operation, mutation);
      }
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
