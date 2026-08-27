import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient }));

import { normalizeSchoolRole, resolveMyRoles } from "./current-role";

const SCHOOL_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "660e8400-e29b-41d4-a716-446655440000";
const ROLE_CACHE_KEY = "gabon-educ-plus:v1:my-school-roles";

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

function membershipQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: () => query,
    eq: () => query,
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  return query;
}

describe("rôles Supabase réels", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), localStorage: storage });
    vi.stubGlobal("CustomEvent", class CustomEvent {
      constructor(public type: string, public init?: unknown) {}
    });
    createClient.mockReset();
  });

  it("convertit parent en guardian et conserve les autres rôles", () => {
    expect(normalizeSchoolRole("parent")).toBe("guardian");
    for (const role of [
      "student",
      "teacher",
      "head_teacher",
      "school_admin",
      "headmaster",
    ] as const) {
      expect(normalizeSchoolRole(role)).toBe(role);
    }
  });

  it("normalise parent dans les lignes school_memberships", async () => {
    createClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }) },
      from: vi.fn(() => membershipQuery({ data: [{ role: "parent" }], error: null })),
    });

    await expect(resolveMyRoles(SCHOOL_ID)).resolves.toMatchObject({
      roles: ["guardian"],
      primary: "guardian",
      fromCache: false,
    });
  });

  it("ne transforme pas une session expirée en rôle vide", async () => {
    const from = vi.fn();
    createClient.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("session expired"),
        }),
      },
      from,
    });

    await expect(resolveMyRoles(SCHOOL_ID)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("utilise le cache normalisé lors d'une erreur réseau", async () => {
    storage.setItem(
      ROLE_CACHE_KEY,
      JSON.stringify({ userId: USER_ID, schoolId: SCHOOL_ID, roles: ["parent"] }),
    );
    createClient.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }) },
      from: vi.fn(() => membershipQuery({ data: null, error: new Error("network") })),
    });

    await expect(resolveMyRoles(SCHOOL_ID)).resolves.toMatchObject({
      roles: ["guardian"],
      primary: "guardian",
      fromCache: true,
    });
  });
});
