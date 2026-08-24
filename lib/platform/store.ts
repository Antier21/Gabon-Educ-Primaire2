"use client";

import { createClient } from "@/lib/supabase/client";
import {
  readLocal,
  resolveStorageStatus,
  STORAGE_KEYS,
  withTimeout,
  writeLocal,
  type StorageMode,
} from "@/lib/storage-mode";
import {
  enqueueBusinessOperation,
  hashSyncValue,
} from "@/lib/sync/business-operation";
import { markModuleOperationsSynced, processQueue } from "@/lib/sync/sync-manager";
import { createSupabaseSyncTransport } from "@/lib/sync/supabase-transport";
import type { SyncOperationMetadata } from "@/lib/sync/types";
import type { PlatformWorkspace } from "./types";
import { readClasses } from "@/lib/class-store";
import { filterLevelsForSchoolType } from "@/lib/school-profiles";
import { PRODUCT, productAllowsSchoolType } from "@/lib/product-edition";
import { resolveActiveSchoolContext } from "@/lib/active-school";

const emptyWorkspace: PlatformWorkspace = {
  school: null,
  users: [],
  academicYears: [],
  periods: [],
  levels: [],
  students: [],
  guardians: [],
  guardianLinks: [],
  subjects: [],
  assignments: [],
  timetable: [],
  attendance: [],
  announcements: [],
  documents: [],
  migrationJournal: [],
  reportWorkflow: [],
  updatedAt: "",
};
export const defaultPlatformWorkspace: PlatformWorkspace = emptyWorkspace;

type Identified = { id: string };
export function createModuleRepository<T extends Identified>(
  key: string,
  fallback: T[] = [],
) {
  return {
    load: () => readLocal<T[]>(key, fallback),
    save: (items: T[]) => {
      writeLocal(key, items);
      return items;
    },
    update: (record: T) => {
      const next = [
        record,
        ...readLocal<T[]>(key, fallback).filter(
          (item) => item.id !== record.id,
        ),
      ];
      writeLocal(key, next);
      return next;
    },
    remove: (id: string) => {
      const next = readLocal<T[]>(key, fallback).filter(
        (item) => item.id !== id,
      );
      writeLocal(key, next);
      return next;
    },
    sync: async () => resolveStorageStatus(),
    retry: async () => resolveStorageStatus(),
  };
}

const usersRepository = createModuleRepository<
  PlatformWorkspace["users"][number]
>(STORAGE_KEYS.schoolUsers);
const studentsRepository = createModuleRepository<
  PlatformWorkspace["students"][number]
>(STORAGE_KEYS.students);
const guardiansRepository = createModuleRepository<
  PlatformWorkspace["guardians"][number]
>(STORAGE_KEYS.guardians);
const timetableRepository = createModuleRepository<
  PlatformWorkspace["timetable"][number]
>(STORAGE_KEYS.timetable);
const attendanceRepository = createModuleRepository<
  PlatformWorkspace["attendance"][number]
>(STORAGE_KEYS.attendance);
const announcementRepository = createModuleRepository<
  PlatformWorkspace["announcements"][number]
>(STORAGE_KEYS.announcements);
const documentRepository = createModuleRepository<
  PlatformWorkspace["documents"][number]
>(STORAGE_KEYS.documents);
export const platformRepositories = {
  users: usersRepository,
  students: studentsRepository,
  guardians: guardiansRepository,
  timetable: timetableRepository,
  attendance: attendanceRepository,
  announcements: announcementRepository,
  documents: documentRepository,
};

function normalizeSchoolType(value: unknown): NonNullable<PlatformWorkspace["school"]>["schoolType"] {
  const type = String(value || "").toLowerCase();
  if (["primaire", "primary"].includes(type)) return "primary";
  if (["complex_school", "complexe", "complexe scolaire"].includes(type)) return "complex_school";
  if (["lycee", "lycée", "high_school", "college", "collège", "middle_school", "secondary", "secondaire"].includes(type)) {
    return PRODUCT.edition === "secondary" ? "complex_school" : (["lycee", "lycée", "high_school"].includes(type) ? "high_school" : "middle_school");
  }
  return PRODUCT.defaultSchoolType;
}

function normalizeSchoolSector(value: unknown): NonNullable<PlatformWorkspace["school"]>["schoolSector"] {
  return String(value || "").toLowerCase() === "public" ? "public" : "private";
}

