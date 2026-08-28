import { describe, expect, it } from "vitest";
import { assertAllocation, buildInstallments, cancelledTotal, dailyTotal, dueTotal, fcfa, formatReceiptNumber, isOverdue, librevilleDate, librevilleYear, paidTotal, paymentMethodBreakdown, previewCollectiveAssignment, remainingTotal, requiredTotal, resolveApplicableScale, totalsBy, validateCustomInstallments } from "./calculations";

const payments = [
  { id: "p1", amountFcfa: 20000, paidAt: "2026-08-28T08:00:00Z", status: "active" as const, method: "cash" },
  { id: "p2", amountFcfa: 10000, paidAt: "2026-08-28T09:00:00Z", status: "active" as const, method: "airtel_money" },
  { id: "p3", amountFcfa: 5000, paidAt: "2026-08-27T09:00:00Z", status: "cancelled" as const, method: "cash" },
];

describe("calculs financiers FCFA", () => {
  it("calcule paiements complets, partiels, annulés et soldes", () => {
    expect(requiredTotal([{ amountFcfa: 30000 }])).toBe(30000);
    expect(paidTotal(payments)).toBe(30000);
    expect(cancelledTotal(payments)).toBe(5000);
    expect(remainingTotal(30000, 10000)).toBe(20000);
    expect(remainingTotal(30000, 30000)).toBe(0);
  });
  it("additionne plusieurs paiements partiels", () => expect(paidTotal(payments.slice(0, 2))).toBe(30000));
  it("ne qualifie pas une échéance future d'impayée", () => {
    expect(isOverdue({ id: "i", amountFcfa: 10000, dueOn: "2099-01-01" }, 0, new Date("2026-08-28"))).toBe(false);
  });
  it("calcule seulement le retard arrivé à échéance", () => {
    const installments = [{ id: "i1", amountFcfa: 30000, dueOn: "2026-01-01" }, { id: "i2", amountFcfa: 10000, dueOn: "2099-01-01" }];
    expect(dueTotal(installments, [{ paymentId: "p1", installmentId: "i1", amountFcfa: 20000 }], payments, new Date("2026-08-28"))).toBe(10000);
  });
  it("regroupe par élève, classe ou famille", () => {
    const rows = [{ key: "a", value: 10 }, { key: "a", value: 20 }, { key: "b", value: 30 }];
    expect(totalsBy(rows, row => row.key, row => row.value)).toEqual({ a: 30, b: 30 });
  });
  it("calcule le journalier et la ventilation", () => {
    expect(dailyTotal(payments, "2026-08-28")).toBe(30000);
    expect(paymentMethodBreakdown(payments)).toEqual({ cash: 20000, airtel_money: 10000 });
  });
  it("refuse incohérence, négatif, décimales et trop-perçu", () => {
    expect(() => assertAllocation(1000, [{ amountFcfa: 900 }], 1000)).toThrow();
    expect(() => assertAllocation(-1, [{ amountFcfa: 0 }], 1000)).toThrow();
    expect(() => assertAllocation(10.5, [{ amountFcfa: 10 }], 1000)).toThrow();
    expect(() => assertAllocation(2000, [{ amountFcfa: 2000 }], 1000)).toThrow();
  });
  it("neutralise NaN et les valeurs absentes", () => expect([fcfa(NaN), fcfa(null), fcfa(-2)]).toEqual([0, 0, 0]));
  it("formate les reçus", () => expect(formatReceiptNumber("rec", 2026, 12)).toBe("REC-2026-000012"));
  it("construit un échéancier entier dont la somme reste exacte",()=>{const parts=buildInstallments(10000,"2026-09-01","monthly",3);expect(parts.map(p=>p.amount_fcfa)).toEqual([3333,3333,3334]);expect(requiredTotal(parts.map(p=>({amountFcfa:p.amount_fcfa})))).toBe(10000);});
  it("résout individuel avant classe, niveau et établissement",()=>{const scales=[{id:"school",scopeType:"school" as const},{id:"level",scopeType:"level" as const,gradeLevelId:"l"},{id:"class",scopeType:"class" as const,classGroupId:"c"},{id:"student",scopeType:"student" as const,studentId:"s"}];expect(resolveApplicableScale(scales,{studentId:"s",classGroupId:"c",gradeLevelId:"l"})?.id).toBe("student");expect(resolveApplicableScale(scales.slice(0,3),{studentId:"s",classGroupId:"c",gradeLevelId:"l"})?.id).toBe("class");expect(resolveApplicableScale(scales.slice(0,2),{studentId:"s",classGroupId:"c",gradeLevelId:"l"})?.id).toBe("level");});
  it("valide un échéancier personnalisé exact et refuse les incomplets",()=>{expect(validateCustomInstallments(10000,[{label:"Septembre",due_on:"2026-09-01",amount_fcfa:4000,position:1},{label:"Octobre",due_on:"2026-10-01",amount_fcfa:6000,position:2}])).toHaveLength(2);expect(()=>validateCustomInstallments(10000,[])).toThrow();expect(()=>validateCustomInstallments(10000,[{label:"",due_on:"",amount_fcfa:0,position:1}])).toThrow();});
  it("génère paiement unique, mensuel et trimestriel avec reliquat",()=>{expect(buildInstallments(100,"2026-09-01","single",9)).toHaveLength(1);expect(buildInstallments(100,"2026-09-01","monthly",3).map(x=>x.amount_fcfa)).toEqual([33,33,34]);expect(buildInstallments(100,"2026-09-01","quarterly",3).map(x=>x.due_on)).toEqual(["2026-09-01","2026-12-01","2027-03-01"]);});
  it("rattache minuit et le changement d’année à Libreville",()=>{expect(librevilleDate("2026-08-27T23:30:00Z")).toBe("2026-08-28");expect(librevilleDate("2026-12-31T23:30:00Z")).toBe("2027-01-01");expect(librevilleYear("2026-12-31T23:30:00Z")).toBe(2027);expect(dailyTotal([{id:"x",amountFcfa:100,paidAt:"2026-08-27T23:30:00Z",status:"active",method:"cash"}],"2026-08-28")).toBe(100);});
  it("reproduit student > class > level > school indépendamment de l’ordre",()=>{const student={id:"a",active:true,schoolId:"e",gradeLevelId:"l",classGroupId:"c"};const scales=[{id:"s",scopeType:"school" as const},{id:"l",scopeType:"level" as const,gradeLevelId:"l"},{id:"c",scopeType:"class" as const,classGroupId:"c"},{id:"a",scopeType:"student" as const,studentId:"a"}];for(const ordered of [scales,[...scales].reverse(),[scales[1],scales[3],scales[0],scales[2]]])expect(resolveApplicableScale(ordered,{studentId:student.id,classGroupId:student.classGroupId,gradeLevelId:student.gradeLevelId})?.id).toBe("a");});
  it("écarte successivement établissement, niveau et classe lorsqu’un barème plus précis existe",()=>{const students=[{id:"a",active:true,schoolId:"e",academicYearId:"y",gradeLevelId:"l",classGroupId:"c"}];const scales=[{id:"s",scopeType:"school" as const},{id:"l",scopeType:"level" as const,gradeLevelId:"l"},{id:"c",scopeType:"class" as const,classGroupId:"c"},{id:"a",scopeType:"student" as const,studentId:"a"}];for(const target of scales.slice(0,3)){const preview=previewCollectiveAssignment(students,{...target,schoolId:"e",academicYearId:"y",amountFcfa:10},scales,[]);expect(preview.overshadowedIds).toEqual(["a"]);expect(preview.pendingIds).toEqual([]);}expect(previewCollectiveAssignment(students,{...scales[3],schoolId:"e",academicYearId:"y",amountFcfa:10},scales,[]).pendingIds).toEqual(["a"]);});
  it("signale une ancienne charge moins prioritaire sans la remplacer",()=>{const students=[{id:"a",active:true,schoolId:"e",academicYearId:"y",gradeLevelId:"l",classGroupId:"c"}];const precise={id:"a",scopeType:"student" as const,studentId:"a",schoolId:"e",academicYearId:"y",amountFcfa:10};const preview=previewCollectiveAssignment(students,precise,[{id:"s",scopeType:"school"},precise],[{studentId:"a",sourceScaleId:"s"}]);expect(preview.conflictIds).toEqual(["a"]);expect(preview.pendingIds).toEqual([]);});
  it("aligne l’admissibilité sur école, année, classe et statut PostgreSQL",()=>{const students=[{id:"ok",active:true,schoolId:"e",academicYearId:"y",gradeLevelId:"l",classGroupId:"c"},{id:"missing-year",active:true,schoolId:"e",academicYearId:null,gradeLevelId:"l",classGroupId:"c"},{id:"wrong-year",active:true,schoolId:"e",academicYearId:"old",gradeLevelId:"l",classGroupId:"c"},{id:"wrong-school",active:true,schoolId:"x",academicYearId:"y",gradeLevelId:"l",classGroupId:"c"},{id:"inactive",active:false,schoolId:"e",academicYearId:"y",gradeLevelId:"l",classGroupId:"c"}];const scale={id:"c",scopeType:"class" as const,classGroupId:"c",schoolId:"e",academicYearId:"y",amountFcfa:10};const preview=previewCollectiveAssignment(students,scale,[scale],[]);expect(preview.eligibleIds).toEqual(["ok"]);expect(preview.pendingIds).toEqual(["ok"]);expect(preview.excludedIncompleteIds).toEqual(["missing-year","wrong-year","wrong-school","inactive"]);});
});
