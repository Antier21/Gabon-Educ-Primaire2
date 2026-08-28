import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { computeReceiptBalances, paymentMethodLabel } from "@/components/finance/FinanceReceipt";
import type { ChargeInstallmentRow, ChargeRow, PaymentRow } from "@/lib/finance/store";

const root=process.cwd();
const component=readFileSync(resolve(root,"components/finance/FinanceReceipt.tsx"),"utf8");
const manager=readFileSync(resolve(root,"components/finance/FinanceManager.tsx"),"utf8");
const css=readFileSync(resolve(root,"components/finance/FinanceManager.module.css"),"utf8");
const store=readFileSync(resolve(root,"lib/finance/store.ts"),"utf8");

const payment=(overrides:Partial<PaymentRow>={}):PaymentRow=>({id:"payment-1",student_id:"student-1",payer_name:"Parent Exemple",amount_fcfa:6000,paid_at:"2026-08-28T09:30:00Z",payment_method:"cash",receipt_number:"REC-2026-000001",status:"active",cancellation_reason:null,cancelled_at:null,cancelled_by:null,collected_by:"cashier-1",cashier:{first_name:"Aline",last_name:"Moussavou"},...overrides});
const charge:ChargeRow={id:"charge-1",student_id:"student-1",fee_type_id:"fee-1",source_scale_id:"scale-1",amount_fcfa:30000,status:"active",finance_fee_types:{label:"Scolarité"}};
const installment:ChargeInstallmentRow={id:"installment-1",charge_id:"charge-1",label:"Échéance 1",due_on:"2026-09-05",amount_fcfa:10000,status:"active"};

describe("impression professionnelle du reçu financier",()=>{
  it("monte un portail directement sous body et ne dépend jamais de display:none",()=>{expect(component).toContain("createPortal");expect(component).toContain("document.body.appendChild(node)");expect(component).toContain("FINANCE_PRINT_ROOT_ID");expect(css).toContain("left:-200vw");expect(css).not.toMatch(/\.printA4[^}]*display\s*:\s*none/);});
  it("refuse un rendu vide et prépare deux frames, les polices et les images avant print",()=>{expect(component).toContain("root.textContent?.trim()");expect((component.match(/await nextFrame\(\)/g)||[]).length).toBeGreaterThanOrEqual(2);expect(component).toContain("document.fonts?.ready");expect(component).toContain('querySelectorAll("img")');expect(component.indexOf("await prepareAssets(root)")).toBeLessThan(component.indexOf("window.print()"));});
  it("ajoute et retire la classe body avec un unique afterprint et un nettoyage au démontage",()=>{expect(component).toContain("classList.add(FINANCE_PRINT_BODY_CLASS)");expect(component).toContain("classList.remove(FINANCE_PRINT_BODY_CLASS)");expect(component).toContain('{once:true}');expect(component).toContain("if(printing.current)return");expect(component).toContain("cleanupRef.current();node.remove()");});
  it("masque l’application, les boutons et la navigation sur la feuille",()=>{expect(css).toContain("body.finance-receipt-printing");expect(css).toContain(".page{display:none!important}");expect(css).toContain(".noPrint,.receiptDocument button,.page nav{display:none!important}");});
  it("rend les deux pages nommées A4 et thermique 80 mm",()=>{expect(css).toContain("@page finance-a4{size:A4 portrait;margin:12mm}");expect(css).toContain("@page finance-thermal{size:80mm auto;margin:4mm}");expect(css).toContain("page:finance-a4");expect(css).toContain("page:finance-thermal");});
  it("affiche les données disponibles sans inventer de coordonnées",()=>{for(const token of ["school.logoUrl","school.name","school.address","school.phone","school.email","academicYearLabel","studentName","className","feeLabel","installmentLabel","cashierName","data.footer"])expect(component).toContain(token);expect(component).not.toContain("Utilisateur connecté");});
  it("traduit cash en Espèces et conserve le vrai caissier",()=>{expect(paymentMethodLabel("cash")).toBe("Espèces");expect(payment().cashier).toEqual({first_name:"Aline",last_name:"Moussavou"});expect(manager).toContain('payment.cashier?.first_name');});
  it("calcule 4 000 FCFA sur l’échéance et 24 000 FCFA au total depuis les données serveur actives",()=>{const current=payment();const balances=computeReceiptBalances(current,[charge],[installment],[{payment_id:current.id,charge_installment_id:installment.id,amount_fcfa:6000}],[current],installment.id);expect(balances).toEqual({installmentRemaining:4000,studentRemaining:24000});const cancelled=payment({status:"cancelled"});expect(computeReceiptBalances(cancelled,[charge],[installment],[{payment_id:cancelled.id,charge_installment_id:installment.id,amount_fcfa:6000}],[cancelled],installment.id)).toEqual({installmentRemaining:10000,studentRemaining:30000});});
  it("recharge paiements, allocations et charges avant de construire le reçu",()=>{expect(store).toContain('from("finance_payment_allocations")');expect(store).toContain("finance_payments!inner(school_id,academic_year_id)");expect(manager).toContain("const fresh=await reload(context)");expect(manager).toContain("fresh?.payments.find");expect(manager).toContain("data.allocations");});
  it("conserve strictement les migrations 100 à 103",()=>{const hashes:Record<string,string>={"100_finance_scolarite.sql":"53d263abb73aa8a20e41197cb4e36c46679830221f490c4f1331a02711cf0c80","101_finance_internal_function_privileges.sql":"e707ca867ff9ed0b7db881bce2a11fd6bf75b777f25a35e80d618467ee5bf3cc","102_student_records_academic_year_integrity.sql":"22f1846efe10d1fa7b1b558c9230d59f4f5457e296a2d0d1663a1e68bdc3d470","103_finance_receipt_sequence_ambiguity.sql":"30a29731842c96f93863449c30004baf6d972bfd0acb2c30eaa0fd3080de9b56"};for(const[name,hash]of Object.entries(hashes)){const actual=createHash("sha256").update(readFileSync(resolve(root,"supabase/migrations",name))).digest("hex");expect(actual).toBe(hash);}});
});
