import { describe, expect, it, vi } from "vitest";
import { classesToCsv, parseStudentCsv } from "./class-store";

describe("import et export des élèves", () => {
  it("importe un CSV avec en-tête", () => { vi.stubGlobal("crypto", { randomUUID: () => "id" }); expect(parseStudentCsv("Nom;Prénom;E-mail\nOndo;Élise;elise@test.ga")).toEqual([{ id: "id", lastName: "Ondo", firstName: "Élise", email: "elise@test.ga" }]); vi.unstubAllGlobals(); });
  it("exporte une liste au format français", () => { const csv = classesToCsv({ id:"c",name:"5e A1",level:"5e",room:"",academicYear:"2026-2027",mainSubject:"Français",updatedAt:"",students:[{id:"s",firstName:"Abel",lastName:"Ondo",email:"",updatedAt:""}] }); expect(csv).toContain("Nom;Prénom;E-mail"); expect(csv).toContain('"Ondo";"Abel";""'); });
});
