"use client";

import {
  readLocal,
  STORAGE_KEYS,
  withTimeout,
  writeLocal,
} from "@/lib/storage-mode";
import type {
  ConflictResolution,
  SyncEntityPayload,
  SyncMetadata,
  SyncOperation,
  SyncOperationStatus,
  SyncStatus,
  SyncTransport,
} from "./types";

const emptyMetadata: SyncMetadata = {
  lastSuccessAt: "",
  lastAttemptAt: "",
  lastError: "",
  connection: "unknown",
};
const currentTime = () => new Date().toISOString();
const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export class SyncConflictError extends Error {
  constructor(
    message: string,
    public readonly remotePayload: SyncEntityPayload,
    public readonly remoteUpdatedAt: string,
  ) {
    super(message);
    this.name = "SyncConflictError";
  }
}
export function getConnectionState() {
  if (typeof navigator === "undefined") return "unknown" as const;
  return navigator.onLine ? ("online" as const) : ("offline" as const);
}
export function readSyncQueue() {
  return readLocal<SyncOperation[]>(STORAGE_KEYS.syncQueue, []);
}
export function saveSyncQueue(queue: SyncOperation[]) {
  writeLocal(STORAGE_KEYS.syncQueue, queue);
  return queue;
}
export function readSyncMetadata() {
  return readLocal<SyncMetadata>(STORAGE_KEYS.syncMetadata, emptyMetadata);
}
function writeMetadata(metadata: SyncMetadata) {
  writeLocal(STORAGE_KEYS.syncMetadata, metadata);
  return metadata;
}
export function queueOperation(
  input: Omit<
    SyncOperation,
    | "id"
    | "createdAt"
    | "updatedAt"
    | "retryCount"
    | "lastError"
    | "status"
    | "remotePayload"
    | "remoteUpdatedAt"
  >,
) {
  const queue = readSyncQueue();
  const duplicate = queue.find(
    (item) =>
      item.schoolId === input.schoolId &&
      item.module === input.module &&
      item.entityId === input.entityId &&
      ["pending", "error"].includes(item.status),
  );
  const time = currentTime();
  if (duplicate) {
    if (duplicate.type === "create" && input.type === "delete") {
      saveSyncQueue(queue.filter((item) => item.id !== duplicate.id));
      return null;
    }
    const type =
      duplicate.type === "create"
        ? "create"
        : input.type === "delete"
          ? "delete"
          : input.type;
    const updated: SyncOperation = {
      ...duplicate,
      type,
      payload:
        type === "delete" ? {} : { ...duplicate.payload, ...input.payload },
      baseUpdatedAt: duplicate.baseUpdatedAt || input.baseUpdatedAt,
      updatedAt: time,
      status: "pending",
      lastError: "",
    };
    saveSyncQueue(
      queue.map((item) => (item.id === updated.id ? updated : item)),
    );
    return updated;
  }
  const operation: SyncOperation = {
    ...input,
    id: createId(),
    createdAt: time,
    updatedAt: time,
    retryCount: 0,
    lastError: "",
    status: "pending",
    remotePayload: null,
    remoteUpdatedAt: null,
  };
  saveSyncQueue([...queue, operation]);
  return operation;
}
export function updateOperationStatus(
  id: string,
  status: SyncOperationStatus,
  lastError = "",
) {
  const queue = readSyncQueue().map((item) =>
    item.id === id
      ? { ...item, status, lastError, updatedAt: currentTime() }
      : item,
  );
  saveSyncQueue(queue);
  return queue.find((item) => item.id === id) || null;
}
export function markModuleOperationsSynced(module: SyncOperation["module"]) {
  const time = currentTime();
  const queue = readSyncQueue().map((item) =>
    item.module === module &&
    ["pending", "error", "syncing"].includes(item.status)
      ? { ...item, status: "synced" as const, lastError: "", updatedAt: time }
      : item,
  );
  saveSyncQueue(queue);
  return queue;
}
export function cancelOperation(id: string) {
  return updateOperationStatus(id, "cancelled");
}
export function clearCompletedOperations() {
  const queue = readSyncQueue().filter(
    (item) =>
      !(["synced", "cancelled"] as SyncOperationStatus[]).includes(item.status),
  );
  saveSyncQueue(queue);
  return queue;
}
export function retryOperation(id: string, resetAttempts = false) {
  const queue = readSyncQueue();
  const operation = queue.find((item) => item.id === id);
  if (!operation) throw new Error("Opération de synchronisation introuvable.");
  if (operation.retryCount >= 5 && !resetAttempts)
    throw new Error("Nombre maximal de tentatives atteint.");
  const updated = {
    ...operation,
    status: "pending" as const,
    lastError: "",
    retryCount: resetAttempts ? 0 : operation.retryCount,
    updatedAt: currentTime(),
  };
  saveSyncQueue(queue.map((item) => (item.id === id ? updated : item)));
  return updated;
}
export function resolveConflict(
  id: string,
  resolution: ConflictResolution,
  mergedPayload?: SyncEntityPayload,
) {
  const queue = readSyncQueue(),
    operation = queue.find((item) => item.id === id);
  if (!operation || operation.status !== "conflict")
    throw new Error("Conflit introuvable.");
  if (resolution === "keep_cloud") {
    const done = {
      ...operation,
      status: "synced" as const,
      payload: operation.remotePayload || operation.payload,
      updatedAt: currentTime(),
    };
    saveSyncQueue(queue.map((item) => (item.id === id ? done : item)));
    return done;
  }
  if (resolution === "merge" && !mergedPayload)
    throw new Error("La fusion manuelle doit fournir des données.");
  if (operation.module === "grading" && resolution === "merge")
    throw new Error(
      "Un bulletin en conflit ne peut pas être fusionné automatiquement.",
    );
  const pending = {
    ...operation,
    status: "pending" as const,
    payload:
      resolution === "merge"
        ? (mergedPayload as SyncEntityPayload)
        : operation.payload,
    baseUpdatedAt: operation.remoteUpdatedAt,
    remotePayload: null,
    remoteUpdatedAt: null,
    lastError: "",
    updatedAt: currentTime(),
  };
  saveSyncQueue(queue.map((item) => (item.id === id ? pending : item)));
  return pending;
}
/**
 * Traite la file de synchronisation.
 *
 * `limit` borne le nombre d'opérations tentées en une passe. Sans cette borne,
 * un enregistrement ordinaire relançait la totalité des opérations en attente :
 * chacune interroge Supabase deux à trois fois pour résoudre ses références, et
 * le navigateur finissait saturé (« ERR_INSUFFICIENT_RESOURCES »), au point que
 * l'action demandée par l'utilisateur n'aboutissait plus. Le reste de la file
 * est traité aux passes suivantes, ou d'un seul coup depuis le Centre de
 * synchronisation, qui appelle cette fonction sans limite.
 */
