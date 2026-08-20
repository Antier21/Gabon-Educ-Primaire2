import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueBusinessOperation } from "./business-operation";
import { readSyncQueue } from "./sync-manager";

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

describe("métadonnées des opérations métier", () => {
  let sequence = 0;
  beforeEach(() => {
    sequence = 0;
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
    vi.stubGlobal("crypto", { randomUUID: () => `operation-${++sequence}` });
  });

  const queue = (
    module:
      | "announcements"
      | "classes"
      | "students"
      | "attendance"
      | "evaluations"
      | "documents",
    operation: "create" | "update",
    entityId: string,
  ) =>
    enqueueBusinessOperation({
      module,
      operation,
      entityId,
      payload: { id: entityId },
    });

  it("crée une annonce avec announcements/create", () => {
    queue("announcements", "create", "announcement-1");
    expect(readSyncQueue()[0]).toMatchObject({
      module: "announcements",
      type: "create",
      entityId: "announcement-1",
    });
  });
  it("publie une annonce avec announcements/update", () => {
    queue("announcements", "update", "announcement-1");
    expect(readSyncQueue()[0]).toMatchObject({
      module: "announcements",
      type: "update",
      entityId: "announcement-1",
    });
  });
  it.each([
    ["classes", "class-1"],
    ["students", "student-1"],
    ["attendance", "attendance-1"],
    ["evaluations", "evaluation-1"],
    ["documents", "document-1"],
  ] as const)("crée %s avec un identifiant réel", (module, entityId) => {
    queue(module, "create", entityId);
    expect(readSyncQueue()[0]).toMatchObject({
      module,
      type: "create",
      entityId,
      status: "pending",
      retryCount: 0,
    });
  });
});
