import { beforeEach, describe, expect, it, vi } from "vitest";
import { homeForRole, readCachedPrimaryRole } from "./current-role";

const CLE = "gabon-educ-plus:v1:my-school-roles";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

describe("homeForRole", () => {
  it("ramène chacun dans son espace", () => {
    expect(homeForRole("secretary")).toBe("/gabon-educ/secretariat");
    expect(homeForRole("headmaster")).toBe("/gabon-educ/administration");
    expect(homeForRole("school_admin")).toBe("/gabon-educ/administration");
    expect(homeForRole("academic_director")).toBe("/gabon-educ/administration");
    expect(homeForRole("teacher")).toBe("/gabon-educ/tableau-de-bord");
    expect(homeForRole("guardian")).toBe("/gabon-educ/espace-parent");
  });

  it("n’envoie jamais la direction ni le secrétariat vers l’espace enseignant", () => {
    // C'est le défaut constaté : la flèche de retour d'un écran partagé
    // ramenait un secrétaire dans un espace qui n'est pas le sien.
    for (const role of ["secretary", "headmaster", "school_admin", "academic_director"] as const) {
      expect(homeForRole(role)).not.toBe("/gabon-educ/tableau-de-bord");
    }
  });
});

describe("readCachedPrimaryRole", () => {
  let stockage: MemoryStorage;

  beforeEach(() => {
    stockage = new MemoryStorage();
    // « readLocal » s'adresse au global « localStorage », pas à
    // « window.localStorage » : stuber la fenêtre seule ne suffirait pas.
    vi.stubGlobal("localStorage", stockage);
    vi.stubGlobal("window", { localStorage: stockage });
  });

  it("ne rend rien quand aucun rôle n’a été mis en cache", () => {
    expect(readCachedPrimaryRole()).toBeNull();
  });

  it("retient le rôle le plus étendu d’un compte qui en cumule plusieurs", () => {
    // Un chef d'établissement qui assure quelques heures de cours reste chef
    // d'établissement : c'est son espace, pas celui de l'enseignant, qui
    // l'attend au retour.
    stockage.setItem(
      CLE,
      JSON.stringify({ userId: "u1", schoolId: "e1", roles: ["teacher", "headmaster"] }),
    );
    expect(readCachedPrimaryRole()).toBe("headmaster");
    expect(homeForRole(readCachedPrimaryRole()!)).toBe("/gabon-educ/administration");
  });

  it("ne rend rien sur un cache vide ou abîmé", () => {
    stockage.setItem(CLE, JSON.stringify({ userId: "u1", schoolId: "e1", roles: [] }));
    expect(readCachedPrimaryRole()).toBeNull();
    stockage.setItem(CLE, "{ceci n’est pas du JSON");
    expect(readCachedPrimaryRole()).toBeNull();
  });
});
