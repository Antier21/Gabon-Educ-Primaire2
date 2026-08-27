import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SchoolProfile } from "@/lib/platform/types";
import {
  readStoredActiveSchoolId,
  resolveActiveSchoolContext,
} from "./active-school";
import { STORAGE_KEYS } from "./storage-mode";

const SCHOOL_ID = "550e8400-e29b-41d4-a716-446655440000";

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

function school(): SchoolProfile {
  return {
    id: SCHOOL_ID,
    name: "École test",
    acronym: "ET",
    schoolType: "primary",
    schoolSector: "public",
    registrationNumber: "",
    province: "Estuaire",
    city: "Libreville",
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
    periodSystem: "trimester",
    maxScore: 10,
    passThreshold: 5,
    bulletinModel: "primary",
    timezone: "Africa/Libreville",
    language: "fr",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("compatibilité de l'établissement actif", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), localStorage: storage });
    vi.stubGlobal("CustomEvent", class CustomEvent {
      constructor(public type: string, public init?: unknown) {}
    });
  });

  it("lit puis répare un UUID brut historique", () => {
    storage.setItem(STORAGE_KEYS.activeSchool, SCHOOL_ID);

    expect(readStoredActiveSchoolId(null)).toBe(SCHOOL_ID);
    expect(storage.getItem(STORAGE_KEYS.activeSchool)).toBe(JSON.stringify(SCHOOL_ID));
  });

  it("lit un UUID déjà sérialisé en JSON", () => {
    storage.setItem(STORAGE_KEYS.activeSchool, JSON.stringify(SCHOOL_ID));

    expect(readStoredActiveSchoolId(null)).toBe(SCHOOL_ID);
    expect(storage.getItem(STORAGE_KEYS.activeSchool)).toBe(JSON.stringify(SCHOOL_ID));
  });

  it("retombe sur le profil v1:school et normalise la clé active", () => {
    const profile = school();
    storage.setItem(STORAGE_KEYS.school, JSON.stringify(profile));

    expect(readStoredActiveSchoolId(profile)).toBe(SCHOOL_ID);
    expect(storage.getItem(STORAGE_KEYS.activeSchool)).toBe(JSON.stringify(SCHOOL_ID));
  });

  it("préserve la résolution locale du mode démonstration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    storage.setItem(STORAGE_KEYS.school, JSON.stringify(school()));

    await expect(resolveActiveSchoolContext()).resolves.toMatchObject({
      school: { id: SCHOOL_ID },
      userId: "local-user",
      mode: "demo",
    });
  });
});