function normalize(
  input: Partial<PlatformWorkspace> | null | undefined,
): PlatformWorkspace {
  const normalizedSchool = input?.school
    ? {
        ...input.school,
        schoolType: normalizeSchoolType(input.school.schoolType),
        schoolSector: normalizeSchoolSector(input.school.schoolSector),
      }
    : null;
  const school = normalizedSchool && productAllowsSchoolType(normalizedSchool.schoolType)
    ? normalizedSchool
    : null;
  const levels = school
    ? filterLevelsForSchoolType(input?.levels || [], school.schoolType)
    : input?.levels || [];
  return {
    ...emptyWorkspace,
    ...input,
    school,
    users: input?.users || [],
    academicYears: input?.academicYears || [],
    periods: input?.periods || [],
    levels,
    students: input?.students || [],
    guardians: input?.guardians || [],
    guardianLinks: input?.guardianLinks || [],
    subjects: input?.subjects || [],
    assignments: input?.assignments || [],
    timetable: input?.timetable || [],
    attendance: input?.attendance || [],
    announcements: input?.announcements || [],
    documents: input?.documents || [],
    migrationJournal: input?.migrationJournal || [],
    reportWorkflow: input?.reportWorkflow || [],
  };
}

function mergeStudentsFromClasses(workspace: PlatformWorkspace) {
  const activeYear =
    workspace.academicYears.find((item) => item.active)?.id ||
    workspace.academicYears[0]?.id ||
    "";
  const schoolId = workspace.school?.id || "";
  const existing = new Set(workspace.students.map((item) => item.id));
  const additions = readClasses().flatMap((group) =>
    group.students
      .filter((student) => !existing.has(student.id))
      .map((student) => ({
        id: student.id,
        schoolId,
        academicYearId: activeYear,
        classId: group.id,
        registrationNumber: student.registrationNumber || "",
        firstName: student.firstName,
        lastName: student.lastName,
        gender: "" as const,
        dateOfBirth: student.dateOfBirth || "",
        placeOfBirth: "",
        nationality: "Gabonaise",
        photoUrl: "",
        address: "",
        phone: "",
        email: student.email,
        previousSchool: "",
        enrolledOn: "",
        status: "active" as const,
        specialNeeds: "",
        emergencyContact: "",
        administrativeNotes: "Importé depuis Mes classes",
        limitedMedicalNotes: "",
        createdAt: student.updatedAt,
        updatedAt: student.updatedAt,
      })),
  );
  return { ...workspace, students: [...workspace.students, ...additions] };
}

