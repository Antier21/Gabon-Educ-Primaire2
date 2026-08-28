"use client";

import { resolveActiveSchoolContext } from "@/lib/active-school";
import { resolveMyRoles } from "@/lib/roles/current-role";
import { createClient } from "@/lib/supabase/client";
import type { SchoolRole } from "@/lib/platform/types";
import { librevilleDate } from "@/lib/finance/calculations";

export type FinanceContext = { schoolId: string; userId: string; role: SchoolRole; academicYearId: string };
export type FeeTypeRow = { id: string; code: string; label: string; category: string; is_active: boolean; academic_year_id: string };
export type StudentRow = { id: string; first_name: string; last_name: string; registration_number: string | null; class_group_id: string | null };
export type ChargeRow = { id: string; student_id: string; fee_type_id:string; source_scale_id:string|null; amount_fcfa: number; status: string; finance_fee_types: { label: string } | null };
export type ChargeInstallmentRow = { id: string; charge_id: string; label: string; due_on: string; amount_fcfa: number; status: string };
export type PaymentRow = { id: string; student_id: string; payer_name: string; amount_fcfa: number; paid_at: string; payment_method: string; receipt_number: string; status: string; cancellation_reason: string | null; cancelled_at: string | null; cancelled_by: string | null };
export type CashClosureRow = { id:string; cash_date:string; cashier_id:string; payment_count:number; total_fcfa:number; method_totals:Record<string,number>; closed_at:string };
export type ParentFinanceSummary = { published:boolean; children:Array<{id:string;first_name:string;last_name:string;registration_number:string|null;charges:Array<{id:string;amount_fcfa:number;label:string}>;payments:Array<{id:string;amount_fcfa:number;receipt_number:string;paid_at:string;status:string}>}> };
export type FinanceSettings = { school_id: string; receipt_prefix: string; parent_publication_enabled: boolean; receipt_footer: string | null; financial_contact: string | null; print_format: "a4" | "thermal_80" };
export type ScaleRow = { id:string; fee_type_id:string; scope_type:"school"|"level"|"class"|"student"; grade_level_id:string|null;class_group_id:string|null;student_id:string|null;amount_fcfa:number; publish_to_parents:boolean };
export type GuardianRow={id:string;first_name:string;last_name:string;phone:string}; export type GuardianLinkRow={guardian_id:string;student_id:string};

function message(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error ? String(error.message) : fallback;
}

export async function resolveFinanceContext(): Promise<FinanceContext> {
  const context = await resolveActiveSchoolContext();
  if (context.mode !== "cloud") throw new Error("Le module financier nécessite une connexion Supabase active. Aucune donnée financière de démonstration n’est créée.");
  const roles = await resolveMyRoles(context.school.id);
  if (!roles) throw new Error("Aucun rôle financier actif n’a été trouvé.");
  const client = createClient();
  const { data, error } = await client.from("academic_years").select("id").eq("school_id", context.school.id).eq("is_current", true).eq("is_archived", false).maybeSingle();
  if (error) throw new Error(message(error, "Impossible de lire l’année scolaire active."));
  if (!data?.id) throw new Error("Aucune année scolaire active n’est configurée.");
  return { schoolId: context.school.id, userId: context.userId, role: roles.primary, academicYearId: String(data.id) };
}

export async function loadFinanceData(context: FinanceContext) {
  const client = createClient();
  const [fees, scales, students, guardians, links, charges, installments, payments, settings, classes, closures] = await Promise.all([
    client.from("finance_fee_types").select("id,code,label,category,is_active,academic_year_id").eq("school_id", context.schoolId).eq("academic_year_id", context.academicYearId).order("display_order"),
    client.from("finance_fee_scales").select("id,fee_type_id,scope_type,grade_level_id,class_group_id,student_id,amount_fcfa,publish_to_parents").eq("school_id",context.schoolId).eq("academic_year_id",context.academicYearId).eq("is_active",true),
    client.from("student_records").select("id,first_name,last_name,registration_number,class_group_id").eq("school_id", context.schoolId).eq("status", "active").order("last_name"),
    client.from("guardians").select("id,first_name,last_name,phone").eq("school_id",context.schoolId).eq("status","active").order("last_name"),
    client.from("guardian_student_links").select("guardian_id,student_id").eq("school_id",context.schoolId),
    client.from("finance_student_charges").select("id,student_id,fee_type_id,source_scale_id,amount_fcfa,status,finance_fee_types(label)").eq("school_id", context.schoolId).eq("academic_year_id", context.academicYearId),
    client.from("finance_charge_installments").select("id,charge_id,label,due_on,amount_fcfa,status,finance_student_charges!inner(school_id,academic_year_id)").eq("finance_student_charges.school_id", context.schoolId).eq("finance_student_charges.academic_year_id", context.academicYearId),
    client.from("finance_payments").select("id,student_id,payer_name,amount_fcfa,paid_at,payment_method,receipt_number,status,cancellation_reason,cancelled_at,cancelled_by").eq("school_id", context.schoolId).eq("academic_year_id", context.academicYearId).order("paid_at", { ascending: false }).limit(250),
    client.from("finance_settings").select("school_id,receipt_prefix,parent_publication_enabled,receipt_footer,financial_contact,print_format").eq("school_id", context.schoolId).maybeSingle(),
    client.from("class_groups").select("id,name,grade_level_id,grade_levels(id,name,code)").eq("school_id", context.schoolId).eq("academic_year_id", context.academicYearId).order("name"),
    client.from("finance_cash_closures").select("id,cash_date,cashier_id,payment_count,total_fcfa,method_totals,closed_at").eq("school_id",context.schoolId).order("cash_date",{ascending:false}).limit(100),
  ]);
  const failed = [fees,scales,students,guardians,links,charges,installments,payments,settings,classes,closures].find(result => result.error)?.error;
  if (failed) throw new Error(message(failed, "Impossible de charger les données financières. Vérifiez que la migration 100 est appliquée."));
  return {
    fees: (fees.data || []) as FeeTypeRow[], scales:(scales.data||[]) as ScaleRow[], students: (students.data || []) as StudentRow[], guardians:(guardians.data||[]) as GuardianRow[],links:(links.data||[]) as GuardianLinkRow[],charges: (charges.data || []) as unknown as ChargeRow[], installments: (installments.data || []) as unknown as ChargeInstallmentRow[],
    payments: (payments.data || []) as PaymentRow[], settings: (settings.data as FinanceSettings | null) || null,
    classes: (classes.data || []) as unknown as Array<{id:string;name:string;grade_level_id:string;grade_levels:{id:string;name:string;code:string}|null}>,
    closures:(closures.data||[]) as CashClosureRow[],
  };
}

