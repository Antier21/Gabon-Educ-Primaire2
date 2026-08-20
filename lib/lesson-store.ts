"use client";

import { createClient } from "@/lib/supabase/client";
import {
  LEGACY_KEYS,
  resolveStorageStatus,
  STORAGE_KEYS,
  withTimeout,
  readLocal,
  writeLocal,
  type StorageMode,
} from "@/lib/storage-mode";
import { enqueueBusinessOperation } from "@/lib/sync/business-operation";
import { updateOperationStatus } from "@/lib/sync/sync-manager";
import { createSupabaseSyncTransport } from "@/lib/sync/supabase-transport";
import { assertSubscriptionWriteAllowed } from "@/lib/subscriptions/write-guard";

export type SyncState = "local" | "pending" | "synced";
export type LessonRecord = {
  id: string;
  subject: string;
  grade: string;
  classGroup: string;
  week: number;
  title: string;
  duration: number;
  status: "draft" | "published";
  createdAt?: string;
  updatedAt: string;
  syncState?: SyncState;
  objective?: string;
  competency?: string;
  prerequisite?: string;
  situationProblem?: string;
  material?: string;
  summary?: string;
  differentiation?: string;
  homework?: string;
  steps?: unknown[];
  [key: string]: unknown;
};

export type LessonList = {
  items: LessonRecord[];
  mode: StorageMode;
  message: string;
};

function readLessons() {
  return readLocal<LessonRecord[]>(
    STORAGE_KEYS.lessons,
    [],
    LEGACY_KEYS.lessons,
  );
}
function writeLessons(items: LessonRecord[]) {
  writeLocal(STORAGE_KEYS.lessons, items, LEGACY_KEYS.lessons);
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function validateLesson(record: LessonRecord) {
  if (record.title.trim().length < 3)
    throw new Error(
      "Le titre de la fiche doit comporter au moins trois caractères.",
    );
  if (!record.subject || !record.grade)
    throw new Error("La matière et le niveau sont obligatoires.");
  if (record.duration < 10 || record.duration > 300)
    throw new Error("La durée doit être comprise entre 10 et 300 minutes.");
  return { ...record, title: record.title.trim() };
}

export async function listLessonsWithStatus(): Promise<LessonList> {
  const local = readLessons();
  const status = await resolveStorageStatus();
  if (status.mode !== "cloud")
    return { items: local, mode: status.mode, message: status.message };
  try {
    const { data, error } = await withTimeout(
      createClient().rpc("list_my_lesson_plan_payloads"),
    );
    if (error) throw error;
    const remote: LessonRecord[] = (data || []).map(
      (row: { id: string; payload: LessonRecord; updated_at: string }) => ({
        ...row.payload,
        id: row.id,
        updatedAt: row.updated_at,
        createdAt: row.payload.createdAt || row.updated_at,
        syncState: "synced" as const,
      }),
    );
    const pending = local.filter(
      (item) =>
        item.syncState === "pending" &&
        !remote.some((remoteItem) => remoteItem.id === item.id),
    );
    const merged = [...pending, ...remote];
    writeLessons(merged);
    return {
      items: merged,
      mode: "cloud",
      message: pending.length
        ? `${pending.length} fiche(s) en attente de synchronisation`
        : "Fiches synchronisées",
    };
  } catch {
    return {
      items: local,
      mode: "offline",
      message: "Réseau indisponible : vos fiches locales sont préservées",
    };
  }
}

export async function listLessons(): Promise<LessonRecord[]> {
  return (await listLessonsWithStatus()).items;
}

export async function saveLesson(record: LessonRecord): Promise<LessonRecord> {
  await assertSubscriptionWriteAllowed();
  const now = new Date().toISOString();
  const previous = readLessons().find((item) => item.id === record.id);
  const normalized: LessonRecord = validateLesson({
    ...record,
    createdAt: record.createdAt || now,
    updatedAt: now,
    syncState: "pending",
  });
  const local = readLessons();
  writeLessons([
    normalized,
    ...local.filter((item) => item.id !== normalized.id),
  ]);
  const status = await resolveStorageStatus();
  const queued = enqueueBusinessOperation(
    {
      module: "lessons",
      operation: previous ? "update" : "create",
      entityId: normalized.id,
      payload: { lesson: normalized },
      baseUpdatedAt: previous?.updatedAt,
    },
    {
      schoolId: readLocal(STORAGE_KEYS.activeSchool, "") || "local",
      userId: status.user?.id || "local-user",
    },
  );
  if (status.mode !== "cloud")
    return {
      ...normalized,
      syncState: status.mode === "demo" ? "local" : "pending",
    };
  try {
    if (!queued) throw new Error("Opération de fiche absente de la file locale.");
    const result = await createSupabaseSyncTransport().execute(queued);
    const synced = {
      ...normalized,
      id: String(result.remotePayload?.id || normalized.id),
      syncState: "synced" as const,
    };
    writeLessons([
      synced,
      ...readLessons().filter(
        (item) => item.id !== normalized.id && item.id !== synced.id,
      ),
    ]);
    if (queued) updateOperationStatus(queued.id, "synced");
    return synced;
  } catch {
    return normalized;
  }
}

export async function deleteLesson(id: string): Promise<void> {
  await assertSubscriptionWriteAllowed();
  const previous = readLessons().find((item) => item.id === id);
  writeLessons(readLessons().filter((item) => item.id !== id));
  const status = await resolveStorageStatus();
  const queued = enqueueBusinessOperation(
    {
      module: "lessons",
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
  if (status.mode !== "cloud") return;
  try {
    if (!queued) throw new Error("Opération de suppression absente de la file locale.");
    await createSupabaseSyncTransport().execute(queued);
    if (queued) updateOperationStatus(queued.id, "synced");
  } catch {
    /* la suppression locale reste prioritaire hors ligne */
  }
}

export async function getLesson(id: string): Promise<LessonRecord | null> {
  const local = readLessons().find((item) => item.id === id);
  if (local) return local;
  return (await listLessons()).find((item) => item.id === id) || null;
}

export async function syncLocalLessons(): Promise<{
  synced: number;
  failed: number;
}> {
  const status = await resolveStorageStatus();
  if (status.mode !== "cloud")
    throw new Error(
      "Connectez-vous à Supabase avant de transférer vos fiches locales.",
    );
  const local = readLessons().filter((item) => item.syncState !== "synced");
  let synced = 0;
  let failed = 0;
  for (const record of local) {
    const result = await saveLesson(record);
    if (result.syncState === "synced") synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}
