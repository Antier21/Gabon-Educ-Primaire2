"use client";

import { createClient } from "@/lib/supabase/client";
import { validateClass, validateStudent } from "@/lib/classes/validation";
import {
  LEGACY_KEYS,
  readLocal,
  resolveStorageStatus,
  STORAGE_KEYS,
  withTimeout,
  writeLocal,
  type StorageMode,
} from "@/lib/storage-mode";
import type { SyncState } from "@/lib/lesson-store";
import { getDefaultLevelsForSchoolType, getDefaultSubjectsForSchoolType, isLevelAllowedForSchoolType, normalizeSchoolLevel } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";
import { enqueueBusinessOperation } from "@/lib/sync/business-operation";
import { updateOperationStatus } from "@/lib/sync/sync-manager";
import { createSupabaseSyncTransport } from "@/lib/sync/supabase-transport";
import { assertSubscriptionWriteAllowed } from "@/lib/subscriptions/write-guard";

export type ClassStudent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  registrationNumber?: string;
  dateOfBirth?: string;
  updatedAt: string;
  syncState?: SyncState;
};
export type ClassRecord = {
  id: string;
  schoolId?: string;
  name: string;
  level: string;
  room: string;
  academicYear: string;
  mainSubject: string;
  students: ClassStudent[];
  updatedAt: string;
  syncState?: SyncState;
  /** Raison exacte d'un échec de synchronisation, à afficher à l'utilisateur. */
  syncError?: string;
};
export type ClassList = {
  items: ClassRecord[];
  mode: StorageMode;
  message: string;
};

export const CLASS_LEVELS = getDefaultLevelsForSchoolType(PRODUCT.defaultSchoolType);
export const SUBJECTS = getDefaultSubjectsForSchoolType(PRODUCT.defaultSchoolType);

function normalizeLegacy(input: unknown): ClassRecord[] {
  if (!Array.isArray(input)) return [];
  return input.map((value) => {
    const item = value as Record<string, unknown>;
    const now = String(item.updatedAt || new Date().toISOString());
    const rawStudents = (item.students || item.class_students || []) as Array<
      Record<string, unknown>
    >;
    return {
      id: String(item.id || crypto.randomUUID()),
      schoolId: String(item.schoolId || item.school_id || ""),
      name: String(item.name || "Classe"),
      level: normalizeSchoolLevel(String(item.level || CLASS_LEVELS[0])),
      room: String(item.room || ""),
      academicYear: String(item.academicYear || "2026-2027"),
      mainSubject: String(item.mainSubject || ""),
      updatedAt: now,
      syncState: (item.syncState as SyncState) || "local",
      students: rawStudents.map((student) => ({
        id: String(student.id || crypto.randomUUID()),
        firstName: String(student.firstName || student.first_name || ""),
        lastName: String(student.lastName || student.last_name || ""),
        email: String(student.email || ""),
        updatedAt: String(student.updatedAt || now),
        syncState: (student.syncState as SyncState) || "local",
      })),
    };
  });
}

export type ClassSchoolContext = { schoolId?: string; schoolType?: string };

export function readClasses(context: ClassSchoolContext = {}) {
  const school = readLocal<{ id?: string; schoolType?: string } | null>(STORAGE_KEYS.school, null);
  const activeSchoolId = context.schoolId || readLocal<string>(STORAGE_KEYS.activeSchool, "") || school?.id || "";
  const schoolType = context.schoolType || school?.schoolType || PRODUCT.defaultSchoolType;
  const deduped = new Map<string, ClassRecord>();
  for (const item of normalizeLegacy(
    readLocal<unknown>(STORAGE_KEYS.classes, readLocal<unknown>(LEGACY_KEYS.classes, [])),
  )) {
    const level = normalizeSchoolLevel(item.level);
    if (!isLevelAllowedForSchoolType(level, schoolType)) continue;
    if (activeSchoolId && item.schoolId && item.schoolId !== activeSchoolId) continue;
    if (activeSchoolId && !item.schoolId) continue;
    const key = `${activeSchoolId}|${level}|${item.name.trim().toLocaleLowerCase("fr")}|${item.academicYear}`;
    if (!deduped.has(key)) deduped.set(key, { ...item, level, schoolId: item.schoolId || activeSchoolId });
  }
  return [...deduped.values()];
}
function writeClasses(items: ClassRecord[]) {
  writeLocal(STORAGE_KEYS.classes, items, LEGACY_KEYS.classes);
}

