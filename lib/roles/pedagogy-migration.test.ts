import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/104_isoler_role_pedagogie.sql"), "utf8");

describe("migration 104 — isolation de Pédagogie", () => {
  it("ne crée aucun nouveau rôle PostgreSQL", () => {
    expect(sql).not.toMatch(/alter\s+type[\s\S]+add\s+value/i);
    expect(sql).not.toContain("'pedagogy'");
  });
  it("retire l'abonnement, l'audit, les imports et l'administration des élèves", () => {
    for (const policy of ["subscriptions_read", "audit_events_authorized_read", "import_jobs_authorized_read", "student_records_admin_write"])
      expect(sql).toContain(`drop policy if exists ${policy}`);
    expect(sql).toContain("create or replace function public.get_current_school_subscription()");
    expect(sql).toContain("array['school_admin','headmaster']");
  });
  it("est transactionnelle et retire à Pédagogie l'écriture des cahiers", () => {
    expect(sql.trimStart()).toMatch(/^--[\s\S]*?\bbegin;/i);
    expect(sql.trimEnd()).toMatch(/commit;$/i);
    expect(sql).toContain("create policy lesson_book_entries_write");
    expect(sql).toContain("create or replace function public.can_write_lesson_entry");
    const writes=sql.slice(sql.indexOf("create policy lesson_book_entries_write"));
    expect(writes).not.toContain("academic_director");
  });
  it("borne les listes de comptes et fournit une conversion atomique", () => {
    expect(sql).toContain("create or replace function public.list_school_access_users");
    expect(sql).toContain("create or replace function public.convert_school_teaching_role");
    expect(sql).toContain("trg_exclusive_teaching_role");
    expect(sql).toContain("p_user_id=auth.uid()");
  });
  it("ne touche à aucune fonction ni table financière", () => {
    expect(sql).not.toMatch(/finance_/);
  });
});
