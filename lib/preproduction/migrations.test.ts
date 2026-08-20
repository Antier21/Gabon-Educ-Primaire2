import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const names: Record<number, string> = {
  23: "sync_queue",
  24: "audit_logs",
  25: "notifications",
  26: "import_jobs",
  27: "document_versions",
  28: "report_card_versions",
  29: "data_indexes",
  30: "security_helpers",
};
const read = (number: number) =>
  readFileSync(
    `supabase/migrations/${String(number).padStart(3, "0")}_${names[number]}.sql`,
    "utf8",
  ).toLowerCase();
describe("migrations de préproduction 023 à 030", () => {
  it("respecte la séquence complète", () => {
    for (let number = 23; number <= 30; number += 1)
      expect(() => read(number)).not.toThrow();
  });
  it("active RLS sur chaque nouvelle table privée", () => {
    for (let number = 23; number <= 28; number += 1)
      expect(read(number)).toContain("enable row level security");
  });
  it("n’ouvre aucune policy privée à tous", () => {
    for (let number = 23; number <= 30; number += 1)
      expect(read(number)).not.toMatch(/using\s*\(\s*true\s*\)/);
  });
  it("rend les journaux et versions archivées append-only", () => {
    expect(read(24)).toContain("aucune policy update/delete");
    expect(read(27)).toContain("aucune policy update/delete");
    expect(read(28)).toContain("append-only");
  });
  it("centralise les fonctions de sécurité attendues", () => {
    const sql = read(30);
    for (const helper of [
      "current_school_ids",
      "has_school_role",
      "can_manage_class",
      "can_view_student",
      "can_edit_subject_scores",
      "can_validate_report_card",
    ])
      expect(sql).toContain(helper);
  });
});
