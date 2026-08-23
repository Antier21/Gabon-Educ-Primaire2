import type { SyncEntityPayload, SyncOperation } from "./types";

export type SyncActor = { userId: string; schoolId: string | null };
export type TableMutation = {
  kind: "table";
  table: string;
  key: string;
  entityId: string;
  row: Record<string, unknown>;
  related?: TableMutation[];
  /**
   * Colonnes servant à détecter un conflit lors de l'écriture, quand la clé
   * naturelle diffère de la clé primaire. Sans cela, une entité recréée
   * localement avec un nouvel identifiant heurte la contrainte d'unicité
   * métier au lieu de mettre à jour la ligne existante.
   */
  conflictTarget?: string;
};
export type RpcMutation = {
  kind: "rpc";
  functionName: string;
  parameters: Record<string, unknown>;
};
export type SupabaseMutation = TableMutation | RpcMutation;

const record = (payload: SyncEntityPayload, key: string) => {
  const value = payload[key];
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`Charge utile ${key} absente ou invalide.`);
  return value as Record<string, unknown>;
};
const requiredSchool = (actor: SyncActor, module: string) => {
  if (!actor.schoolId)
    throw new Error(
      `Établissement connecté introuvable pour le module ${module}.`,
    );
  return actor.schoolId;
};
const nullable = (value: unknown) => (value === "" ? null : (value ?? null));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Colonnes uuid : les identifiants de repli locaux (« local », « local-user »,
 * « pending-user »…) ne sont pas des uuid. Les transmettre tels quels provoquait
 * « invalid input syntax for type uuid » et bloquait toute la synchronisation.
 * Une référence locale non résolue devient null plutôt qu'une valeur invalide.
 */
const uuidOrNull = (value: unknown) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return UUID_PATTERN.test(raw) ? raw : null;
};

