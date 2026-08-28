"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Printer } from "lucide-react";
import Image from "next/image";
import type { SchoolProfile } from "@/lib/platform/types";
import { formatFcfa, remainingTotal } from "@/lib/finance/calculations";
import type { ChargeInstallmentRow, ChargeRow, PaymentAllocationRow, PaymentRow } from "@/lib/finance/store";
import styles from "./FinanceManager.module.css";

export const FINANCE_PRINT_ROOT_ID = "finance-print-root";
export const FINANCE_PRINT_BODY_CLASS = "finance-receipt-printing";

export type FinanceReceiptData = {
  payment: PaymentRow;
  school: SchoolProfile;
  academicYearLabel: string;
  studentName: string;
  className: string;
  feeLabel: string;
  installmentLabel: string;
  installmentRemaining: number;
  studentRemaining: number;
  cashierName: string;
  footer: string | null;
  format: "a4" | "thermal_80";
};

export function paymentMethodLabel(method: string) {
  return ({cash:"Espèces",airtel_money:"Airtel Money",moov_money:"Moov Money",bank_transfer:"Virement bancaire",cheque:"Chèque",other:"Autre"} as Record<string,string>)[method] || method;
}

export function computeReceiptBalances(payment: PaymentRow, studentCharges: ChargeRow[], installments: ChargeInstallmentRow[], allocations: PaymentAllocationRow[], payments: PaymentRow[], installmentId: string) {
  const activePaymentIds = new Set(payments.filter(item => item.status === "active").map(item => item.id));
  const installment = installments.find(item => item.id === installmentId);
  const installmentPaid = allocations.filter(item => item.charge_installment_id === installmentId && activePaymentIds.has(item.payment_id)).reduce((sum,item)=>sum+item.amount_fcfa,0);
  const totalRequired = studentCharges.filter(item=>item.status === "active").reduce((sum,item)=>sum+item.amount_fcfa,0);
  const totalPaid = payments.filter(item=>item.student_id===payment.student_id&&item.status==="active").reduce((sum,item)=>sum+item.amount_fcfa,0);
  return { installmentRemaining: remainingTotal(installment?.amount_fcfa || 0, installmentPaid), studentRemaining: remainingTotal(totalRequired,totalPaid) };
}

function nextFrame() { return new Promise<void>(resolve => requestAnimationFrame(()=>resolve())); }
async function prepareAssets(root: HTMLElement) {
  await nextFrame();
  await nextFrame();
  await document.fonts?.ready;
  await Promise.all(Array.from(root.querySelectorAll("img")).map(image => image.complete ? image.decode?.().catch(()=>undefined) : new Promise<void>(resolve=>{image.addEventListener("load",()=>resolve(),{once:true});image.addEventListener("error",()=>resolve(),{once:true});})));
}

function ReceiptDocument({data}:{data:FinanceReceiptData}) {
  const contact = [data.school.address, data.school.city, data.school.phone, data.school.email].filter(Boolean);
  return <article className={styles.receiptDocument} data-print-format={data.format}>
    <header className={styles.receiptHeader}>{data.school.logoUrl&&<Image unoptimized priority src={data.school.logoUrl} alt={`Logo ${data.school.name}`} width={68} height={68}/>}<div><strong>{data.school.name}</strong>{contact.length>0&&<p>{contact.join(" · ")}</p>}</div></header>
    <section className={styles.receiptTitle}><div><small>Reçu de paiement</small><h1>{data.payment.receipt_number}</h1></div><p>{new Intl.DateTimeFormat("fr-FR",{dateStyle:"long",timeStyle:"short",timeZone:"Africa/Libreville"}).format(new Date(data.payment.paid_at))}</p></section>
    {data.payment.status==="cancelled"&&<strong className={styles.cancelled}>ANNULÉ</strong>}
    <dl className={styles.receiptDetails}>
      <dt>Année scolaire</dt><dd>{data.academicYearLabel}</dd><dt>Élève</dt><dd>{data.studentName}</dd><dt>Classe</dt><dd>{data.className}</dd>
      <dt>Type de frais</dt><dd>{data.feeLabel}</dd><dt>Échéance</dt><dd>{data.installmentLabel}</dd><dt>Payeur</dt><dd>{data.payment.payer_name}</dd>
      <dt>Montant versé</dt><dd className={styles.receiptAmount}>{formatFcfa(data.payment.amount_fcfa)}</dd><dt>Moyen</dt><dd>{paymentMethodLabel(data.payment.payment_method)}</dd><dt>Caissier</dt><dd>{data.cashierName}</dd>
      <dt>Reste de l’échéance</dt><dd>{formatFcfa(data.installmentRemaining)}</dd><dt>Reste total dû</dt><dd>{formatFcfa(data.studentRemaining)}</dd>
    </dl>
    <div className={styles.receiptSignature}>Signature et cachet</div>
    {data.footer&&<footer>{data.footer}</footer>}
  </article>;
}

export function FinanceReceipt({data,showSummary}:{data:FinanceReceiptData;showSummary:boolean}) {
  const [portal,setPortal]=useState<HTMLElement|null>(null); const printing=useRef(false); const cleanupRef=useRef<()=>void>(()=>{});
  useEffect(()=>{const node=document.createElement("div");node.id=FINANCE_PRINT_ROOT_ID;node.className=data.format==="thermal_80"?styles.printThermal:styles.printA4;document.body.appendChild(node);setPortal(node);return()=>{cleanupRef.current();node.remove();};},[data.format]);
  const print=useCallback(async()=>{if(printing.current)return;const root=document.getElementById(FINANCE_PRINT_ROOT_ID);if(!root||!root.textContent?.trim())return;printing.current=true;document.body.classList.add(FINANCE_PRINT_BODY_CLASS);const cleanup=()=>{document.body.classList.remove(FINANCE_PRINT_BODY_CLASS);window.removeEventListener("afterprint",cleanup);printing.current=false;};cleanupRef.current=cleanup;window.addEventListener("afterprint",cleanup,{once:true});try{await prepareAssets(root);window.print();}catch{cleanup();}},[]);
  return <>{showSummary&&<article className={styles.receipt} id="finance-receipt"><header><FileText/><div><h2>Reçu {data.payment.receipt_number}</h2><p>{formatFcfa(data.payment.amount_fcfa)} · {paymentMethodLabel(data.payment.payment_method)}</p></div></header><p>Reste de l’échéance : <b>{formatFcfa(data.installmentRemaining)}</b> · Reste total : <b>{formatFcfa(data.studentRemaining)}</b></p><button className={styles.noPrint} onClick={()=>void print()}><Printer/>Imprimer le reçu</button></article>}{portal&&createPortal(<ReceiptDocument data={data}/>,portal)}</>;
}
