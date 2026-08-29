import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {cashSummaryFilename,cashSummaryTotals,createCashSummaryPdf,type FinanceCashSummaryData} from "@/components/finance/FinanceCashSummaryPdf";
import type {PaymentRow} from "@/lib/finance/store";

const root=process.cwd();
const fonts={regular:readFileSync(resolve(root,"public/fonts/Roboto-Regular.ttf")).toString("base64"),bold:readFileSync(resolve(root,"public/fonts/Roboto-Bold.ttf")).toString("base64")};
const manager=readFileSync(resolve(root,"components/finance/FinanceManager.tsx"),"utf8");

const payment=(overrides:Partial<PaymentRow>={}):PaymentRow=>({id:"payment-1",student_id:"student-1",payer_name:"Parent Exemple",amount_fcfa:6000,paid_at:"2026-08-29T08:30:00Z",payment_method:"cash",receipt_number:"REC-2026-000001",status:"active",cancellation_reason:null,cancelled_at:null,cancelled_by:null,collected_by:"cashier-1",cashier:{first_name:"Aline",last_name:"Moussavou"},...overrides});
const summary=(payments:PaymentRow[]=[payment()]):FinanceCashSummaryData=>({school:{name:"École Test",address:"Libreville"}as FinanceCashSummaryData["school"],academicYearLabel:"2026-2027",cashDate:"2026-08-29",cashierName:"Aline Moussavou",payments,closure:null,postClosureCancellations:[]});

describe("PDF du récapitulatif de caisse",()=>{
  it("calcule le nombre, le total et les moyens de paiement",()=>{expect(cashSummaryTotals(summary([payment(),payment({id:"payment-2",amount_fcfa:4000,payment_method:"airtel_money"})]))).toEqual({paymentCount:2,total:10000,methods:{cash:6000,airtel_money:4000}});});
  it("respecte les totaux historiques d’une caisse clôturée",()=>{const data=summary([]);data.closure={id:"closure-1",cash_date:"2026-08-29",cashier_id:"cashier-1",payment_count:3,total_fcfa:18000,method_totals:{cash:12000,airtel_money:6000},closed_at:"2026-08-29T18:00:00Z"};expect(cashSummaryTotals(data)).toEqual({paymentCount:3,total:18000,methods:{cash:12000,airtel_money:6000}});});
  it("génère un PDF A4 réellement rempli, même avec une caisse vide",async()=>{for(const data of[summary(),summary([])]){const document=await createCashSummaryPdf(data,fonts);const bytes=new Uint8Array(document.output("arraybuffer"));expect(new TextDecoder().decode(bytes.slice(0,5))).toBe("%PDF-");expect(bytes.byteLength).toBeGreaterThan(10000);expect(document.internal.pageSize.getWidth()).toBeCloseTo(210,0);expect(document.internal.pageSize.getHeight()).toBeCloseTo(297,0);}});
  it("produit un nom de fichier stable",()=>{expect(cashSummaryFilename("2026-08-29")).toBe("caisse-2026-08-29.pdf");expect(cashSummaryFilename("invalide")).toBe("caisse-jour.pdf");});
  it("retire window.print et limite la caisse au caissier connecté",()=>{expect(manager).not.toContain("window.print");expect(manager).toContain("p.collected_by===context?.userId");expect(manager).toContain("Télécharger le récapitulatif PDF");});
});
