import { describe, expect, it } from "vitest";
import type { SyncModule, SyncOperation } from "./types";
import { buildSupabaseMutation, type SyncActor } from "./supabase-mapping";

const actor: SyncActor = {
  userId: "11111111-1111-4111-8111-111111111111",
  schoolId: "22222222-2222-4222-8222-222222222222",
};
const operation = (
  module: SyncModule,
  payload: Record<string, unknown>,
): SyncOperation => ({
  id: "33333333-3333-4333-8333-333333333333",
  schoolId: actor.schoolId || "local",
  userId: actor.userId,
  module,
  type: "create",
  entityId: "44444444-4444-4444-8444-444444444444",
  payload,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  baseUpdatedAt: null,
  retryCount: 0,
  lastError: "",
  status: "pending",
  remotePayload: null,
  remoteUpdatedAt: null,
});
const tableRow = (module: SyncModule, payload: Record<string, unknown>) => {
  const mutation = buildSupabaseMutation(operation(module, payload), actor);
  if (mutation.kind !== "table") throw new Error("Mutation table attendue");
  return mutation;
};

describe("correspondance payloads métier et schéma Supabase", () => {
  it("traduit une annonce vers school_announcements", () => {
    const mutation = tableRow("announcements", {
      announcement: {
        title: "Réunion",
        content: "Vendredi",
        audience: "teachers",
        targetId: "",
        attachmentName: "",
        publishesAt: "2026-09-01T08:00:00Z",
        expiresAt: "",
        status: "draft",
      },
    });
    expect(mutation.table).toBe("school_announcements");
    expect(mutation.row).toMatchObject({
      title: "Réunion",
      content: "Vendredi",
      audience: "teachers",
      publication_status: "draft",
      created_by: actor.userId,
      school_id: actor.schoolId,
    });
    expect(mutation.row).not.toHaveProperty("announcement");
  });

  it("traduit un dossier élève vers student_records", () => {
    const mutation = tableRow("students", {
      student: {
        schoolId: actor.schoolId,
        academicYearId: "55555555-5555-4555-8555-555555555555",
        classId: "66666666-6666-4666-8666-666666666666",
        firstName: "Élise",
        lastName: "Ondo",
        gender: "female",
        status: "active",
      },
    });
    expect(mutation.table).toBe("student_records");
    expect(mutation.row).toMatchObject({
      first_name: "Élise",
      last_name: "Ondo",
      academic_year_id: "55555555-5555-4555-8555-555555555555",
      class_group_id: "66666666-6666-4666-8666-666666666666",
      created_by: actor.userId,
    });
    expect(mutation.row).not.toHaveProperty("student");
    expect(mutation.related?.[0]).toMatchObject({
      table: "class_students",
      row: {
        class_group_id: "66666666-6666-4666-8666-666666666666",
        first_name: "Élise",
        last_name: "Ondo",
      },
    });
    expect(mutation.related?.[0].row).not.toHaveProperty("academic_year_id");
  });

  it("traduit un élève de Mes classes vers class_students", () => {
    const mutation = tableRow("students", {
      classId: "66666666-6666-4666-8666-666666666666",
      student: { firstName: "Abel", lastName: "Ondo", email: "" },
    });
    expect(mutation.table).toBe("class_students");
    expect(mutation.row).toMatchObject({
      first_name: "Abel",
      last_name: "Ondo",
      class_group_id: "66666666-6666-4666-8666-666666666666",
    });
    expect(mutation.related?.[0]).toMatchObject({
      table: "student_records",
      row: {
        id: operation("students", {}).entityId,
        class_student_id: operation("students", {}).entityId,
        school_id: actor.schoolId,
      },
    });
    expect(mutation.related?.[0].row).not.toHaveProperty("academic_year_id");
  });

  it("traduit une classe sans envoyer la clé class", () => {
    const mutation = tableRow("classes", {
      class: {
        name: "5e A1",
        level: "5e",
        academicYear: "2026-2027",
        room: "6A7",
        mainSubject: "Français",
      },
    });
    expect(mutation.table).toBe("class_groups");
    expect(mutation.row).toMatchObject({
      name: "5e A1",
      academic_year_label: "2026-2027",
      owner_teacher_id: actor.userId,
    });
    expect(mutation.row).not.toHaveProperty("class");
  });

  it("traduit un responsable et son lien dans deux tables", () => {
    const mutation = tableRow("guardians", {
      guardian: {
        firstName: "Irène",
        lastName: "Ondo",
        phone: "060000000",
        contactAllowed: true,
        status: "active",
      },
      link: {
        id: "77777777-7777-4777-8777-777777777777",
        studentId: "88888888-8888-4888-8888-888888888888",
        relationship: "mother",
        primary: true,
      },
    });
    expect(mutation.table).toBe("guardians");
    expect(mutation.related?.[0].table).toBe("guardian_student_links");
    expect(mutation.related?.[0].row).toMatchObject({
      guardian_id: operation("guardians", {}).entityId,
      is_primary: true,
      created_by: actor.userId,
    });
  });

  it("traduit évaluations, assiduité, créneaux et documents", () => {
    const evaluation = tableRow("evaluations", {
      evaluation: {
        title: "Dictée",
        subject: "Français",
        grade: "5e",
        classId: "",
        date: "2026-09-01",
        status: "draft",
      },
    });
    const attendance = tableRow("attendance", {
      entry: {
        academicYearId: "55555555-5555-4555-8555-555555555555",
        periodId: "99999999-9999-4999-8999-999999999999",
        classId: "66666666-6666-4666-8666-666666666666",
        studentId: "88888888-8888-4888-8888-888888888888",
        kind: "absence",
        date: "2026-09-01",
        durationMinutes: 60,
        justified: false,
      },
    });
    const timetable = tableRow("timetables", {
      slot: {
        academicYearId: "55555555-5555-4555-8555-555555555555",
        classId: "66666666-6666-4666-8666-666666666666",
        subjectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        teacherId: actor.userId,
        weekday: 1,
        startsAt: "08:00",
        endsAt: "09:00",
      },
    });
    const document = tableRow("documents", {
      document: {
        kind: "student_card",
        title: "Carte d’élève",
        status: "generated",
        payload: { student: "Élise Ondo" },
      },
    });
    expect(evaluation.table).toBe("teacher_evaluations");
    expect(evaluation.row).not.toHaveProperty("evaluation");
    expect(attendance.row).toHaveProperty("attendance_kind", "absence");
    expect(attendance.row).not.toHaveProperty("entry");
    expect(timetable.row).toHaveProperty("starts_at", "08:00");
    expect(timetable.row).not.toHaveProperty("slot");
    expect(document.row).toHaveProperty("document_kind", "student_card");
    expect(document.row).not.toHaveProperty("document");
  });

  it("traduit une fiche vers lesson_plans sans enveloppe métier", () => {
    const mutation = tableRow("lessons", {
      lesson: {
        title: "Accord du participe",
        subject: "Français",
        grade: "5e",
        week: 4,
        duration: 55,
        status: "draft",
      },
    });
    expect(mutation).toMatchObject({
      table: "lesson_plans",
      row: {
        title: "Accord du participe",
        teacher_id: actor.userId,
        week_number: 4,
      },
    });
    expect(mutation.row).not.toHaveProperty("lesson");
  });

  it("réserve settings et grading à leurs workspaces SQL", () => {
    const settings = tableRow("settings", { workspace: { school: null } });
    const grading = buildSupabaseMutation(
      operation("grading", { workspace: { scores: [] } }),
      actor,
    );
    expect(settings).toMatchObject({
      table: "platform_workspaces",
      key: "user_id",
      entityId: actor.userId,
    });
    expect(grading).toMatchObject({
      kind: "rpc",
      functionName: "save_grading_workspace_relational",
      parameters: { p_payload: { scores: [] } },
    });
  });

  it("sépare utilisateurs, matières et affectations de settings", () => {
    const user = tableRow("users", {
      user: {
        email: "prof@ecole.ga",
        role: "teacher",
        scopeClassIds: [],
        invitationStatus: "pending",
        expiresAt: "2026-09-08T00:00:00Z",
      },
      tokenHash: "hash",
    });
    const subject = tableRow("subjects", {
      subject: { code: "FRA", label: "Français", coefficient: 2 },
    });
    const assignment = tableRow("assignments", {
      assignment: {
        academicYearId: "55555555-5555-4555-8555-555555555555",
        classId: "66666666-6666-4666-8666-666666666666",
        subjectId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        teacherId: actor.userId,
      },
    });
    expect(user.table).toBe("school_invitations");
    expect(subject.table).toBe("school_subjects");
    expect(assignment.table).toBe("school_teaching_assignments");
  });

  it("convertit le rôle applicatif guardian vers le rôle SQL parent", () => {
    const mutation = tableRow("users", {
      user: {
        email: "parent@ecole.ga",
        role: "guardian",
        scopeClassIds: [],
        invitationStatus: "pending",
        expiresAt: "2026-09-08T00:00:00Z",
      },
      tokenHash: "hash-parent",
    });
    expect(mutation.row.role).toBe("parent");
  });

  it("refuse un coefficient nul avant l’écriture Supabase", () => {
    expect(() =>
      tableRow("subjects", {
        subject: { code: "FRA", label: "Français", coefficient: 0 },
      }),
    ).toThrow("Le coefficient doit être strictement positif.");
  });
});
