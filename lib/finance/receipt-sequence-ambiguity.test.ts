import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const read=(file:string)=>readFileSync(resolve(process.cwd(),file));
const sql=read("supabase/migrations/103_finance_receipt_sequence_ambiguity.sql").toString("utf8").toLowerCase();
const hash=(file:string)=>createHash("sha256").update(read(file)).digest("hex");
const declaration=sql.slice(sql.indexOf("declare"),sql.indexOf("begin"));

describe("correction de la séquence des reçus",()=>{
 it("conserve les migrations déjà appliquées 100, 101 et 102",()=>{expect(hash("supabase/migrations/100_finance_scolarite.sql")).toBe("53d263abb73aa8a20e41197cb4e36c46679830221f490c4f1331a02711cf0c80");expect(hash("supabase/migrations/101_finance_internal_function_privileges.sql")).toBe("e707ca867ff9ed0b7db881bce2a11fd6bf75b777f25a35e80d618467ee5bf3cc");expect(hash("supabase/migrations/102_student_records_academic_year_integrity.sql")).toBe("22f1846efe10d1fa7b1b558c9230d59f4f5457e296a2d0d1663a1e68bdc3d470");});
 it("redéfinit uniquement la RPC de paiement",()=>{expect(sql.match(/create or replace function/g)).toHaveLength(1);expect(sql).toContain("function public.record_finance_payment(payload jsonb)");});
 it("supprime la variable locale ambiguë au profit de receipt_year",()=>{expect(declaration).not.toMatch(/\bsequence_year\s+integer/);expect(declaration).toContain("receipt_year integer");expect(sql).toContain("receipt_year := extract(year from now() at time zone 'africa/libreville')::integer");});
 it("cible explicitement la clé primaire de séquence",()=>{expect(sql).toContain("on conflict on constraint finance_receipt_sequences_pkey");expect(sql).not.toContain("on conflict(school_id,sequence_year)");expect(sql).toContain("values(\n   s,\n   receipt_year,\n   1\n )");});
 it("conserve le format préfixe-année-six chiffres",()=>expect(sql).toContain("prefix||'-'||receipt_year||'-'||lpad(seq::text,6,'0')"));
 it("conserve l’idempotence et ses collisions contrôlées",()=>{for(const token of ["idempotency_key=idem","pg_advisory_xact_lock(hashtextextended(s::text||':'||idem::text,0))","finance_payments_school_id_idempotency_key_key","stored_allocations=incoming_allocations"])expect(sql).toContain(token);});
 it("conserve les verrous de caisse et d’échéances",()=>{expect(sql).toContain("s::text||':'||auth.uid()::text||':'||cash_day::text");expect(sql).toContain("order by ci.id for update of ci");});
 it("conserve le fuseau et le refus après clôture",()=>{expect(sql).toContain("africa/libreville");expect(sql).toContain("finance_cash_closures");expect(sql).toContain("la caisse de ce caissier est déjà clôturée");});
 it("conserve responsable, soldes, allocations et audit",()=>{for(const token of ["guardian_student_links","le montant dépasse le solde","finance_payment_allocations","payment.recorded"])expect(sql).toContain(token);});
 it("reste security definer et réservée à authenticated",()=>{expect(sql).toContain("language plpgsql security definer set search_path=public");expect(sql).toContain("revoke all on function public.record_finance_payment(jsonb) from public, anon;");expect(sql).toContain("grant execute on function public.record_finance_payment(jsonb) to authenticated;");expect(sql.trimEnd().endsWith("notify pgrst, 'reload schema';")).toBe(true);});
});
