export type FinanceStatus = "active" | "cancelled" | "pending_cancellation";
export type FinanceInstallment = { id: string; amountFcfa: number | null; dueOn: string; };
export type FinancePayment = { id: string; amountFcfa: number | null; paidAt: string; status: FinanceStatus; method: string; };
export type FinanceAllocation = { paymentId: string; installmentId: string; amountFcfa: number | null; };
export const FINANCE_TIME_ZONE="Africa/Libreville";

export function librevilleDate(value:Date|string=new Date()):string{
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:FINANCE_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(typeof value==="string"?new Date(value):value);
 const part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(item=>item.type===type)?.value||"";
 return `${part("year")}-${part("month")}-${part("day")}`;
}
export function librevilleYear(value:Date|string=new Date()):number{return Number(librevilleDate(value).slice(0,4));}

export function fcfa(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

export function requiredTotal(items: Array<{ amountFcfa: number | null }>): number {
  return items.reduce((sum, item) => sum + fcfa(item.amountFcfa), 0);
}

export function paidTotal(payments: FinancePayment[]): number {
  return payments.filter((item) => item.status === "active").reduce((sum, item) => sum + fcfa(item.amountFcfa), 0);
}

export function cancelledTotal(payments: FinancePayment[]): number {
  return payments.filter((item) => item.status === "cancelled").reduce((sum, item) => sum + fcfa(item.amountFcfa), 0);
}

export function remainingTotal(required: number, paid: number): number {
  return Math.max(0, fcfa(required) - fcfa(paid));
}

export function dueTotal(installments: FinanceInstallment[], allocations: FinanceAllocation[], payments: FinancePayment[], today = new Date()): number {
  const active = new Set(payments.filter((item) => item.status === "active").map((item) => item.id));
  return installments.filter((item) => new Date(`${item.dueOn}T23:59:59`) <= today).reduce((sum, item) => {
    const paid = allocations.filter((allocation) => allocation.installmentId === item.id && active.has(allocation.paymentId))
      .reduce((subtotal, allocation) => subtotal + fcfa(allocation.amountFcfa), 0);
    return sum + remainingTotal(fcfa(item.amountFcfa), paid);
  }, 0);
}

export function isOverdue(installment: FinanceInstallment, paid: number, today = new Date()): boolean {
  return new Date(`${installment.dueOn}T23:59:59`) < today && fcfa(paid) < fcfa(installment.amountFcfa);
}

export function totalsBy<T>(items: T[], key: (item: T) => string, amount: (item: T) => unknown): Record<string, number> {
  return items.reduce<Record<string, number>>((totals, item) => {
    const group = key(item) || "non-classe";
    totals[group] = (totals[group] || 0) + fcfa(amount(item));
    return totals;
  }, {});
}

export function dailyTotal(payments: FinancePayment[], day: string): number {
  return paidTotal(payments.filter((item) => librevilleDate(item.paidAt) === day));
}

export function paymentMethodBreakdown(payments: FinancePayment[]): Record<string, number> {
  return totalsBy(payments.filter((item) => item.status === "active"), (item) => item.method, (item) => item.amountFcfa);
}

export function assertAllocation(paymentAmount: unknown, allocations: Array<{ amountFcfa: unknown }>, available: number): number {
  const amount = fcfa(paymentAmount);
  if (amount <= 0 || Number(paymentAmount) !== amount) throw new Error("Le montant doit être un entier FCFA strictement positif.");
  const allocated = allocations.reduce((sum, item) => sum + fcfa(item.amountFcfa), 0);
  if (allocated !== amount) throw new Error("La somme des affectations doit correspondre au paiement.");
  if (amount > fcfa(available)) throw new Error("Le montant dépasse le solde restant.");
  return amount;
}

export function formatReceiptNumber(prefix: string, year: number, sequence: number): string {
  const safePrefix = prefix.replace(/[^A-Z0-9-]/gi, "").toUpperCase().slice(0, 12) || "REC";
  return `${safePrefix}-${Math.trunc(year)}-${Math.max(1, Math.trunc(sequence)).toString().padStart(6, "0")}`;
}

export function buildInstallments(amount: unknown, firstDueOn: string, mode: "single"|"monthly"|"quarterly"|"custom", count = 1) {
  const total=fcfa(amount); const parts=mode==="single"?1:Math.max(1,Math.min(24,Math.trunc(count)));
  if(total<=0||!/^\d{4}-\d{2}-\d{2}$/.test(firstDueOn)||parts>total) throw new Error("Échéancier invalide.");
  const base=Math.floor(total/parts); const remainder=total-base*parts; const start=new Date(`${firstDueOn}T12:00:00Z`);
  return Array.from({length:parts},(_,index)=>{const due=new Date(start);due.setUTCMonth(due.getUTCMonth()+index*(mode==="quarterly"?3:1));return{label:parts===1?"Paiement unique":`Échéance ${index+1}`,due_on:due.toISOString().slice(0,10),amount_fcfa:base+(index===parts-1?remainder:0),position:index+1};});
}

export type ApplicableScale={id:string;scopeType:"school"|"level"|"class"|"student";gradeLevelId?:string|null;classGroupId?:string|null;studentId?:string|null;active?:boolean};
export function resolveApplicableScale(scales:ApplicableScale[],target:{studentId:string;classGroupId:string;gradeLevelId:string}):ApplicableScale|null{
 const active=scales.filter(scale=>scale.active!==false);
 return active.find(scale=>scale.scopeType==="student"&&scale.studentId===target.studentId)
  ||active.find(scale=>scale.scopeType==="class"&&scale.classGroupId===target.classGroupId)
  ||active.find(scale=>scale.scopeType==="level"&&scale.gradeLevelId===target.gradeLevelId)
  ||active.find(scale=>scale.scopeType==="school")||null;
}

export type CustomInstallmentInput={label:string;due_on:string;amount_fcfa:unknown;position:number};
export function validateCustomInstallments(total:unknown,rows:CustomInstallmentInput[]){
 if(!rows.length)throw new Error("Ajoutez au moins une échéance.");
 const positions=new Set<number>();
 const normalized=rows.map((row,index)=>{const amount=fcfa(row.amount_fcfa);if(!row.label.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(row.due_on)||amount<=0||Number(row.amount_fcfa)!==amount)throw new Error(`Échéance ${index+1} incomplète ou invalide.`);if(positions.has(row.position))throw new Error("Deux échéances ont la même position.");positions.add(row.position);return{label:row.label.trim(),due_on:row.due_on,amount_fcfa:amount,position:row.position};});
 if(requiredTotal(normalized.map(row=>({amountFcfa:row.amount_fcfa})))!==fcfa(total))throw new Error("La somme des échéances ne correspond pas au montant total.");
 return normalized.sort((a,b)=>a.position-b.position);
}

export function previewCollectiveAssignment(students:Array<{id:string;active:boolean;schoolId:string;academicYearId:string|null;gradeLevelId:string;classGroupId:string}>,scale:ApplicableScale&{schoolId:string;academicYearId:string;amountFcfa:number},allScales:ApplicableScale[],existingCharges:Array<{studentId:string;sourceScaleId:string|null}>){
 const inScope=(student:typeof students[number])=>scale.scopeType==="school"||(scale.scopeType==="level"&&student.gradeLevelId===scale.gradeLevelId)||(scale.scopeType==="class"&&student.classGroupId===scale.classGroupId)||(scale.scopeType==="student"&&student.id===scale.studentId);
 const scopeCandidates=students.filter(inScope);const eligible=scopeCandidates.filter(student=>student.active&&student.schoolId===scale.schoolId&&student.academicYearId===scale.academicYearId&&(scale.scopeType!=="class"&&scale.scopeType!=="level"||Boolean(student.classGroupId)&&(scale.scopeType!=="level"||Boolean(student.gradeLevelId))));
 const excluded=scopeCandidates.filter(student=>!eligible.includes(student));
 const winning=eligible.filter(student=>resolveApplicableScale(allScales,{studentId:student.id,classGroupId:student.classGroupId,gradeLevelId:student.gradeLevelId})?.id===scale.id);
 const overshadowed=eligible.filter(student=>!winning.includes(student));const existing=new Map(existingCharges.map(c=>[c.studentId,c.sourceScaleId]));
 const valid=winning.filter(student=>existing.get(student.id)===scale.id);const conflicts=winning.filter(student=>existing.has(student.id)&&existing.get(student.id)!==scale.id);const pending=winning.filter(student=>!existing.has(student.id));
 return{eligibleIds:eligible.map(s=>s.id),excludedIncompleteIds:excluded.map(s=>s.id),winningIds:winning.map(s=>s.id),overshadowedIds:overshadowed.map(s=>s.id),alreadyAssignedIds:valid.map(s=>s.id),conflictIds:conflicts.map(s=>s.id),pendingIds:pending.map(s=>s.id),amountPerStudent:fcfa(scale.amountFcfa),theoreticalTotal:winning.length*fcfa(scale.amountFcfa),newTotal:pending.length*fcfa(scale.amountFcfa)};
}

export function formatFcfa(value: unknown): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(fcfa(value))} FCFA`;
}
