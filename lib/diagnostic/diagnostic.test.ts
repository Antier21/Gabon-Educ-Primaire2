import { beforeEach, describe, expect, it, vi } from "vitest";
import { diagnosticChecks, estimateLocalStorageBytes } from "./diagnostic";
class MemoryStorage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
describe("diagnostic non sensible", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
  it("estime la taille sans lire de secret distant", () => {
    localStorage.setItem("a", "école");
    expect(estimateLocalStorageBytes()).toBe((1 + 5) * 2);
  });
  it("retourne des contrôles explicites", () => {
    const checks = diagnosticChecks({
      version: "0.9.0",
      environment: "test",
      supabaseConfigured: false,
      activeSchoolId: "",
      connection: "offline",
      sync: {
        connection: "offline",
        pending: 0,
        syncing: 0,
        conflicts: 0,
        errors: 0,
        synced: 0,
        lastSuccessAt: "",
        lastError: "",
      },
      localStorageBytes: 0,
      browser: "test",
      expectedMigrations: "001–030",
      recentErrors: [],
      generatedAt: "",
    });
    expect(checks.find((item) => item.label.includes("Version"))?.ok).toBe(
      true,
    );
    expect(
      checks.find((item) => item.label.includes("Établissement"))?.ok,
    ).toBe(false);
  });
});
