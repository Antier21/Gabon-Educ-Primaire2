"use client";

import { queueOperation } from "./sync-manager";
import type { SyncOperationMetadata } from "./types";

export type SyncActorContext = {
  schoolId?: string;
  userId?: string;
};

export async function hashSyncValue(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Ajoute une mutation métier strictement typée à la file persistante locale. */
export function enqueueBusinessOperation(
  metadata: SyncOperationMetadata,
  context: SyncActorContext = {},
) {
  return queueOperation({
    schoolId: context.schoolId || "local",
    userId: context.userId || "local-user",
    module: metadata.module,
    type: metadata.operation,
    entityId: metadata.entityId,
    payload: metadata.payload,
    baseUpdatedAt: metadata.baseUpdatedAt ?? null,
  });
}