function mapRemoteStudents(rows: Array<Record<string, unknown>>) {
  return rows.map((row) => ({
    id: String(row.id),
    schoolId: String(row.school_id || ""),
    academicYearId: String(row.academic_year_id || ""),
    classId: String(row.class_group_id || ""),
    registrationNumber: String(row.registration_number || ""),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    gender: String(row.gender || "") as "" | "female" | "male",
    dateOfBirth: String(row.date_of_birth || ""),
    placeOfBirth: String(row.place_of_birth || ""),
    nationality: String(row.nationality || "Gabonaise"),
    photoUrl: String(row.photo_url || ""),
    address: String(row.address || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    previousSchool: String(row.previous_school || ""),
    enrolledOn: String(row.enrolled_on || ""),
    status: String(row.status || "active") as "active" | "transferred" | "archived",
    specialNeeds: String(row.special_needs || ""),
    emergencyContact: String(row.emergency_contact || ""),
    administrativeNotes: String(row.administrative_notes || ""),
    limitedMedicalNotes: String(row.limited_medical_notes || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  }));
}

export function readPlatformWorkspace(): PlatformWorkspace {
  return mergeStudentsFromClasses(normalize({
    school: readLocal(STORAGE_KEYS.school, null),
    ...readLocal<Partial<PlatformWorkspace>>(
      STORAGE_KEYS.academicStructure,
      {},
    ),
    users: usersRepository.load(),
    students: studentsRepository.load(),
    ...readLocal<Pick<PlatformWorkspace, "guardians" | "guardianLinks">>(
      STORAGE_KEYS.guardians,
      { guardians: [], guardianLinks: [] },
    ),
    ...readLocal<Pick<PlatformWorkspace, "subjects" | "assignments">>(
      STORAGE_KEYS.subjectAssignments,
      { subjects: [], assignments: [] },
    ),
    timetable: timetableRepository.load(),
    attendance: attendanceRepository.load(),
    announcements: announcementRepository.load(),
    documents: documentRepository.load(),
    migrationJournal: readLocal(STORAGE_KEYS.migrationJournal, []),
  }));
}

function writeWorkspace(workspace: PlatformWorkspace) {
  writeLocal(STORAGE_KEYS.school, workspace.school);
  writeLocal(STORAGE_KEYS.activeSchool, workspace.school?.id || "");
  writeLocal(STORAGE_KEYS.schoolUsers, workspace.users);
  writeLocal(STORAGE_KEYS.academicStructure, {
    academicYears: workspace.academicYears,
    periods: workspace.periods,
    levels: workspace.levels,
    reportWorkflow: workspace.reportWorkflow,
  });
  writeLocal(STORAGE_KEYS.students, workspace.students);
  writeLocal(STORAGE_KEYS.guardians, {
    guardians: workspace.guardians,
    guardianLinks: workspace.guardianLinks,
  });
  writeLocal(STORAGE_KEYS.subjectAssignments, {
    subjects: workspace.subjects,
    assignments: workspace.assignments,
  });
  writeLocal(STORAGE_KEYS.timetable, workspace.timetable);
  writeLocal(STORAGE_KEYS.attendance, workspace.attendance);
  writeLocal(STORAGE_KEYS.announcements, workspace.announcements);
  writeLocal(STORAGE_KEYS.documents, workspace.documents);
  writeLocal(STORAGE_KEYS.migrationJournal, workspace.migrationJournal);
}

export async function loadPlatformWorkspace(): Promise<{
  workspace: PlatformWorkspace;
  mode: StorageMode;
  message: string;
}> {
  const local = readPlatformWorkspace();
  const status = await resolveStorageStatus();
  if (status.mode !== "cloud" || !status.user)
    return { workspace: local, mode: status.mode, message: status.message };
  try {
    const { data, error } = await withTimeout(
      createClient()
        .from("platform_workspaces")
        .select("payload,updated_at,school_id")
        .eq("user_id", status.user.id)
        .maybeSingle(),
    );
    if (error) throw error;
    // Un compte qui ouvre l'application sur un appareil neuf ne possède aucune
    // ligne platform_workspaces : c'est le cas normal d'un enseignant à sa
    // première connexion. Interrompre le chargement ici le privait de ses
    // élèves et de ses affectations, donc de toutes ses classes. On poursuit
    // désormais avec un espace de travail vide, que les lectures distantes
    // ci-dessous viennent remplir.
    const base = normalize(
      data ? (data.payload as Partial<PlatformWorkspace>) : { ...local, school: null },
    );
    const activeSchool = (await resolveActiveSchoolContext()).school;
    const storedSchoolId = readLocal<string>(STORAGE_KEYS.activeSchool, "");
    const localSelectedSchool = local.school?.id === storedSchoolId ? local.school : null;

    // platform_workspaces peut encore contenir le dernier établissement utilisé par ce
    // compte. Si l'utilisateur vient d'en sélectionner/enregistrer un autre, ne jamais
    // greffer les niveaux, matières ou affectations de l'ancien établissement sur le
    // nouveau. On privilégie alors le workspace local correspondant au school_id actif,
    // puis on renormalise toute la structure selon le type réel lu dans Supabase.
    const selectedSource = activeSchool && local.school?.id === activeSchool.id
      ? { ...local, school: activeSchool }
      : activeSchool
        ? { ...base, school: activeSchool }
        : localSelectedSchool
          ? { ...local, school: localSelectedSchool }
          : base;
    const resolvedBase = normalize(selectedSource);
    const schoolId = resolvedBase.school?.id || "";
    const studentResult = schoolId
      ? await withTimeout(
          createClient()
            .from("student_records")
            .select("*")
            .eq("school_id", schoolId)
            .order("last_name", { ascending: true }),
        )
      : { data: [], error: null };
    if (studentResult.error) throw studentResult.error;
    // Annuaire des utilisateurs. Les deux RPC sont réservées à l'administration :
    // un enseignant reçoit légitimement une erreur 400. Ce n'est pas un incident,
    // on garde simplement l'annuaire déjà connu localement.
    type UsersOutcome = { data: unknown[] | null; error: unknown };
    let usersResult: UsersOutcome = { data: null, error: null };
    if (schoolId) {
      usersResult = await withTimeout(
        createClient().rpc("list_school_access_users", { p_school_id: schoolId }),
      ).catch(() => ({ data: null, error: null }));
      if (!usersResult.data || usersResult.error) {
        usersResult = await withTimeout(
          createClient().rpc("list_school_teachers", { p_school_id: schoolId }),
        ).catch(() => ({ data: null, error: null }));
      }
    }
    const directoryUnavailable = Boolean(usersResult.error) || !usersResult.data;
    const acceptedTeachers = ((usersResult.data || []) as Array<Record<string, unknown>>).map(
      (row) => ({
        id: String(row.id),
        schoolId,
        firstName: String(row.first_name || ""),
        lastName: String(row.last_name || ""),
        email: String(row.auth_email || row.email || ""),
        authEmail: String(row.auth_email || row.email || ""),
        accessIdentifier: String(row.access_identifier || ""),
        mustChangePassword: Boolean(row.must_change_password),
        phone: String(row.phone || ""),
        role: (String(row.role) === "parent" ? "guardian" : String(row.role)) as PlatformWorkspace["users"][number]["role"],
        status: String(row.status || "active") as PlatformWorkspace["users"][number]["status"],
        scopeClassIds: (row.scope_class_ids || []) as string[],
        invitationStatus: "accepted" as const,
        invitedAt: "",
        expiresAt: "",
        createdAt: String(row.created_at || ""),
        updatedAt: String(row.updated_at || ""),
      }),
    );
    const staffTeachersResult = schoolId
      ? await withTimeout(
          createClient()
            .from("school_staff")
            .select("pedagogical_user_id,first_name,last_name,phone,email,updated_at")
            .eq("school_id", schoolId)
            .eq("staff_category", "teacher")
            .eq("employment_status", "active")
            .not("pedagogical_user_id", "is", null),
        ).catch(() => ({ data: [], error: null }))
      : { data: [], error: null };

    const staffTeachers = ((staffTeachersResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.pedagogical_user_id || ""),
      schoolId,
      firstName: String(row.first_name || ""),
      lastName: String(row.last_name || ""),
      email: String(row.email || ""),
      authEmail: "",
      accessIdentifier: "",
      mustChangePassword: false,
      phone: String(row.phone || ""),
      role: "teacher" as const,
      status: "active" as const,
      scopeClassIds: [] as string[],
      invitationStatus: "accepted" as const,
      invitedAt: "",
      expiresAt: "",
      createdAt: "",
      updatedAt: String(row.updated_at || ""),
    })).filter((item) => item.id);

    // Affectations pédagogiques distantes. Cette lecture est un complément :
    // si elle échoue ou ne renvoie rien, on conserve strictement les affectations
    // déjà connues localement, sans jamais les effacer.
    const assignmentsResult = schoolId
      ? await withTimeout(
          createClient()
            .from("school_teaching_assignments")
            .select("id,school_id,academic_year_id,class_group_id,school_subject_id,teacher_id,starts_on,ends_on,is_temporary,is_head_teacher,is_active,created_at,updated_at")
            .eq("school_id", schoolId),
        ).catch(() => ({ data: null, error: null }))
      : { data: null, error: null };
    if (assignmentsResult.error)
      console.warn("Affectations pédagogiques indisponibles :", assignmentsResult.error);

    const remoteAssignments = ((assignmentsResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      schoolId: String(row.school_id || ""),
      academicYearId: String(row.academic_year_id || ""),
      classId: String(row.class_group_id || ""),
      subjectId: String(row.school_subject_id || ""),
      teacherId: String(row.teacher_id || ""),
      startsOn: String(row.starts_on || ""),
      endsOn: String(row.ends_on || ""),
      temporary: Boolean(row.is_temporary),
      headTeacher: Boolean(row.is_head_teacher),
      active: Boolean(row.is_active),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    }));

    // Fusion par identifiant : la version distante fait autorité quand elle existe,
    // mais une affectation connue seulement en local n'est jamais perdue.
    const mergedAssignments = Array.from(
      new Map(
        [...resolvedBase.assignments, ...remoteAssignments].map((item) => [item.id, item]),
      ).values(),
    );

    const mergedAcceptedUsers = Array.from(
      new Map([...staffTeachers, ...acceptedTeachers].map((item) => [item.id, item])).values(),
    );
    const pendingInvitations = resolvedBase.users.filter(
      (item) => item.invitationStatus !== "accepted",
    );
    // Annuaire inaccessible (cas normal pour un enseignant) : on ne remplace pas
    // la liste locale par une liste vide.
    const nextUsers =
      directoryUnavailable && !mergedAcceptedUsers.length
        ? resolvedBase.users
        : [...mergedAcceptedUsers, ...pendingInvitations];
    const remote = mergeStudentsFromClasses({
      ...resolvedBase,
      students: mapRemoteStudents((studentResult.data || []) as Array<Record<string, unknown>>),
      users: nextUsers,
      assignments: mergedAssignments,
    });
    writeWorkspace(remote);
    return {
      workspace: remote,
      mode: "cloud",
      message: "Plateforme établissement synchronisée",
    };
  } catch {
    // Un module secondaire indisponible ne doit jamais faire perdre l'identité
    // de l'établissement déjà autorisé pour la session.
    try {
      const context = await resolveActiveSchoolContext();
      const workspace = normalize({ ...local, school: context.school });
      writeWorkspace(workspace);
      return {
        workspace,
        mode: context.mode,
        message: "Établissement connecté · certains modules seront rechargés séparément",
      };
    } catch {
      return {
        workspace: local,
        mode: "offline",
        message: "Mode hors ligne : brouillons préservés",
      };
    }
  }
}