export async function processQueue(
  transport: SyncTransport,
  limit = Number.POSITIVE_INFINITY,
) {
  const state = getConnectionState();
  const started = currentTime();
  if (state === "offline") {
    writeMetadata({
      ...readSyncMetadata(),
      connection: "offline",
      lastAttemptAt: started,
      lastError: "Connexion indisponible.",
    });
    return readSyncQueue();
  }
  let queue = readSyncQueue();
  const waiting = queue.filter(
    (item) => ["pending", "error"].includes(item.status) && item.retryCount < 5,
  );
  for (const original of Number.isFinite(limit) ? waiting.slice(0, limit) : waiting) {
    const syncing = {
      ...original,
      status: "syncing" as const,
      retryCount: original.retryCount + 1,
      lastError: "",
      updatedAt: currentTime(),
    };
    queue = queue.map((item) => (item.id === original.id ? syncing : item));
    saveSyncQueue(queue);
    try {
      const result = await withTimeout(transport.execute(syncing), 10000);
      const synced = {
        ...syncing,
        status: "synced" as const,
        remotePayload: result.remotePayload,
        remoteUpdatedAt: result.remoteUpdatedAt,
        updatedAt: currentTime(),
      };
      queue = queue.map((item) => (item.id === synced.id ? synced : item));
      writeMetadata({
        connection: "online",
        lastAttemptAt: started,
        lastSuccessAt: currentTime(),
        lastError: "",
      });
    } catch (error) {
      const conflict = error instanceof SyncConflictError;
      const failed = {
        ...syncing,
        status: conflict ? ("conflict" as const) : ("error" as const),
        lastError:
          error instanceof Error ? error.message : "Erreur de synchronisation.",
        remotePayload: conflict ? error.remotePayload : null,
        remoteUpdatedAt: conflict ? error.remoteUpdatedAt : null,
        updatedAt: currentTime(),
      };
      queue = queue.map((item) => (item.id === failed.id ? failed : item));
      writeMetadata({
        ...readSyncMetadata(),
        connection: "online",
        lastAttemptAt: started,
        lastError: failed.lastError,
      });
    }
    saveSyncQueue(queue);
  }
  return queue;
}

/** Le mode local conserve la file et ne doit jamais invoquer le transport cloud. */
export async function processQueueWhenCloudAvailable(
  cloudAvailable: boolean,
  transport: SyncTransport,
) {
  if (!cloudAvailable) return readSyncQueue();
  return processQueue(transport);
}
export function getSyncStatus(): SyncStatus {
  const queue = readSyncQueue(),
    metadata = readSyncMetadata();
  return {
    connection:
      getConnectionState() === "unknown"
        ? metadata.connection
        : getConnectionState(),
    pending: queue.filter((item) => item.status === "pending").length,
    syncing: queue.filter((item) => item.status === "syncing").length,
    conflicts: queue.filter((item) => item.status === "conflict").length,
    errors: queue.filter((item) => item.status === "error").length,
    synced: queue.filter((item) => item.status === "synced").length,
    lastSuccessAt: metadata.lastSuccessAt,
    lastError: metadata.lastError,
  };
}