/** Maintient immédiatement la liste locale de la classe après une inscription administrative. */
export function cacheStudentInClass(classId: string, input: Omit<ClassStudent, "updatedAt" | "syncState">) {
  const timestamp = new Date().toISOString();
  const student: ClassStudent = { ...input, updatedAt: timestamp, syncState: "pending" };
  writeClasses(readClasses().map((item) => item.id === classId ? {
    ...item,
    students: [...item.students.filter((entry) => entry.id !== student.id), student]
      .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, "fr")),
    updatedAt: timestamp,
  } : item));
}
export async function listClasses(context: ClassSchoolContext = {}): Promise<ClassList> {
  const school = readLocal<{ id?: string; schoolType?: string } | null>(STORAGE_KEYS.school, null);
  const activeSchoolId = context.schoolId || readLocal<string>(STORAGE_KEYS.activeSchool, "") || school?.id || "";
  const schoolType = context.schoolType || school?.schoolType || PRODUCT.defaultSchoolType;
  const local = readClasses({ schoolId: activeSchoolId, schoolType });
  const status = await resolveStorageStatus();
  if (status.mode !== "cloud")
    return { items: local, mode: status.mode, message: status.message };
  try {
    const { data, error } = await withTimeout(
      createClient()
        .from("class_groups")
        .select(
          "id,school_id,name,room,academic_year_label,main_subject,updated_at,grade_levels(code,name),class_students(id,first_name,last_name,email,updated_at)",
        )
        .eq("school_id", activeSchoolId)
        .order("updated_at", { ascending: false }),
    );
    if (error) throw error;
    const remote = (data || []).map((row: Record<string, unknown>) => {
      const grade = row.grade_levels as { code?: string; name?: string } | null;
      const students = (row.class_students || []) as Array<
        Record<string, unknown>
      >;
      return {
        id: String(row.id),
        schoolId: String(row.school_id || ""),
        name: String(row.name),
        room: String(row.room || ""),
        level: normalizeSchoolLevel(grade?.code || grade?.name || CLASS_LEVELS[0]),
        academicYear: String(row.academic_year_label || "2026-2027"),
        mainSubject: String(row.main_subject || ""),
        updatedAt: String(row.updated_at),
        syncState: "synced" as const,
        students: students
          .map((student) => ({
            id: String(student.id),
            firstName: String(student.first_name),
            lastName: String(student.last_name),
            email: String(student.email || ""),
            updatedAt: String(student.updated_at || row.updated_at),
            syncState: "synced" as const,
          }))
          .sort((a, b) =>
            `${a.lastName}${a.firstName}`.localeCompare(
              `${b.lastName}${b.firstName}`,
              "fr",
            ),
          ),
      };
    });
    const allowedRemote = remote
      .filter((item) => isLevelAllowedForSchoolType(item.level, schoolType))
      .map((remoteItem) => {
        const localItem = local.find((item) => item.id === remoteItem.id);
        const pendingStudents = (localItem?.students || []).filter(
          (student) =>
            student.syncState !== "synced" &&
            !remoteItem.students.some((remoteStudent) => remoteStudent.id === student.id),
        );
        return pendingStudents.length
          ? {
              ...remoteItem,
              students: [...remoteItem.students, ...pendingStudents].sort((a, b) =>
                `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`, "fr"),
              ),
            }
          : remoteItem;
      });
    const pending = local.filter(
      (item) =>
        item.syncState === "pending" &&
        !allowedRemote.some((remoteItem) => remoteItem.id === item.id),
    );
    const merged = [...pending, ...allowedRemote];
    writeClasses(merged);
    return {
      items: merged,
      mode: "cloud",
      message: pending.length
        ? "Certaines classes attendent la synchronisation"
        : "Classes synchronisées",
    };
  } catch {
    return {
      items: local,
      mode: "offline",
      message: "Réseau indisponible : classes locales conservées",
    };
  }
}

