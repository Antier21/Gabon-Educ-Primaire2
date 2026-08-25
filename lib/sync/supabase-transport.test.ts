import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/client";
import { processQueue, queueOperation, readSyncQueue } from "./sync-manager";
import { createSupabaseSyncTransport } from "./supabase-transport";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

type WriteCall = { table: string; row: Record<string, unknown>; key: string };

describe("transport complet file vers Supabase", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("window", { dispatchEvent: () => true });
    vi.stubGlobal(
      "CustomEvent",
      class {
        constructor(
          public type: string,
          public init: unknown,
        ) {}
      },
    );
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("crypto", {
      randomUUID: () => "33333333-3333-4333-8333-333333333333",
    });
  });

  it("réassocie une annonce locale puis envoie uniquement les colonnes SQL", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const schoolId = "22222222-2222-4222-8222-222222222222";
    const writes: WriteCall[] = [];

    const from = (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "platform_workspaces" ? { school_id: schoolId } : null,
          error: null,
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        upsert: (
          row: Record<string, unknown>,
          options: { onConflict: string },
        ) => {
          writes.push({ table, row, key: options.onConflict });
          return {
            select: () => ({
              single: async () => ({
                data: { ...row, updated_at: "2026-08-02T20:00:00.000Z" },
                error: null,
              }),
            }),
          };
        },
      };
      return query;
    };
    const fakeClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
      from,
      rpc: async () => ({ data: null, error: null }),
    } as unknown as ReturnType<typeof createClient>;

    queueOperation({
      schoolId: "local",
      userId: "local-user",
      module: "announcements",
      type: "create",
      entityId: "44444444-4444-4444-8444-444444444444",
      payload: {
        announcement: {
          title: "Conseil de classe",
          content: "Réunion vendredi",
          audience: "teachers",
          status: "draft",
          publishesAt: "2026-08-07T08:00:00Z",
        },
      },
      baseUpdatedAt: null,
    });

    await processQueue(createSupabaseSyncTransport(fakeClient));

    expect(readSyncQueue()[0]).toMatchObject({
      status: "synced",
      retryCount: 1,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      table: "school_announcements",
      key: "id",
    });
    expect(writes[0].row).toMatchObject({
      school_id: schoolId,
      created_by: userId,
      title: "Conseil de classe",
      publication_status: "draft",
    });
    expect(writes[0].row).not.toHaveProperty("announcement");
  });

  it("traite les payloads de chaque formulaire métier avec les tables exactes", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const schoolId = "22222222-2222-4222-8222-222222222222";
    const gradeId = "55555555-5555-4555-8555-555555555555";
    const subjectId = "66666666-6666-4666-8666-666666666666";
    const writes: WriteCall[] = [];
    const from = (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        ilike: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "platform_workspaces"
              ? { school_id: schoolId }
              : table === "grade_levels" || table === "academic_years"
                ? { id: gradeId }
                : table === "subjects"
                  ? { id: subjectId }
                  : table === "class_groups"
                    ? {
                        id: "00000000-0000-4000-8000-000000000001",
                        school_id: schoolId,
                        academic_year_id: gradeId,
                      }
                  : null,
          error: null,
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        upsert: (
          row: Record<string, unknown>,
          options: { onConflict: string },
        ) => {
          writes.push({ table, row, key: options.onConflict });
          return {
            select: () => ({
              single: async () => ({
                data: { ...row, updated_at: "2026-08-02T20:00:00.000Z" },
                error: null,
              }),
            }),
          };
        },
      };
      return query;
    };
    const fakeClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
      from,
      rpc: async () => ({ data: null, error: null }),
    } as unknown as ReturnType<typeof createClient>;
    const add = (
      module:
        | "classes"
        | "students"
        | "guardians"
        | "evaluations"
        | "attendance"
        | "timetables"
        | "documents"
        | "lessons",
      entityId: string,
      payload: Record<string, unknown>,
    ) =>
      queueOperation({
        schoolId: "local",
        userId: "local-user",
        module,
        type: "create",
        entityId,
        payload,
        baseUpdatedAt: null,
      });

    add("classes", "00000000-0000-4000-8000-000000000001", {
      class: { name: "5e A", level: "5e", academicYear: "2026-2027" },
    });
    add("students", "00000000-0000-4000-8000-000000000002", {
      student: {
        schoolId,
        academicYearId: null,
        firstName: "Ada",
        lastName: "Mba",
        status: "active",
      },
    });
    add("guardians", "00000000-0000-4000-8000-000000000003", {
      guardian: {
        firstName: "Marie",
        lastName: "Mba",
        phone: "060000000",
        contactAllowed: true,
      },
      link: {
        id: "00000000-0000-4000-8000-000000000004",
        studentId: "00000000-0000-4000-8000-000000000002",
        relationship: "mother",
        primary: true,
      },
    });
    add("evaluations", "00000000-0000-4000-8000-000000000005", {
      evaluation: {
        title: "Dictée",
        subject: "Français",
        grade: "5e",
        date: "2026-09-01",
      },
    });
    add("attendance", "00000000-0000-4000-8000-000000000006", {
      entry: {
        studentId: "00000000-0000-4000-8000-000000000002",
        kind: "absence",
        date: "2026-09-01",
      },
    });
    add("timetables", "00000000-0000-4000-8000-000000000007", {
      slot: {
        academicYearId: "00000000-0000-4000-8000-000000000008",
        classId: "00000000-0000-4000-8000-000000000001",
        subjectId,
        weekday: 1,
        startsAt: "08:00",
        endsAt: "09:00",
      },
    });
    add("documents", "00000000-0000-4000-8000-000000000009", {
      document: { kind: "student_card", title: "Carte", payload: {} },
    });
    add("lessons", "00000000-0000-4000-8000-000000000010", {
      lesson: {
        title: "Accord",
        subject: "Français",
        grade: "5e",
        classGroup: "5e A",
        week: 1,
        duration: 55,
      },
    });

    await processQueue(createSupabaseSyncTransport(fakeClient));

    const queue = readSyncQueue();
    expect(
      queue.every((item) => item.status === "synced"),
      JSON.stringify(queue.map((item) => ({ module: item.module, error: item.lastError }))),
    ).toBe(true);
    expect(writes.map((item) => item.table)).toEqual([
      "class_groups",
      "student_records",
      "guardians",
      "guardian_student_links",
      "teacher_evaluations",
      "attendance_records",
      "timetable_slots",
      "school_documents",
      "lesson_plans",
    ]);
    for (const write of writes) {
      expect(write.row).not.toHaveProperty("class");
      expect(write.row).not.toHaveProperty("student");
      expect(write.row).not.toHaveProperty("guardian");
      expect(write.row).not.toHaveProperty("evaluation");
      expect(write.row).not.toHaveProperty("entry");
      expect(write.row).not.toHaveProperty("slot");
      expect(write.row).not.toHaveProperty("document");
      expect(write.row).not.toHaveProperty("lesson");
    }
  });

  it("ne compare pas la date d’une sous-entité avec celle d’un workspace", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const schoolId = "22222222-2222-4222-8222-222222222222";
    const writes: WriteCall[] = [];
    const rpcCalls: string[] = [];
    const from = (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "platform_workspaces" ? { school_id: schoolId } : null,
          error: null,
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        upsert: (
          row: Record<string, unknown>,
          options: { onConflict: string },
        ) => {
          writes.push({ table, row, key: options.onConflict });
          return {
            select: () => ({
              single: async () => ({
                data: { ...row, updated_at: "2026-08-02T21:00:00.000Z" },
                error: null,
              }),
            }),
          };
        },
      };
      return query;
    };
    const fakeClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
      from,
      rpc: async (name: string) => {
        rpcCalls.push(name);
        return { data: null, error: null };
      },
    } as unknown as ReturnType<typeof createClient>;

    queueOperation({
      schoolId: "local",
      userId: "local-user",
      module: "grading",
      type: "update",
      entityId: "score-1",
      payload: { workspace: { scores: [{ id: "score-1", value: 15 }] } },
      baseUpdatedAt: "2026-08-01T08:00:00.000Z",
    });

    await processQueue(createSupabaseSyncTransport(fakeClient));

    expect(readSyncQueue()[0].status).toBe("synced");
    expect(writes).toHaveLength(0);
    expect(rpcCalls).toEqual(["save_grading_workspace_relational"]);
  });

  it("remplace l’année locale et vérifie le profil enseignant avant une affectation", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const teacherId = "77777777-7777-4777-8777-777777777777";
    const schoolId = "22222222-2222-4222-8222-222222222222";
    const yearId = "55555555-5555-4555-8555-555555555555";
    const subjectId = "88888888-8888-4888-8888-888888888888";
    const writes: WriteCall[] = [];
    const from = (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "platform_workspaces"
              ? { school_id: schoolId }
              : table === "class_groups"
                ? { school_id: schoolId, academic_year_id: yearId }
                : table === "school_memberships"
                  ? { user_id: teacherId }
                  : // La matière doit exister : depuis la correction du refus
                    // « violates foreign key constraint … school_subject_id »,
                    // le transport vérifie sa présence avant d'écrire.
                    table === "school_subjects"
                    ? { id: subjectId }
                    : null,
          error: null,
        }),
        delete: () => ({ eq: async () => ({ error: null }) }),
        upsert: (
          row: Record<string, unknown>,
          options: { onConflict: string },
        ) => {
          writes.push({ table, row, key: options.onConflict });
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
            }),
          };
        },
      };
      return query;
    };
    const fakeClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
      from,
      rpc: async () => ({ data: null, error: null }),
    } as unknown as ReturnType<typeof createClient>;

    queueOperation({
      schoolId: "local",
      userId: "local-user",
      module: "assignments",
      type: "create",
      entityId: "99999999-9999-4999-8999-999999999999",
      payload: {
        assignment: {
          academicYearId: "local",
          classId: "66666666-6666-4666-8666-666666666666",
          subjectId,
          teacherId,
        },
      },
      baseUpdatedAt: null,
    });

    await processQueue(createSupabaseSyncTransport(fakeClient));

    expect(readSyncQueue()[0].status).toBe("synced");
    expect(writes[0]).toMatchObject({
      table: "school_teaching_assignments",
      row: { academic_year_id: yearId, teacher_id: teacherId },
    });
  });

  /**
   * Régression : « violates foreign key constraint …_school_subject_id_fkey ».
   *
   * Une matière absente de la base — jamais transmise, ou présente sous un
   * autre identifiant après dédoublonnage sur (établissement, code) — faisait
   * échouer toute affectation d'enseignant. Le titulaire ne pouvait plus être
   * nommé, donc l'enseignant ne voyait pas ses classes, donc aucune note
   * n'atteignait les familles.
   */
  it("crée la matière absente plutôt que de refuser l’affectation", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const teacherId = "77777777-7777-4777-8777-777777777777";
    const schoolId = "22222222-2222-4222-8222-222222222222";
    const yearId = "55555555-5555-4555-8555-555555555555";
    const createdSubjectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const writes: WriteCall[] = [];
    const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
    const from = (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        ilike: () => query,
        limit: () => query,
        maybeSingle: async () => ({
          data:
            table === "platform_workspaces"
              ? { school_id: schoolId }
              : table === "class_groups"
                ? { school_id: schoolId, academic_year_id: yearId }
                : table === "school_memberships"
                  ? { user_id: teacherId }
                  : // school_subjects ne renvoie rien : la matière est absente.
                    null,
          error: null,
        }),
        insert: (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return {
            select: () => ({
              single: async () => ({ data: { id: createdSubjectId }, error: null }),
            }),
          };
        },
        delete: () => ({ eq: async () => ({ error: null }) }),
        upsert: (
          row: Record<string, unknown>,
          options: { onConflict: string },
        ) => {
          writes.push({ table, row, key: options.onConflict });
          return {
            select: () => ({ single: async () => ({ data: row, error: null }) }),
          };
        },
      };
      return query;
    };
    const fakeClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
      },
      from,
      rpc: async () => ({ data: null, error: null }),
    } as unknown as ReturnType<typeof createClient>;

    queueOperation({
      schoolId: "local",
      userId: "local-user",
      module: "assignments",
      type: "create",
      entityId: "99999999-9999-4999-8999-999999999999",
      payload: {
        assignment: {
          academicYearId: "local",
          classId: "66666666-6666-4666-8666-666666666666",
          subjectId: "88888888-8888-4888-8888-888888888888",
          teacherId,
        },
        subject: { code: "MATHEMATIQUES", label: "Mathématiques", coefficient: 2 },
      },
      baseUpdatedAt: null,
    });

    await processQueue(createSupabaseSyncTransport(fakeClient));

    expect(readSyncQueue()[0].status).toBe("synced");
    expect(inserts[0]).toMatchObject({
      table: "school_subjects",
      row: { code: "MATHEMATIQUES", label: "Mathématiques", school_id: schoolId },
    });
    // L'affectation part avec l'identifiant réellement créé, pas le local.
    expect(writes[0]).toMatchObject({
      table: "school_teaching_assignments",
      row: { school_subject_id: createdSubjectId },
    });
  });
});
