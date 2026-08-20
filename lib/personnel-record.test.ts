import { describe, expect, it, vi } from "vitest";
import { buildSchoolStaffPayload, personnelErrorMessage } from "./personnel-record";

describe("buildSchoolStaffPayload", () => {
  it("applique les valeurs automatiques sans envoyer de chaînes vides", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    const payload = buildSchoolStaffPayload(
      { first_name: " Aline ", last_name: "NZI", employee_number: "", job_title: "", hire_date: "" },
      "school-1",
      "2026-08-14",
    );

    expect(payload).toMatchObject({
      school_id: "school-1",
      employee_number: "PERS-1234",
      first_name: "Aline",
      last_name: "NZI",
      job_title: "Personnel",
      hire_date: "2026-08-14",
      contract_type: "Autre",
      years_experience: 0,
      phone: null,
    });
    vi.restoreAllMocks();
  });

  it("refuse un dossier sans identité", () => {
    expect(() => buildSchoolStaffPayload({}, "school-1")).toThrow("prénom et le nom");
  });
});

describe("personnelErrorMessage", () => {
  it("traduit les erreurs de sécurité Supabase", () => {
    expect(personnelErrorMessage(new Error("new row violates row-level security policy"))).toContain("migrations du registre Personnel");
  });
  it("affiche le contenu d’une erreur Supabase structurée", () => {
    expect(personnelErrorMessage({
      message: "insert interdit",
      details: "membership absente",
      hint: "vérifier la policy",
      code: "42501",
    })).toBe("insert interdit — membership absente — vérifier la policy — Code : 42501");
  });
});
