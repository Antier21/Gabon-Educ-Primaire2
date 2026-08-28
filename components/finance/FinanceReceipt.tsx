"use client";
import {useCallback,useRef,useState} from "react";
import {FileText,Printer} from "lucide-react";
import type {SchoolProfile} from "@/lib/platform/types";
import {formatFcfa,remainingTotal} from "@/lib/finance/calculations";
import type {ChargeInstallmentRow,ChargeRow,PaymentAllocationRow,PaymentRow} from "@/lib/finance/store";
import styles from "./FinanceManager.module.css";

export type FinanceReceiptData={payment:PaymentRow;school:SchoolProfile;academicYearLabel:string;studentName:string;className:string;feeLabel:string;installmentLabel:string;installmentRemaining:number;studentRemaining:number;cashierName:string;footer:string|null;format:"a4"|"thermal_80"};
export function paymentMethodLabel(method:string){return({cash:"Espèces",airtel_money:"Airtel Money",moov_money:"Moov Money",bank_transfer:"Virement bancaire",cheque:"Chèque",other:"Autre"}as Record<string,string>)[method]||method;}
export function computeReceiptBalances(payment:PaymentRow,studentCharges:ChargeRow[],installments:ChargeInstallmentRow[],allocations:PaymentAllocationRow[],payments:PaymentRow[],installmentId:string){const active=new Set(payments.filter(x=>x.status==="active").map(x=>x.id));const installment=installments.find(x=>x.id===installmentId);const paid=allocations.filter(x=>x.charge_installment_id===installmentId&&active.has(x.payment_id)).reduce((sum,x)=>sum+x.amount_fcfa,0);const required=studentCharges.filter(x=>x.status==="active").reduce((sum,x)=>sum+x.amount_fcfa,0);const totalPaid=payments.filter(x=>x.student_id===payment.student_id&&x.status==="active").reduce((sum,x)=>sum+x.amount_fcfa,0);return{installmentRemaining:remainingTotal(installment?.amount_fcfa||0,paid),studentRemaining:remainingTotal(required,totalPaid)};}
function esc(value:unknown){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]as string);}
function absoluteUrl(value:string|null|undefined,base:string){if(!value)return"";try{return new URL(value,base).href}catch{return""}}