export async function saveClassRecord(
  input: Omit<ClassRecord, "updatedAt" | "syncState">,
  context: ClassSchoolContext = {},
): Promise<ClassRecord> {
  const now = new Date().toISOString();
  const school = readLocal<{ id?: string; schoolType?: string } | null>(STORAGE_KEYS.school, null);
  const activeSchoolId = context.schoolId || readLocal<string>(STORAGE_KEYS.activeSchool, "") || school?.id || "";
  await assertSubscriptionWriteAllowed(activeSchoolId);
  const activeSchoolType = context.schoolType || school?.schoolType || PRODUCT.defaultSchoolType;
  const normalizedLevel = normalizeSchoolLevel(input.level);
  if (!isLevelAllowedForSchoolType(normalizedLevel, activeSchoolType)) throw new Error("Ce niveau ne correspond pas au type de l’établissement actif.");
  const duplicate = readClasses({ schoolId: activeSchoolId, schoolType: activeSchoolType }).find((item) => item.id !== input.id && item.name.trim().toLocaleLowerCase("fr") === input.name.trim().toLocaleLowerCase("fr") && item.academicYear === input.academicYear);
  if (duplicate) throw new Error("Une classe portant ce nom existe déjà pour cette année scolaire.");
  const previous = readClasses({ schoolId: activeSchoolId, schoolType: activeSchoolType }).find((item) => item.id === input.id);
  const checked = validateClass({
    name: input.name,
    gradeLevelId: "00000000-0000-4000-8000-000000000001",
    room: input.room,
  });
  if (!input.academicYear.trim()) throw new Error("Indiquez l’année scolaire.");
  const record: ClassRecord = {
    ...input,
    schoolId: activeSchoolId,
    level: normalizedLevel,
    name: checked.name,
    room: checked.room || "",
    academicYear: input.academicYear.trim(),
    updatedAt: now,
    syncState: "pending",
  };
  writeClasses([
    record,
    ...readClasses({ schoolId: activeSchoolId, schoolType: activeSchoolType }).filter((item) => item.id !== record.id),
  ]);
  const status = await resolveStorageStatus();
  const queued = enqueueBusinessOperation(
    {
      module: "classes",
      operation: previous ? "update" : "create",
      entityId: record.id,
      payload: { class: record },
      baseUpdatedAt: previous?.updatedAt,
    },
    {
      schoolId: activeSchoolId || "local",
      userId: status.user?.id || "local-user",
    },
  );
  if (status.mode !== "cloud" || !status.user)
    return {
      ...record,
      syncState: status.mode === "demo" ? "local" : "pending",
    };
  try {
    if (!queued) throw new Error("Opération de classe absente de la file locale.");
    await createSupabaseSyncTransport().execute(queued);
    const synced = { ...record, syncState: "synced" as const };
    writeClasses([
      synced,
      ...readClasses({ schoolId: activeSchoolId, schoolType: activeSchoolType }).filter((item) => item.id !== synced.id),
    ]);
    if (queued) updateOperationStatus(queued.id, "synced");
    return synced;
  } catch (error) {
    // Une écriture Supabase refusée ne doit jamais passer inaperçue : la classe
    // resterait indéfiniment locale sans que personne ne sache pourquoi.
    const reason = error instanceof Error ? error.message : String(error);
    console.error("Échec d'enregistrement de la classe dans Supabase :", reason);
    return { ...record, syncError: reason };
  }
}

export async function deleteClassRecord(id: string) {
  await assertSubscriptionWriteAllowed();
  const previous = readClasses().find((item) => item.id === id);
  writeClasses(readClasses().filter((item) => item.id !== id));
  const status = await resolveStorageStatus();
  const queued = enqueueBusinessOperation(
    {
      module: "classes",
      operation: "delete",
      entityId: id,
      payload: {},
      baseUpdatedAt: previous?.updatedAt,
    },
    {
      schoolId: readLocal(STORAGE_KEYS.activeSchool, "") || "local",
      userId: status.user?.id || "local-user",
    },
  );
  if (status.mode === "cloud") {
    try {
      if (!queued) throw new Error("Opération de suppression absente de la file locale.");
      await createSupabaseSyncTransport().execute(queued);
      if (queued) updateOperationStatus(queued.id, "synced");
    } catch {}
  }
}

