import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SchoolRole } from "@/lib/platform/types";
import { hasAnyAllowedRole, readDemoRole } from "./current-role";

const allowed: SchoolRole[] = [
  "school_admin",
  "headmaster",
  "academic_director",
  "secretary",
];

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

describe("protection de la page Communication", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("document", { cookie: "" });
  });

  it("autorise uniquement les quatre rôles administratifs demandés", () => {
    for (const role of allowed) {
      expect(hasAnyAllowedRole([role], allowed), role).toBe(true);
    }
    for (const role of [
      "teacher",
      "head_teacher",
      "guardian",
      "student",
      "supervisor",
    ] as const) {
      expect(hasAnyAllowedRole([role], allowed), role).toBe(false);
    }
  });

  it("conserve l'accès de la démonstration administrative", () => {
    storage.setItem(
      "gabon-educ-demo-user",
      JSON.stringify({ role: "school_admin", firstName: "Administration" }),
    );
    vi.stubGlobal("document", { cookie: "gabon-educ-demo-session=1" });

    const role = readDemoRole();
    expect(role).toBe("school_admin");
    expect(hasAnyAllowedRole(role ? [role] : [], allowed)).toBe(true);
  });

  it("n'accorde aucun droit local sans cookie de démonstration", () => {
    storage.setItem("gabon-educ-demo-user", JSON.stringify({ role: "school_admin" }));
    expect(readDemoRole()).toBeNull();
  });

  it("refuse aussi un rôle enseignant en mode démonstration", () => {
    storage.setItem("gabon-educ-demo-user", JSON.stringify({ role: "teacher" }));
    vi.stubGlobal("document", { cookie: "gabon-educ-demo-session=1" });

    const role = readDemoRole();
    expect(role).toBe("teacher");
    expect(hasAnyAllowedRole(role ? [role] : [], allowed)).toBe(false);
  });

  it("ne traite pas super_admin comme un rôle d'établissement déclaré", () => {
    expect(hasAnyAllowedRole(["super_admin"], allowed)).toBe(false);
  });
});
