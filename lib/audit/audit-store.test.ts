import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalAuditLog,
  createAuditEntry,
  filterAuditLog,
  logAuditAction,
  readAuditLog,
  sanitizeAuditData,
} from "./audit-store";
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
describe("journal d’audit", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("window", { dispatchEvent: () => true });
    vi.stubGlobal("CustomEvent", class {});
    vi.stubGlobal("crypto", { randomUUID: () => "audit-1" });
  });
  it("retire les secrets", () => {
    expect(
      sanitizeAuditData({
        name: "A",
        password: "secret",
        accessToken: "token",
      }),
    ).toEqual({ name: "A" });
  });
  it("crée une entrée horodatée", () => {
    expect(
      createAuditEntry({
        userId: "u",
        schoolId: "s",
        role: "admin",
        action: "create",
        module: "students",
        entityId: "e",
        status: "success",
        message: "Créé",
      }),
    ).toMatchObject({ id: "audit-1", before: null, after: null });
  });
  it("journalise et relit", () => {
    logAuditAction({
      userId: "u",
      schoolId: "s",
      role: "admin",
      action: "import",
      module: "students",
      entityId: "job",
      status: "success",
      message: "Import réussi",
    });
    expect(readAuditLog()).toHaveLength(1);
  });
  it("filtre par établissement et recherche", () => {
    logAuditAction({
      userId: "u",
      schoolId: "s",
      role: "admin",
      action: "import",
      module: "students",
      entityId: "job",
      status: "success",
      message: "Import réussi",
    });
    expect(filterAuditLog({ schoolId: "s", query: "réussi" })).toHaveLength(1);
    expect(filterAuditLog({ schoolId: "other" })).toEqual([]);
  });
  it("efface uniquement le journal local", () => {
    logAuditAction({
      userId: "u",
      schoolId: "s",
      role: "admin",
      action: "create",
      module: "students",
      entityId: "e",
      status: "success",
      message: "",
    });
    clearLocalAuditLog();
    expect(readAuditLog()).toEqual([]);
  });
});
