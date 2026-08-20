import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelOperation,
  clearCompletedOperations,
  getConnectionState,
  getSyncStatus,
  markModuleOperationsSynced,
  processQueue,
  processQueueWhenCloudAvailable,
  queueOperation,
  readSyncQueue,
  resolveConflict,
  retryOperation,
  SyncConflictError,
  updateOperationStatus,
} from "./sync-manager";
import type { SyncOperation, SyncTransport } from "./types";

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
  clear() {
    this.data.clear();
  }
}
const input = {
  schoolId: "school",
  userId: "user",
  module: "students" as const,
  type: "update" as const,
  entityId: "student",
  payload: { name: "Local" },
  baseUpdatedAt: "2026-01-01T00:00:00.000Z",
};
describe("centre de synchronisation", () => {
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
    vi.stubGlobal("crypto", { randomUUID: () => "operation-1" });
  });
  it("détecte la connectivité", () => {
    expect(getConnectionState()).toBe("online");
    vi.stubGlobal("navigator", { onLine: false });
    expect(getConnectionState()).toBe("offline");
  });
  it("ajoute une opération complète", () => {
    expect(queueOperation(input)).toMatchObject({
      id: "operation-1",
      retryCount: 0,
      status: "pending",
    });
  });
  it("déduplique les modifications d’une même entité", () => {
    queueOperation(input);
    queueOperation({ ...input, payload: { name: "Révisé" } });
    expect(readSyncQueue()).toHaveLength(1);
    expect(readSyncQueue()[0].payload.name).toBe("Révisé");
  });
  it("fusionne plusieurs update sans perdre les champs précédents", () => {
    queueOperation(input);
    queueOperation({ ...input, payload: { email: "a@ecole.ga" } });
    expect(readSyncQueue()[0]).toMatchObject({
      type: "update",
      payload: { name: "Local", email: "a@ecole.ga" },
    });
  });
  it("conserve create lorsqu’il est suivi d’un update", () => {
    queueOperation({ ...input, type: "create" });
    queueOperation({ ...input, type: "update", payload: { name: "Corrigé" } });
    expect(readSyncQueue()[0]).toMatchObject({
      type: "create",
      payload: { name: "Corrigé" },
    });
  });
  it("annule create suivi de delete avant synchronisation", () => {
    queueOperation({ ...input, type: "create" });
    queueOperation({ ...input, type: "delete", payload: {} });
    expect(readSyncQueue()).toEqual([]);
  });
  it("retrouve une opération pending après rechargement du gestionnaire", () => {
    queueOperation(input);
    expect(readSyncQueue()[0].status).toBe("pending");
    expect(
      JSON.parse(
        localStorage.getItem("gabon-educ-plus:v0.9:sync-queue") || "[]",
      ),
    ).toHaveLength(1);
  });
  it("marque les opérations redondantes d’un workspace comme synchronisées", () => {
    queueOperation({ ...input, module: "grading", entityId: "score-1" });
    queueOperation({ ...input, module: "grading", entityId: "score-2" });
    queueOperation({ ...input, module: "students", entityId: "student-2" });
    markModuleOperationsSynced("grading");
    expect(
      readSyncQueue()
        .filter((item) => item.module === "grading")
        .every((item) => item.status === "synced"),
    ).toBe(true);
    expect(
      readSyncQueue().find((item) => item.module === "students")?.status,
    ).toBe("pending");
  });
  it("ne synchronise pas faussement lorsque le cloud est indisponible", async () => {
    queueOperation(input);
    const execute = vi.fn();
    await processQueueWhenCloudAvailable(false, { execute });
    expect(execute).not.toHaveBeenCalled();
    expect(readSyncQueue()[0].status).toBe("pending");
  });
  it("met à jour, annule et nettoie", () => {
    queueOperation(input);
    expect(
      updateOperationStatus("operation-1", "error", "Réseau")?.lastError,
    ).toBe("Réseau");
    cancelOperation("operation-1");
    expect(clearCompletedOperations()).toEqual([]);
  });
  it("synchronise sans perdre la charge locale", async () => {
    queueOperation(input);
    const transport: SyncTransport = {
      execute: async () => ({
        remotePayload: { name: "Local" },
        remoteUpdatedAt: "2026-01-02",
      }),
    };
    await processQueue(transport);
    expect(readSyncQueue()[0]).toMatchObject({
      status: "synced",
      payload: { name: "Local" },
    });
    expect(getSyncStatus().synced).toBe(1);
  });
  it("conserve la file hors ligne", async () => {
    queueOperation(input);
    vi.stubGlobal("navigator", { onLine: false });
    await processQueue({
      execute: async () => {
        throw new Error("ne doit pas être appelé");
      },
    });
    expect(readSyncQueue()[0].status).toBe("pending");
    expect(getSyncStatus().connection).toBe("offline");
  });
  it("signale les erreurs et autorise une nouvelle tentative", async () => {
    queueOperation(input);
    await processQueue({
      execute: async () => {
        throw new Error("Serveur indisponible");
      },
    });
    expect(readSyncQueue()[0]).toMatchObject({
      status: "error",
      retryCount: 1,
      lastError: "Serveur indisponible",
    });
    expect(retryOperation("operation-1").status).toBe("pending");
  });
  it("crée un conflit sans écrasement silencieux", async () => {
    queueOperation(input);
    await processQueue({
      execute: async () => {
        throw new SyncConflictError("Conflit", { name: "Cloud" }, "2026-02-01");
      },
    });
    expect(readSyncQueue()[0]).toMatchObject({
      status: "conflict",
      remotePayload: { name: "Cloud" },
    });
  });
  it("résout un conflit en gardant le cloud ou le local", async () => {
    queueOperation(input);
    await processQueue({
      execute: async () => {
        throw new SyncConflictError("Conflit", { name: "Cloud" }, "2026-02-01");
      },
    });
    expect(resolveConflict("operation-1", "keep_cloud").payload.name).toBe(
      "Cloud",
    );
    updateOperationStatus("operation-1", "conflict");
    expect(resolveConflict("operation-1", "keep_local").status).toBe("pending");
  });
  it("interdit la fusion automatique d’un bulletin", () => {
    const operation = {
      ...queueOperation({ ...input, module: "grading" }),
      status: "conflict",
      remotePayload: { status: "locked" },
    } as SyncOperation;
    localStorage.setItem(
      "gabon-educ-plus:v0.9:sync-queue",
      JSON.stringify([operation]),
    );
    expect(() =>
      resolveConflict("operation-1", "merge", { status: "locked" }),
    ).toThrow("bulletin");
  });
});