/** Transforme un payload métier en colonnes strictement prévues par les migrations 001–030. */
export function buildSupabaseMutation(
  operation: SyncOperation,
  actor: SyncActor,
): SupabaseMutation {
  if (operation.type === "delete") {
    const tableByModule = {
      classes: "class_groups",
      students: operation.payload.classId
        ? "class_students"
        : "student_records",
      guardians: "guardians",
      announcements: "school_announcements",
      evaluations: "teacher_evaluations",
      attendance: "attendance_records",
      timetables: "timetable_slots",
      documents: "school_documents",
      lessons: "lesson_plans",
      users: "school_invitations",
      subjects: "school_subjects",
      assignments: "school_teaching_assignments",
      grading: "grading_workspaces",
      settings: "platform_workspaces",
    } as const;
    const table = tableByModule[operation.module];
    const actorKey = operation.module === "grading" ? "teacher_id" : "user_id";
    const related =
      operation.module === "students" && operation.payload.classId
        ? [
            {
              kind: "table" as const,
              table: "student_records",
              key: "id",
              entityId: operation.entityId,
              row: {},
            },
          ]
        : undefined;
    return {
      kind: "table",
      table,
      key:
        operation.module === "grading" || operation.module === "settings"
          ? actorKey
          : "id",
      entityId:
        operation.module === "grading" || operation.module === "settings"
          ? actor.userId
          : operation.entityId,
      row: {},
      related,
    };
  }
  if (operation.module === "classes") {
    const item = record(operation.payload, "class");
    return {
      kind: "table",
      table: "class_groups",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        owner_teacher_id: actor.userId,
        grade_level_id: uuidOrNull(item.gradeLevelId),
        name: item.name,
        room: nullable(item.room),
        academic_year_label: item.academicYear,
        main_subject: nullable(item.mainSubject),
      },
    };
  }
  if (operation.module === "students") {
    const item = record(operation.payload, "student");
    if ("academicYearId" in item || "schoolId" in item) {
      const classId = uuidOrNull(item.classId);
      return {
        kind: "table",
        table: "student_records",
        key: "id",
        entityId: operation.entityId,
        row: {
          id: operation.entityId,
          school_id: requiredSchool(actor, operation.module),
          academic_year_id: uuidOrNull(item.academicYearId),
          class_group_id: classId,
          registration_number: nullable(item.registrationNumber),
          first_name: item.firstName,
          last_name: item.lastName,
          gender: nullable(item.gender),
          date_of_birth: nullable(item.dateOfBirth),
          place_of_birth: nullable(item.placeOfBirth),
          nationality: nullable(item.nationality),
          photo_url: nullable(item.photoUrl),
          address: nullable(item.address),
          phone: nullable(item.phone),
          email: nullable(item.email),
          previous_school: nullable(item.previousSchool),
          enrolled_on: nullable(item.enrolledOn),
          status: item.status || "active",
          special_needs: nullable(item.specialNeeds),
          emergency_contact: nullable(item.emergencyContact),
          administrative_notes: nullable(item.administrativeNotes),
          limited_medical_notes: nullable(item.limitedMedicalNotes),
          created_by: actor.userId,
        },
        related: classId
          ? [{
              kind: "table" as const,
              table: "class_students",
              key: "id",
              entityId: operation.entityId,
              row: {
                id: operation.entityId,
                class_group_id: classId,
                first_name: item.firstName,
                last_name: item.lastName,
                email: nullable(item.email),
                registration_number: nullable(item.registrationNumber),
                date_of_birth: nullable(item.dateOfBirth),
              },
            }]
          : undefined,
      };
    }
    return {
      kind: "table",
      table: "class_students",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        class_group_id: operation.payload.classId,
        first_name: item.firstName,
        last_name: item.lastName,
        email: nullable(item.email),
        registration_number: nullable(item.registrationNumber),
        date_of_birth: nullable(item.dateOfBirth),
      },
      related: [
        {
          kind: "table",
          table: "student_records",
          key: "id",
          entityId: operation.entityId,
          row: {
            id: operation.entityId,
            school_id: requiredSchool(actor, operation.module),
            class_student_id: operation.entityId,
            academic_year_id: null,
            class_group_id: operation.payload.classId,
            registration_number: nullable(item.registrationNumber),
            first_name: item.firstName,
            last_name: item.lastName,
            date_of_birth: nullable(item.dateOfBirth),
            email: nullable(item.email),
            status: "active",
            created_by: actor.userId,
          },
        },
      ],
    };
  }
  if (operation.module === "guardians") {
    const item = record(operation.payload, "guardian");
    const linkValue = operation.payload.link;
    const related: TableMutation[] = [];
    if (
      linkValue &&
      typeof linkValue === "object" &&
      !Array.isArray(linkValue)
    ) {
      const link = linkValue as Record<string, unknown>;
      related.push({
        kind: "table",
        table: "guardian_student_links",
        key: "id",
        entityId: String(link.id),
        row: {
          id: link.id,
          school_id: requiredSchool(actor, operation.module),
          guardian_id: operation.entityId,
          student_id: link.studentId,
          relationship: link.relationship,
          is_primary: Boolean(link.primary),
          created_by: actor.userId,
        },
      });
    }
    return {
      kind: "table",
      table: "guardians",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        first_name: item.firstName,
        last_name: item.lastName,
        phone: item.phone,
        email: nullable(item.email),
        address: nullable(item.address),
        contact_allowed: Boolean(item.contactAllowed),
        status: item.status || "active",
        created_by: actor.userId,
      },
      related,
    };
  }
  if (operation.module === "announcements") {
    const item = record(operation.payload, "announcement");
    return {
      kind: "table",
      table: "school_announcements",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        title: item.title,
        content: item.content,
        audience: item.audience,
        target_id: nullable(item.targetId),
        attachment_name: nullable(item.attachmentName),
        publishes_at: nullable(item.publishesAt),
        expires_at: nullable(item.expiresAt),
        publication_status: item.status || "draft",
        created_by: actor.userId,
      },
    };
  }
  if (operation.module === "evaluations") {
    const item = record(operation.payload, "evaluation");
    return {
      kind: "table",
      table: "teacher_evaluations",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        teacher_id: actor.userId,
        class_group_id: uuidOrNull(item.classId),
        title: item.title,
        subject: item.subject,
        grade: item.grade,
        evaluation_date: item.date,
        status: item.status || "draft",
        payload: item,
      },
    };
  }
  if (operation.module === "attendance") {
    const item = record(operation.payload, "entry");
    return {
      kind: "table",
      table: "attendance_records",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        academic_year_id: uuidOrNull(item.academicYearId),
        school_period_id: uuidOrNull(item.periodId),
        class_group_id: uuidOrNull(item.classId),
        student_id: item.studentId,
        timetable_slot_id: nullable(item.timetableSlotId),
        attendance_kind: item.kind,
        attendance_date: item.date,
        duration_minutes: item.durationMinutes || 0,
        reason: nullable(item.reason),
        proof_name: nullable(item.proofName),
        is_justified: Boolean(item.justified),
        recorded_by: actor.userId,
      },
    };
  }
  if (operation.module === "timetables") {
    const item = record(operation.payload, "slot");
    return {
      kind: "table",
      table: "timetable_slots",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        academic_year_id: item.academicYearId,
        class_group_id: item.classId,
        school_subject_id: item.subjectId,
        teacher_id: uuidOrNull(item.teacherId),
        room: nullable(item.room),
        weekday: item.weekday,
        starts_at: item.startsAt,
        ends_at: item.endsAt,
        week_label: nullable(item.weekLabel),
        created_by: actor.userId,
      },
    };
  }
  if (operation.module === "documents") {
    const item = record(operation.payload, "document");
    return {
      kind: "table",
      table: "school_documents",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        document_kind: item.kind,
        title: item.title,
        student_id: uuidOrNull(item.studentId),
        class_group_id: uuidOrNull(item.classId),
        payload: item.payload || {},
        document_status: item.status || "generated",
        created_by: actor.userId,
      },
    };
  }
  if (operation.module === "lessons") {
    const item = record(operation.payload, "lesson");
    return {
      kind: "table",
      table: "lesson_plans",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        teacher_id: actor.userId,
        school_id: requiredSchool(actor, operation.module),
        class_group_id: null,
        subject_id: null,
        grade_level_id: null,
        title: item.title,
        week_number: item.week || 1,
        duration_minutes: item.duration || 55,
        prerequisite: nullable(item.prerequisite),
        situation_problem: nullable(item.situationProblem),
        lesson_summary: nullable(item.summary),
        differentiation: nullable(item.differentiation),
        homework: nullable(item.homework),
        status: item.status || "draft",
        payload: item,
      },
    };
  }
  if (operation.module === "grading") {
    const workspace = record(operation.payload, "workspace");
    return {
      kind: "rpc",
      functionName: "save_grading_workspace_relational",
      parameters: { p_payload: workspace },
    };
  }
  if (operation.module === "users") {
    const item = record(operation.payload, "user");
    return {
      kind: "table",
      table: "school_invitations",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        email: item.email,
        role: item.role === "guardian" ? "parent" : item.role,
        scope_class_ids: item.scopeClassIds || [],
        token_hash: operation.payload.tokenHash,
        status:
          item.status === "suspended"
            ? "revoked"
            : item.invitationStatus || "pending",
        expires_at: item.expiresAt,
        invited_by: actor.userId,
      },
    };
  }
  if (operation.module === "subjects") {
    const item = record(operation.payload, "subject");
    const coefficient = Number(item.coefficient ?? 1);
    if (!Number.isFinite(coefficient) || coefficient <= 0)
      throw new Error("Le coefficient doit être strictement positif.");
    return {
      kind: "table",
      table: "school_subjects",
      key: "id",
      // Une matière est identifiée métier par (établissement, code) : c'est la
      // contrainte school_subjects_school_id_code_key. Résoudre le conflit sur
      // ce couple met à jour la matière existante au lieu de la dupliquer.
      conflictTarget: "school_id,code",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        school_level_id: uuidOrNull(item.levelId),
        code: item.code,
        label: item.label,
        color: nullable(item.color),
        icon: nullable(item.icon),
        coefficient,
        weekly_hours: item.weeklyHours || 0,
        category: nullable(item.category),
        bulletin_order: item.bulletinOrder || 0,
        is_active: item.active !== false,
        created_by: actor.userId,
      },
    };
  }
  if (operation.module === "assignments") {
    const item = record(operation.payload, "assignment");
    return {
      kind: "table",
      table: "school_teaching_assignments",
      key: "id",
      entityId: operation.entityId,
      row: {
        id: operation.entityId,
        school_id: requiredSchool(actor, operation.module),
        academic_year_id: item.academicYearId,
        class_group_id: item.classId,
        school_subject_id: item.subjectId,
        teacher_id: item.teacherId,
        starts_on: nullable(item.startsOn),
        ends_on: nullable(item.endsOn),
        is_temporary: Boolean(item.temporary),
        is_head_teacher: Boolean(item.headTeacher),
        is_active: item.active !== false,
        created_by: actor.userId,
      },
    };
  }
  const workspace = record(operation.payload, "workspace");
  return {
    kind: "table",
    table: "platform_workspaces",
    key: "user_id",
    entityId: actor.userId,
    row: {
      user_id: actor.userId,
      school_id: actor.schoolId,
      payload: workspace,
    },
  };
}