export async function savePlatformWorkspace(
  input: PlatformWorkspace,
  metadata: SyncOperationMetadata | readonly SyncOperationMetadata[],
) {
  const workspace = normalize({
    ...input,
    updatedAt: new Date().toISOString(),
  });
  const current = readPlatformWorkspace();
  const status = await resolveStorageStatus();
  const schoolId = workspace.school?.id || "";
  const subscriptionMessage =
    "Votre établissement est suspendu. Les données restent consultables, mais les créations, modifications et suppressions sont désactivées jusqu’à la régularisation de l’abonnement.";

  // Contrôle central avant toute écriture locale ou mise en file.
  // En mode cloud, Supabase reste la source d’autorité. En mode hors ligne,
  // la dernière licence validée et mise en cache est appliquée.
  if (status.mode === "cloud" && status.user && schoolId && schoolId !== "local") {
    try {
      // Une seule tentative sur un réseau lent suffisait à faire basculer
      // l'écran en lecture seule. On laisse davantage de temps, et on réessaie
      // une fois avant de conclure quoi que ce soit.
      let result = await withTimeout(
        createClient().rpc("school_can_write", { target_school: schoolId }),
        15000,
      ).catch(() => null);
      if (!result || result.error) {
        result = await withTimeout(
          createClient().rpc("school_can_write", { target_school: schoolId }),
          15000,
        ).catch(() => null);
      }
      if (!result || result.error) throw result?.error || new Error("timeout");
      if (result.data !== true) {
        return {
          workspace: current,
          mode: "cloud" as const,
          message: subscriptionMessage,
          blocked: true,
        };
      }
      writeLocal("gabon-educ:subscription-write-cache", {
        schoolId,
        canWrite: true,
        checkedAt: new Date().toISOString(),
      });
    } catch {
      // Un réseau lent n'est pas une suspension d'abonnement. Tant que la
      // dernière licence validée reste valable, l'établissement continue de
      // travailler ; le message le dit clairement au lieu d'annoncer à tort
      // une suspension.
      const cached = readLocal<{ schoolId: string; canWrite: boolean; checkedAt: string } | null>(
        "gabon-educ:subscription-write-cache",
        null,
      );
      const cacheAge = cached?.checkedAt
        ? Date.now() - new Date(cached.checkedAt).getTime()
        : Number.POSITIVE_INFINITY;
      const licenceStillValid =
        cached?.schoolId === schoolId && cached.canWrite && cacheAge <= 30 * 24 * 60 * 60 * 1000;
      if (!licenceStillValid) {
        return {
          workspace: current,
          mode: "cloud" as const,
          message:
            "Connexion trop lente pour vérifier l’abonnement, et aucune licence récente n’est enregistrée sur cet appareil. Reconnectez-vous à Internet avant de saisir des données.",
          blocked: true,
        };
      }
    }
  } else if (schoolId && schoolId !== "local") {
    const cached = readLocal<{
      schoolId: string;
      canWrite: boolean;
      checkedAt: string;
    } | null>("gabon-educ:subscription-write-cache", null);
    const cacheAge = cached?.checkedAt
      ? Date.now() - new Date(cached.checkedAt).getTime()
      : Number.POSITIVE_INFINITY;
    const offlineLicenceValid =
      cached?.schoolId === schoolId && cached.canWrite && cacheAge <= 30 * 24 * 60 * 60 * 1000;
    if (!offlineLicenceValid) {
      return {
        workspace: current,
        mode: status.mode,
        message:
          "Licence hors ligne expirée ou absente. Reconnectez-vous à Internet pour vérifier l’abonnement avant toute modification.",
        blocked: true,
      };
    }
  }

  writeWorkspace(workspace);
  const operations = Array.isArray(metadata) ? metadata : [metadata];
  for (const item of operations) {
    const payload =
      item.module === "settings"
        ? { workspace }
        : item.module === "users" && !item.payload.tokenHash
          ? {
              ...item.payload,
              tokenHash: await hashSyncValue(
                `${item.entityId}:${JSON.stringify(item.payload)}`,
              ),
            }
          : item.payload;
    enqueueBusinessOperation(
      {
        ...item,
        entityId:
          item.module === "settings"
            ? status.user?.id || "pending-user"
            : item.entityId,
        payload,
      },
      {
        schoolId: workspace.school?.id || "local",
        userId: status.user?.id || "local-user",
      },
    );
  }
  if (status.mode !== "cloud" || !status.user) {
    return {
      workspace,
      mode: status.mode,
      message: "Modification locale autorisée par la licence hors ligne.",
      blocked: false,
    };
  }
  try {
    const { error } = await withTimeout(
      createClient()
        .from("platform_workspaces")
        .upsert(
          {
            user_id: status.user.id,
            school_id: workspace.school?.id || null,
            payload: workspace,
          },
          { onConflict: "user_id" },
        ),
    );
    if (error) throw error;
    markModuleOperationsSynced("settings");

    // Les opérations métier (affectations, matières, emplois du temps) étaient
    // seulement mises en file : rien ne la vidait en dehors d'un écran de
    // préproduction. Une affectation d'enseignant n'atteignait donc jamais la
    // table school_teaching_assignments, et l'espace enseignant restait vide.
    const entityIds = new Set(operations.map((item) => item.entityId));
    // Borne volontaire : on transmet l'opération demandée et quelques retards,
    // sans relancer une file entière qui saturerait le navigateur et ferait
    // échouer l'action de l'utilisateur. Le Centre de synchronisation reste là
    // pour vider un arriéré important.
    const queue = await processQueue(createSupabaseSyncTransport(), operations.length + 10);
    const failed = queue.filter(
      (item) => entityIds.has(item.entityId) && ["error", "conflict"].includes(item.status),
    );
    if (failed.length)
      // blocked marque ici « l'opération n'a pas abouti côté serveur ». Sans
      // cela, l'appelant affichait son message de succès prédéfini et l'échec
      // passait inaperçu : l'utilisateur lisait « Affectation retirée » tout en
      // voyant l'affectation rester à l'écran.
      return {
        workspace,
        mode: "cloud" as const,
        message: `Enregistrement incomplet : ${failed[0].lastError || "synchronisation refusée par Supabase."}`,
        blocked: true,
      };
    return {
      workspace,
      mode: "cloud" as const,
      message: "Modification enregistrée et synchronisée",
      blocked: false,
    };
  } catch (error) {
    // Le contrôle d’abonnement a déjà réussi : le brouillon reste conservé,
    // mais l’utilisateur est clairement informé de l’échec de synchronisation.
    return {
      workspace,
      mode: "offline" as const,
      message:
        error instanceof Error
          ? `Synchronisation différée : ${error.message}`
          : "Synchronisation différée ; données locales conservées",
      blocked: false,
    };
  }
}

export async function retryPlatformSync() {
  const workspace = readPlatformWorkspace();
  return savePlatformWorkspace(workspace, {
    module: "settings",
    operation: "update",
    entityId: workspace.school?.id || "local-settings",
    payload: { updatedAt: workspace.updatedAt },
    baseUpdatedAt: workspace.updatedAt || null,
  });
}
