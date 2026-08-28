import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(file:string)=>readFileSync(resolve(process.cwd(),file));
const sql=read("supabase/migrations/102_student_records_academic_year_integrity.sql").toString("utf8").toLowerCase();
const mapping=read("lib/sync/supabase-mapping.ts").toString("utf8");
const financeSql=read("supabase/migrations/100_finance_scolarite.sql").toString("utf8").toLowerCase();
const hash=(file:string)=>createHash("sha256").update(read(file)).digest("hex");

describe("intégrité de l’année scolaire des dossiers élèves",()=>{
 it("conserve sans modification les migrations appliquées 100 et 101",()=>{expect(hash("supabase/migrations/100_finance_scolarite.sql")).toBe("53d263abb73aa8a20e41197cb4e36c46679830221f490c4f1331a02711cf0c80");expect(hash("supabase/migrations/101_finance_internal_function_privileges.sql")).toBe("e707ca867ff9ed0b7db881bce2a11fd6bf75b777f25a35e80d618467ee5bf3cc");});
 it("interrompt avant réparation si une classe appartient à une autre école",()=>{expect(sql).toContain("sr.school_id is distinct from cg.school_id");expect(sql).toContain("migration 102 interrompue");expect(sql.indexOf("migration 102 interrompue")).toBeLessThan(sql.indexOf("update public.student_records"));});
 it("répare les années nulles ou erronées depuis la classe",()=>{expect(sql).toContain("set academic_year_id = cg.academic_year_id");expect(sql).toContain("sr.academic_year_id is distinct from cg.academic_year_id");});
 it("dérive l’année à chaque inscription ou changement de classe",()=>{expect(sql).toContain("new.academic_year_id := resolved_year");expect(sql).toContain("before insert or update of school_id, class_group_id, academic_year_id");});
 it("refuse une classe absente ou d’un autre établissement",()=>{expect(sql).toContain("la classe sélectionnée est introuvable");expect(sql).toContain("resolved_school is distinct from new.school_id");expect(sql).toContain("appartient à un autre établissement");});
 it("autorise un dossier sans classe et ne rend pas l’année globalement obligatoire",()=>{expect(sql).toContain("if new.class_group_id is null then");expect(sql).not.toMatch(/alter table public\.student_records[^;]+academic_year_id[^;]+not null/);});
 it("garde le trigger interne inaccessible aux clients",()=>{expect(sql).toContain("security definer");expect(sql).toContain("set search_path = public");expect(sql).toContain("revoke all on function public.enforce_student_record_class_academic_year() from public, anon, authenticated;");});
 it("ajoute l’index de recherche et recharge PostgREST",()=>{expect(sql).toContain("student_records(school_id, academic_year_id, class_group_id, status)");expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);});
 it("transmet l’année connue et laisse le trigger dériver le parcours historique",()=>{expect(mapping).toContain("academic_year_id: uuidOrNull(item.academicYearId)");const legacy=mapping.slice(mapping.indexOf("table: \"class_students\""),mapping.indexOf("if (operation.module === \"guardians\")"));expect(legacy).not.toContain("academic_year_id: null");expect(legacy).toContain("class_group_id: operation.payload.classId");});
 it("conserve les mêmes critères SQL que la prévisualisation financière",()=>{const collective=financeSql.slice(financeSql.indexOf("function public.apply_finance_scale_collectively"),financeSql.indexOf("function public.cancel_finance_payment"));for(const criterion of ["sr.school_id=scale.school_id","sr.academic_year_id=scale.academic_year_id","sr.status='active'","sr.class_group_id=scale.class_group_id","cg.grade_level_id=scale.grade_level_id"])expect(collective).toContain(criterion);});
});