export async function saveFeeType(context: FinanceContext, input: { code: string; label: string; category: string }) {
  const { error } = await createClient().from("finance_fee_types").insert({ school_id: context.schoolId, academic_year_id: context.academicYearId, code: input.code.trim().toUpperCase(), label: input.label.trim(), category: input.category, created_by: context.userId });
  if (error) throw new Error(message(error, "Création du type de frais impossible."));
}

export async function saveSettings(context: FinanceContext, settings: Omit<FinanceSettings,"school_id">) {
  const { error } = await createClient().from("finance_settings").upsert({ school_id: context.schoolId, ...settings, updated_by: context.userId });
  if (error) throw new Error(message(error, "Enregistrement des paramètres impossible."));
}

export async function configureScale(context:FinanceContext,input:{feeTypeId:string;scopeType:string;gradeLevelId?:string;classGroupId?:string;studentId?:string;amountFcfa:number;publish:boolean;mode:string;installments:Array<{label:string;due_on:string;amount_fcfa:number;position:number}>}){
 const payload={school_id:context.schoolId,academic_year_id:context.academicYearId,fee_type_id:input.feeTypeId,scope_type:input.scopeType,grade_level_id:input.gradeLevelId||null,class_group_id:input.classGroupId||null,student_id:input.studentId||null,amount_fcfa:input.amountFcfa,effective_on:librevilleDate(),publish_to_parents:input.publish,mode:input.mode,installments:input.installments};
 const {error}=await createClient().rpc("configure_finance_scale",{payload});if(error)throw new Error(message(error,"Création du barème impossible."));
}
export async function assignCharge(scaleId:string,studentId:string){const{error}=await createClient().rpc("assign_finance_charge",{target_scale:scaleId,target_student:studentId});if(error)throw new Error(message(error,"Attribution du frais impossible."));}
export async function applyScaleCollectively(scaleId:string){const{data,error}=await createClient().rpc("apply_finance_scale_collectively",{target_scale:scaleId});if(error)throw new Error(message(error,"Attribution collective impossible."));return data as {eligible_count:number;created_count:number;existing_count:number;overshadowed_count:number;conflict_count:number;amount_per_student:number;theoretical_total:number;created_total:number};}

export async function recordPayment(context: FinanceContext, input: { studentId: string; payerName: string; amountFcfa: number; method: string; installmentId: string }) {
  const payload = { school_id: context.schoolId, academic_year_id: context.academicYearId, student_id: input.studentId, payer_name: input.payerName, amount_fcfa: input.amountFcfa, payment_method: input.method, idempotency_key: crypto.randomUUID(), allocations: [{ installment_id: input.installmentId, amount_fcfa: input.amountFcfa }] };
  const { data, error } = await createClient().rpc("record_finance_payment", { payload });
  if (error) throw new Error(message(error, "Encaissement impossible."));
  return data as PaymentRow;
}

export async function cancelPayment(id: string, reason: string) {
  const { error } = await createClient().rpc("cancel_finance_payment", { payment_id: id, reason });
  if (error) throw new Error(message(error, "Annulation impossible."));
}

export async function closeCash(context: FinanceContext, date: string) {
  const { data, error } = await createClient().rpc("close_finance_cash", { target_school: context.schoolId, cash_day: date, cashier: context.userId, comment: null });
  if (error) throw new Error(message(error, "Clôture impossible."));
  return data;
}

export async function loadParentFinanceSummary(schoolId:string){
  const {data,error}=await createClient().rpc("get_my_parent_finance_summary",{target_school:schoolId});
  if(error)throw new Error(message(error,"Situation financière indisponible."));
  return data as ParentFinanceSummary;
}
