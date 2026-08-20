import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  backupFilename,
  collectLocalData,
  createBackup,
  parseBackup,
  previewRestore,
  restoreBackup,
} from "./backup";
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
  removeItem(key: string) {
    this.data.delete(key);
  }
}
describe("sauvegarde et restauration", () => {
  beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
  it("exclut les sessions et secrets", () => {
    localStorage.setItem(
      "gabon-educ-plus:v0.9:students",
      JSON.stringify([{ id: "1" }]),
    );
    localStorage.setItem("gabon-educ-plus:session-token", "secret");
    expect(collectLocalData()).toEqual({
      "gabon-educ-plus:v0.9:students": [{ id: "1" }],
    });
  });
  it("crée une sauvegarde versionnée", () => {
    const backup = createBackup("school", { students: [{ id: "1" }] });
    expect(backup).toMatchObject({
      format: "gabon-educ-backup",
      version: "0.9.0",
      schoolId: "school",
      modules: ["students"],
    });
    expect(backup.checksum).toHaveLength(8);
  });
  it("refuse un JSON ou format invalide", () => {
    expect(() => parseBackup("pas-json")).toThrow("JSON");
    expect(() => parseBackup("{}")).toThrow("reconnue");
  });
  it("prévisualise les conflits sans écrire", () => {
    const backup = createBackup("school", { students: [{ id: "2" }] });
    expect(previewRestore(backup, { students: [{ id: "1" }] })).toMatchObject({
      valid: true,
      conflicts: ["students"],
      itemCount: 1,
    });
  });
  it("restaure avec une stratégie explicite", () => {
    localStorage.setItem(
      "gabon-educ-plus:v0.9:students",
      JSON.stringify([{ id: "1" }]),
    );
    const backup = createBackup("school", {
      "gabon-educ-plus:v0.9:students": [{ id: "2" }],
    });
    restoreBackup(backup, localStorage, "keep_current");
    expect(
      JSON.parse(
        localStorage.getItem("gabon-educ-plus:v0.9:students") || "[]",
      )[0].id,
    ).toBe("1");
    restoreBackup(backup, localStorage, "use_backup");
    expect(
      JSON.parse(
        localStorage.getItem("gabon-educ-plus:v0.9:students") || "[]",
      )[0].id,
    ).toBe("2");
  });
  it("produit un nom explicite", () => {
    expect(backupFilename(new Date("2026-08-02T12:00:00Z"))).toBe(
      "gabon-educ-sauvegarde-v0.9.0-2026-08-02.json",
    );
  });
});