export function buildReceiptPrintHtml(data:FinanceReceiptData,baseUrl:string){const thermal=data.format==="thermal_80";const contact=[data.school.address,data.school.city,data.school.phone,data.school.email].filter(Boolean).map(esc).join(" · ");const logo=absoluteUrl(data.school.logoUrl,baseUrl);const rows:[[string,string],...[string,string][]]=[["Année scolaire",data.academicYearLabel],["Élève",data.studentName],["Classe",data.className],["Type de frais",data.feeLabel],["Échéance",data.installmentLabel],["Payeur",data.payment.payer_name],["Montant versé",formatFcfa(data.payment.amount_fcfa)],["Moyen",paymentMethodLabel(data.payment.payment_method)],["Caissier",data.cashierName],["Reste de l’échéance",formatFcfa(data.installmentRemaining)],["Reste total dû",formatFcfa(data.studentRemaining)]];const details=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");const date=new Intl.DateTimeFormat("fr-FR",{dateStyle:"long",timeStyle:"short",timeZone:"Africa/Libreville"}).format(new Date(data.payment.paid_at));return`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu ${esc(data.payment.receipt_number)}</title><style>
@page{size:${thermal?"80mm auto":"A4 portrait"};margin:${thermal?"4mm":"12mm"}}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#102c46;font-family:Arial,sans-serif;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{width:${thermal?"72mm":"100%"};height:auto;margin:0 auto}.receipt{display:block;width:100%;background:#fff;break-inside:avoid;page-break-inside:avoid}.header{display:flex;align-items:center;gap:14px;padding-bottom:14px;border-bottom:2px solid #173f65}.header img{width:${thermal?52:68}px;height:${thermal?52:68}px;object-fit:contain}.header strong{font-size:1.3rem}.header p{margin:4px 0 0;font-size:.88rem}.title{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:20px 0 14px}.title h1{margin:3px 0;font-size:1.65rem}.title p{margin:0;text-align:right}.details{display:grid;grid-template-columns:${thermal?"1fr":"180px 1fr"};margin:0;border-top:1px solid #cbd2d9}.details dt,.details dd{margin:0;padding:8px 10px;border-bottom:1px solid #d9dee3;break-inside:avoid}.details dt{background:#f2f4f6;font-weight:700}.details dd{font-weight:600;overflow-wrap:anywhere}.signature{height:${thermal?55:72}px;padding-top:24px;text-align:right;font-weight:700}footer{margin-top:8px;padding-top:10px;border-top:1px solid #9da6ae;text-align:center;font-size:.82rem;white-space:pre-line}.cancelled{display:block;color:#a20f0f;font-size:2rem;text-align:center}${thermal?".header,.title{display:block;text-align:center}.title p{text-align:center}.details dt{padding-bottom:2px;border-bottom:0}.details dd{padding-top:2px}":""}@media print{html,body,.receipt{background:#fff;color:#102c46;height:auto;overflow:visible}.receipt{display:block}}</style></head><body><article class="receipt"><header class="header">${logo?`<img src="${esc(logo)}" alt="Logo ${esc(data.school.name)}">`:""}<div><strong>${esc(data.school.name)}</strong>${contact?`<p>${contact}</p>`:""}</div></header><section class="title"><div><small>Reçu de paiement</small><h1>${esc(data.payment.receipt_number)}</h1></div><p>${esc(date)}</p></section>${data.payment.status==="cancelled"?'<strong class="cancelled">ANNULÉ</strong>':""}<dl class="details">${details}</dl><div class="signature">Signature et cachet</div>${data.footer?`<footer>${esc(data.footer)}</footer>`:""}</article></body></html>`;}

async function waitForAssets(doc:Document){await doc.fonts?.ready;await Promise.all(Array.from(doc.images).map(image=>image.complete?image.decode?.().catch(()=>undefined):new Promise<void>(resolve=>{image.addEventListener("load",()=>resolve(),{once:true});image.addEventListener("error",()=>resolve(),{once:true})})));}
async function waitForDocumentLayout(doc:Document,target:Window){
  if(doc.readyState!=="complete")await new Promise<void>(resolve=>{
    const timeout=window.setTimeout(resolve,3000);
    const ready=()=>{if(doc.readyState==="complete"){clearTimeout(timeout);doc.removeEventListener("readystatechange",ready);resolve()}};
    doc.addEventListener("readystatechange",ready);
  });
  await waitForAssets(doc);
  await new Promise<void>(resolve=>{
    const timeout=window.setTimeout(resolve,2000);
    target.requestAnimationFrame(()=>target.requestAnimationFrame(()=>{clearTimeout(timeout);resolve()}));
  });
}
export async function printReceiptInIsolatedWindow(data:FinanceReceiptData){
  const target=window.open("","_blank","popup=yes,width=900,height=1000");
  if(!target)throw new Error("La fenêtre d’impression a été bloquée. Autorisez les fenêtres contextuelles pour ce site, puis réessayez.");
  target.opener=null;
  const doc=target.document;
  try{
    doc.open();
    doc.write(buildReceiptPrintHtml(data,window.location.href));
    doc.close();
    target.focus();
    await waitForDocumentLayout(doc,target);
  }catch(error){target.close();throw error}
  return new Promise<void>((resolve,reject)=>{
    let finished=false;
    const cleanup=()=>{if(finished)return;finished=true;clearTimeout(fallback);target.removeEventListener("afterprint",cleanup);if(!target.closed)target.close();resolve()};
    const fallback=window.setTimeout(cleanup,120000);
    target.addEventListener("afterprint",cleanup,{once:true});
    try{target.focus();target.print()}catch(error){finished=true;clearTimeout(fallback);target.removeEventListener("afterprint",cleanup);if(!target.closed)target.close();reject(error)}
  });
}
export function FinanceReceipt({data,showSummary}:{data:FinanceReceiptData;showSummary:boolean}){const printing=useRef(false);const[isPrinting,setIsPrinting]=useState(false);const[printError,setPrintError]=useState<string|null>(null);const print=useCallback(async()=>{if(printing.current)return;printing.current=true;setIsPrinting(true);setPrintError(null);try{await printReceiptInIsolatedWindow(data)}catch(error){setPrintError(error instanceof Error?error.message:"L’impression du reçu a échoué.")}finally{printing.current=false;setIsPrinting(false)}},[data]);if(!showSummary)return null;return <article className={styles.receipt} id="finance-receipt"><header><FileText/><div><h2>Reçu {data.payment.receipt_number}</h2><p>{formatFcfa(data.payment.amount_fcfa)} · {paymentMethodLabel(data.payment.payment_method)}</p></div></header><p>Reste de l’échéance : <b>{formatFcfa(data.installmentRemaining)}</b> · Reste total : <b>{formatFcfa(data.studentRemaining)}</b></p><button className={styles.noPrint} disabled={isPrinting} onClick={()=>void print()}><Printer/>{isPrinting?"Impression…":"Imprimer le reçu"}</button>{printError?<p role="alert" className={styles.error}>{printError}</p>:null}</article>}
