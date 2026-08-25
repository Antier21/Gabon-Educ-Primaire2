"use client";

import {
  readLocal,
  STORAGE_KEYS,
  withTimeout,
  writeLocal,
} from "@/lib/storage-mode";
import { decideNextStep, isDue, MAX_ATTEMPTS } from "./retry-policy";
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
/**
 * Remet une opération en file.
 *
 * Une opération abandonnée repart toujours de zéro : la relancer avec son
 * compteur épuisé la ferait abandonner de nouveau au premier échec, et le
 * bouton donnerait l'impression de ne rien faire. Son délai d'attente et son
 * motif d'abandon sont effacés du même geste.
 */
export function retryOperation(id: string, resetAttempts = false) {
  const queue = readSyncQueue();
  const operation = queue.find((item) => item.id === id);
  if (!operation) throw new Error("Opération de synchronisation introuvable.");
  const reprise = resetAttempts || operation.status === "abandoned";
  if (operation.retryCount >= MAX_ATTEMPTS && !reprise)
    throw new Error("Nombre maximal de tentatives atteint.");
  const updated = {
    ...operation,
    status: "pending" as const,
    lastError: "",
    abandonReason: undefined,
    nextAttemptAt: null,
    retryCount: reprise ? 0 : operation.retryCount,
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
  priorityEntityIds?: ReadonlySet<string>,
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
  // « syncing » est inclus volontairement : une passe interrompue — onglet
  // fermé, page rechargée — laisse des opérations figées dans cet état, que
  // plus rien ne reprenait ensuite. Le traitement étant séquentiel, une telle
  // ligne ne peut être qu'un reliquat.
  const maintenant = new Date();
  // « abandoned » est exclu : une opération abandonnée ne repart que sur
  // décision explicite, depuis le centre de synchronisation.
  const waiting = queue.filter(
    (item) =>
      ["pending", "error", "syncing"].includes(item.status) &&
      item.retryCount < MAX_ATTEMPTS &&
      isDue(item.nextAttemptAt, maintenant),
  );
  // Les nouvelles opérations sont ajoutées en fin de file. Sans ce classement,
  // une limite basse ne traitait que les plus anciennes : l'action que
  // l'utilisateur vient de demander attendait derrière tout l'arriéré et ne
  // partait jamais, alors qu'une relance manuelle de sa ligne fonctionnait.
  const ordered = priorityEntityIds?.size
    ? [
        ...waiting.filter((item) => priorityEntityIds.has(item.entityId)),
        ...waiting.filter((item) => !priorityEntityIds.has(item.entityId)),
      ]
    : waiting;
  for (const original of Number.isFinite(limit) ? ordered.slice(0, limit) : ordered) {
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
        nextAttemptAt: null,
        abandonReason: undefined,
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
      const message =
        error instanceof Error ? error.message : "Erreur de synchronisation.";
      // Un conflit n'est pas un échec : il attend un arbitrage humain et ne
      // relève donc pas de la politique de reprise.
      const decision = conflict
        ? null
        : decideNextStep({
            message,
            attempt: syncing.retryCount,
            createdAt: syncing.createdAt,
            now: new Date(),
          });
      const failed = {
        ...syncing,
        status: conflict
          ? ("conflict" as const)
          : decision?.action === "abandon"
            ? ("abandoned" as const)
            : ("error" as const),
        lastError: message,
        abandonReason: decision?.action === "abandon" ? decision.reason : undefined,
        nextAttemptAt: decision?.action === "retry" ? decision.nextAttemptAt : null,
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
    abandoned: queue.filter((item) => item.status === "abandoned").length,
    lastSuccessAt: metadata.lastSuccessAt,
    lastError: metadata.lastError,
  };
}
