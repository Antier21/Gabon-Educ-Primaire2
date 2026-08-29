import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {computeReceiptBalances,createReceiptPdf,paymentMethodLabel,receiptPdfFilename,receiptPdfRows,type FinanceReceiptData} from "@/components/finance/FinanceReceipt";
import type {ChargeInstallmentRow,ChargeRow,PaymentRow} from "@/lib/finance/store";

const root=process.cwd();
const component=readFileSync(resolve(root,"components/finance/FinanceReceipt.tsx"),"utf8");
const manager=readFileSync(resolve(root,"components/finance/FinanceManager.tsx"),"utf8");
const css=readFileSync(resolve(root,"components/finance/FinanceManager.module.css"),"utf8");
const store=readFileSync(resolve(root,"lib/finance/store.ts"),"utf8");
const packageJson=readFileSync(resolve(root,"package.json"),"utf8");
const fonts={regular:readFileSync(resolve(root,"public/fonts/Roboto-Regular.ttf")).toString("base64"),bold:readFileSync(resolve(root,"public/fonts/Roboto-Bold.ttf")).toString("base64")};

const payment=(overrides:Partial<PaymentRow>={}):PaymentRow=>({id:"payment-1",student_id:"student-1",payer_name:"Parent Exemple",amount_fcfa:6000,paid_at:"2026-08-28T09:30:00Z",payment_method:"cash",receipt_number:"REC-2026-000001",status:"active",cancellation_reason:null,cancelled_at:null,cancelled_by:null,collected_by:"cashier-1",cashier:{first_name:"Aline",last_name:"Moussavou"},...overrides});
const charge:ChargeRow={id:"charge-1",student_id:"student-1",fee_type_id:"fee-1",source_scale_id:"scale-1",amount_fcfa:30000,status:"active",finance_fee_types:{label:"Scolarité"}};
const installment:ChargeInstallmentRow={id:"installment-1",charge_id:"charge-1",label:"Échéance 1",due_on:"2026-09-05",amount_fcfa:10000,status:"active"};
const receipt=(format:"a4"|"thermal_80"="a4"):FinanceReceiptData=>({payment:payment(),school:{name:"École Test",address:"Libreville"}as FinanceReceiptData["school"],academicYearLabel:"2026-2027",studentName:"DOE Ada",className:"CM2",feeLabel:"Scolarité",installmentLabel:"Échéance 1",installmentRemaining:4000,studentRemaining:24000,cashierName:"Aline Moussavou",footer:"Merci de conserver ce reçu.",format});

describe("PDF professionnel du reçu financier",()=>{
  it("construit toutes les lignes métier du reçu",()=>{const rows=receiptPdfRows(receipt());const text=rows.flat().join(" | ");for(const value of ["2026-2027","DOE Ada","CM2","Scolarité","Échéance 1","Parent Exemple","6 000 FCFA","Espèces","Aline Moussavou","4 000 FCFA","24 000 FCFA"])expect(text).toContain(value);});
  it("génère un vrai document PDF A4 non vide avec les polices embarquées",async()=>{const document=await createReceiptPdf(receipt(),fonts);const bytes=new Uint8Array(document.output("arraybuffer"));expect(new TextDecoder().decode(bytes.slice(0,5))).toBe("%PDF-");expect(bytes.byteLength).toBeGreaterThan(10000);expect(document.internal.pageSize.getWidth()).toBeCloseTo(210,0);expect(document.internal.pageSize.getHeight()).toBeCloseTo(297,0);});
  it("génère aussi le format thermique de 80 mm",async()=>{const document=await createReceiptPdf(receipt("thermal_80"),fonts);expect(document.internal.pageSize.getWidth()).toBeCloseTo(80,0);expect(document.internal.pageSize.getHeight()).toBeCloseTo(200,0);});
  it("télécharge un PDF sans window.print, fenêtre ou iframe",()=>{expect(packageJson).toContain('"jspdf"');expect(component).toContain('await import("jspdf")');expect(component).toContain("document.save(receiptPdfFilename");expect(component).not.toContain("window.print");expect(component).not.toContain("window.open");expect(component).not.toContain('createElement("iframe")');});
  it("utilise un bouton explicite qui ne peut pas soumettre un formulaire",()=>{expect(component).toContain('type="button"');expect(component).toContain("Télécharger le reçu PDF");expect(component).toContain("Génération du PDF…");expect(component).toContain('role="alert"');});
  it("produit un nom de fichier sûr",()=>{expect(receiptPdfFilename("REC-2026-000001")).toBe("recu-REC-2026-000001.pdf");expect(receiptPdfFilename(" Reçu n° 1 ")).toBe("recu-Recu-n-1.pdf");});
  it("n’utilise plus l’impression HTML pour le récapitulatif de caisse",()=>{expect(css).toContain(".cashPrint");expect(manager).not.toContain("window.print");expect(manager).toContain("Télécharger le récapitulatif PDF");expect(manager).toContain("downloadCashSummaryPdf");});
  it("traduit cash en Espèces et conserve le vrai caissier",()=>{expect(paymentMethodLabel("cash")).toBe("Espèces");expect(payment().cashier).toEqual({first_name:"Aline",last_name:"Moussavou"});expect(manager).toContain('payment.cashier?.first_name');});
  it("calcule 4 000 FCFA sur l’échéance et 24 000 FCFA au total",()=>{const current=payment();const balances=computeReceiptBalances(current,[charge],[installment],[{payment_id:current.id,charge_installment_id:installment.id,amount_fcfa:6000}],[current],installment.id);expect(balances).toEqual({installmentRemaining:4000,studentRemaining:24000});const cancelled=payment({status:"cancelled"});expect(computeReceiptBalances(cancelled,[charge],[installment],[{payment_id:cancelled.id,charge_installment_id:installment.id,amount_fcfa:6000}],[cancelled],installment.id)).toEqual({installmentRemaining:10000,studentRemaining:30000});});
  it("recharge les données serveur avant de construire le reçu",()=>{expect(store).toContain('from("finance_payment_allocations")');expect(store).toContain("finance_payments!inner(school_id,academic_year_id)");expect(manager).toContain("const fresh=await reload(context)");expect(manager).toContain("fresh?.payments.find");expect(manager).toContain("data.allocations");});
  it("conserve strictement les migrations 100 à 103",()=>{const hashes:Record<string,string>={"100_finance_scolarite.sql":"53d263abb73aa8a20e41197cb4e36c46679830221f490c4f1331a02711cf0c80","101_finance_internal_function_privileges.sql":"e707ca867ff9ed0b7db881bce2a11fd6bf75b777f25a35e80d618467ee5bf3cc","102_student_records_academic_year_integrity.sql":"22f1846efe10d1fa7b1b558c9230d59f4f5457e296a2d0d1663a1e68bdc3d470","103_finance_receipt_sequence_ambiguity.sql":"30a29731842c96f93863449c30004baf6d972bfd0acb2c30eaa0fd3080de9b56"};for(const[name,hash]of Object.entries(hashes)){const actual=createHash("sha256").update(readFileSync(resolve(root,"supabase/migrations",name))).digest("hex");expect(actual).toBe(hash);}});
});