export async function saveStudent(
  classId: string,
  input: Omit<ClassStudent, "updatedAt" | "syncState">,
): Promise<ClassStudent> {
  await assertSubscriptionWriteAllowed();
  const values = validateStudent(input);
  const now = new Date().toISOString();
  const previous = readClasses()
    .flatMap((item) => item.students)
    .find((item) => item.id === input.id);
  const student: ClassStudent = {
    id: input.id,
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email || "",
    updatedAt: now,
    syncState: "pending",
  };
  const next = readClasses().map((item) =>
    item.id === classId
      ? {
          ...item,
          students: [
            ...item.students.filter((entry) => entry.id !== student.id),
            student,
          ].sort((a, b) =>
            `${a.lastName}${a.firstName}`.localeCompare(
              `${b.lastName}${b.firstName}`,
              "fr",
            ),
          ),
        }
      : item,
  );
  writeClasses(next);
  const status = await resolveStorageStatus();
  const queued = enqueueBusinessOperation(
    {
      module: "students",
      operation: previous ? "update" : "create",
      entityId: student.id,
      payload: { student, classId },
      baseUpdatedAt: previous?.updatedAt,
    },
    {
      schoolId: readLocal(STORAGE_KEYS.activeSchool, "") || "local",
      userId: status.user?.id || "local-user",
    },
  );
  if (status.mode !== "cloud")
    return {
      ...student,
      syncState: status.mode === "demo" ? "local" : "pending",
    };
  try {
    if (!queued) throw new Error("Opération élève absente de la file locale.");
    await createSupabaseSyncTransport().execute(queued);
    if (queued) updateOperationStatus(queued.id, "synced");
    return { ...student, syncState: "synced" };
  } catch {
    return student;
  }
}

export async function deleteStudent(classId: string, studentId: string) {
  await assertSubscriptionWriteAllowed();
  const previous = readClasses()
    .flatMap((item) => item.students)
    .find((item) => item.id === studentId);
  writeClasses(
    readClasses().map((item) =>
      item.id === classId
        ? {
            ...item,
            students: item.students.filter(
              (student) => student.id !== studentId,
            ),
          }
        : item,
    ),
  );
  const status = await resolveStorageStatus();
  const queued = enqueueBusinessOperation(
    {
      module: "students",
      operation: "delete",
      entityId: studentId,
      payload: { classId },
      baseUpdatedAt: previous?.updatedAt,
    },
    {
      schoolId: readLocal(STORAGE_KEYS.activeSchool, "") || "local",
      userId: status.user?.id || "local-user",
    },
  );
  if (status.mode === "cloud") {
    try {
      if (!queued) throw new Error("Opération de suppression absente de la file locale.");
      await createSupabaseSyncTransport().execute(queued);
      if (queued) updateOperationStatus(queued.id, "synced");
    } catch {}
  }
}

export function parseStudentCsv(
  content: string,
): Array<Omit<ClassStudent, "updatedAt" | "syncState">> {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  if (!lines.length) return [];
  const separator = lines[0].includes(";") ? ";" : ",";
  const rows = lines.map((line) =>
    line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, "")),
  );
  const start = /nom|prenom|prénom/i.test(rows[0].join(" ")) ? 1 : 0;
  return rows
    .slice(start)
    .filter((row) => row[0] && row[1])
    .map((row) => ({
      id: crypto.randomUUID(),
      lastName: row[0],
      firstName: row[1],
      email: row[2] || "",
    }));
}

export function classesToCsv(item: ClassRecord) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [
    "Nom;Prénom;E-mail",
    ...item.students.map((student) =>
      [student.lastName, student.firstName, student.email]
        .map(escape)
        .join(";"),
    ),
  ].join("\n");
}
