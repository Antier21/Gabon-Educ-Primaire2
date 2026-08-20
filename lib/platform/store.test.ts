import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createModuleRepository,
  defaultPlatformWorkspace,
  loadPlatformWorkspace,
  readPlatformWorkspace,
  savePlatformWorkspace,
} from "./store";
import { PRODUCT } from "@/lib/product-edition";

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

describe("stockage local plateforme", () => {
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
  });
  it("expose load, save, update, remove, sync et retry", async () => {
    const repository = createModuleRepository<{ id: string; label: string }>(
      "test",
    );
    expect(repository.load()).toEqual([]);
    repository.save([{ id: "1", label: "A" }]);
    expect(repository.update({ id: "1", label: "B" })[0].label).toBe("B");
    expect(repository.remove("1")).toEqual([]);
    expect((await repository.sync()).mode).toBe("demo");
    expect((await repository.retry()).mode).toBe("demo");
  });
  it("conserve la plateforme sans Supabase", async () => {
    localStorage.setItem(
      "gabon-educ:subscription-write-cache",
      JSON.stringify({ schoolId: "s", canWrite: true, checkedAt: new Date().toISOString() }),
    );
    const input = {
      ...structuredClone(defaultPlatformWorkspace),
      school: {
        id: "s",
        name: "École",
        acronym: "",
        schoolType: PRODUCT.defaultSchoolType,
        schoolSector: "private" as const,
        registrationNumber: "",
        province: "",
        city: "",
        district: "",
        neighborhood: "",
        address: "",
        phone: "",
        email: "",
        website: "",
        logoUrl: "",
        stampUrl: "",
        headName: "",
        motto: "",
        activeAcademicYearId: "",
        periodSystem: "trimester" as const,
        maxScore: PRODUCT.maxScore,
        passThreshold: PRODUCT.passThreshold,
        bulletinModel: "",
        timezone: "Africa/Libreville",
        language: "fr",
        isActive: true,
        createdAt: "",
        updatedAt: "",
      },
    };
    const result = await savePlatformWorkspace(input, {
      module: "settings",
      operation: "update",
      entityId: "s",
      payload: { schoolId: "s" },
    });
    expect(result.mode).toBe("demo");
    expect(readPlatformWorkspace().school?.name).toBe("École");
    expect((await loadPlatformWorkspace()).workspace.school?.id).toBe("s");
  });
  it("rend un élève de Mes classes disponible dans tous les modules", () => {
    localStorage.setItem(
      "gabon-educ-plus:v2:classes",
      JSON.stringify([
        {
          id: "class-1",
          name: "5e A1",
          level: "5e",
          academicYear: "2026-2027",
          room: "",
          mainSubject: "Français",
          updatedAt: "2026-08-03T20:00:00.000Z",
          students: [
            {
              id: "student-1",
              firstName: "Élise",
              lastName: "Ondo",
              email: "",
              updatedAt: "2026-08-03T20:00:00.000Z",
            },
          ],
        },
      ]),
    );
    const workspace = readPlatformWorkspace();
    expect(workspace.students).toEqual([
      expect.objectContaining({
        id: "student-1",
        classId: "class-1",
        firstName: "Élise",
        lastName: "Ondo",
      }),
    ]);
  });
});
