"use client";

import {useCallback,useRef,useState} from "react";
import {FileText,Printer} from "lucide-react";
import type {jsPDF as JsPdfDocument} from "jspdf";
import type {SchoolProfile} from "@/lib/platform/types";
import {formatFcfa,remainingTotal} from "@/lib/finance/calculations";
import type {ChargeInstallmentRow,ChargeRow,PaymentAllocationRow,PaymentRow} from "@/lib/finance/store";
import styles from "./FinanceManager.module.css";

export type FinanceReceiptData={payment:PaymentRow;school:SchoolProfile;academicYearLabel:string;studentName:string;className:string;feeLabel:string;installmentLabel:string;installmentRemaining:number;studentRemaining:number;cashierName:string;footer:string|null;format:"a4"|"thermal_80"};

export function paymentMethodLabel(method:string){return({cash:"Espèces",airtel_money:"Airtel Money",moov_money:"Moov Money",bank_transfer:"Virement bancaire",cheque:"Chèque",other:"Autre"}as Record<string,string>)[method]||method;}

export function computeReceiptBalances(payment:PaymentRow,studentCharges:ChargeRow[],installments:ChargeInstallmentRow[],allocations:PaymentAllocationRow[],payments:PaymentRow[],installmentId:string){const active=new Set(payments.filter(x=>x.status==="active").map(x=>x.id));const installment=installments.find(x=>x.id===installmentId);const paid=allocations.filter(x=>x.charge_installment_id===installmentId&&active.has(x.payment_id)).reduce((sum,x)=>sum+x.amount_fcfa,0);const required=studentCharges.filter(x=>x.status==="active").reduce((sum,x)=>sum+x.amount_fcfa,0);const totalPaid=payments.filter(x=>x.student_id===payment.student_id&&x.status==="active").reduce((sum,x)=>sum+x.amount_fcfa,0);return{installmentRemaining:remainingTotal(installment?.amount_fcfa||0,paid),studentRemaining:remainingTotal(required,totalPaid)};}

function pdfFcfa(value:number){return formatFcfa(value).replace(/\u202f/g," ")}

export function receiptPdfRows(data:FinanceReceiptData):Array<[string,string]>{return[["Année scolaire",data.academicYearLabel],["Élève",data.studentName],["Classe",data.className],["Type de frais",data.feeLabel],["Échéance",data.installmentLabel],["Payeur",data.payment.payer_name],["Montant versé",pdfFcfa(data.payment.amount_fcfa)],["Moyen",paymentMethodLabel(data.payment.payment_method)],["Caissier",data.cashierName],["Reste de l’échéance",pdfFcfa(data.installmentRemaining)],["Reste total dû",pdfFcfa(data.studentRemaining)]];}

export function receiptPdfFilename(receiptNumber:string){const safe=receiptNumber.normalize("NFKD").replace(/\p{M}+/gu,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"recu";return`recu-${safe}.pdf`;}

async function imageDataUrl(source:string|null|undefined){if(!source)return null;if(source.startsWith("data:image/"))return source;try{const response=await fetch(new URL(source,window.location.href));if(!response.ok)return null;const blob=await response.blob();if(!blob.type.startsWith("image/"))return null;const bytes=new Uint8Array(await blob.arrayBuffer());let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return`data:${blob.type};base64,${btoa(binary)}`}catch{return null}}

function bytesToBase64(bytes:Uint8Array){let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary)}

export type ReceiptPdfFonts={regular:string;bold:string};

async function browserPdfFonts():Promise<ReceiptPdfFonts|null>{if(typeof window==="undefined")return null;try{const[regular,bold]=await Promise.all([fetch("/fonts/Roboto-Regular.ttf"),fetch("/fonts/Roboto-Bold.ttf")]);if(!regular.ok||!bold.ok)return null;return{regular:bytesToBase64(new Uint8Array(await regular.arrayBuffer())),bold:bytesToBase64(new Uint8Array(await bold.arrayBuffer()))}}catch{return null}}

function writeWrapped(document:JsPdfDocument,text:string,x:number,y:number,maxWidth:number,lineHeight:number){const lines=document.splitTextToSize(text||"—",maxWidth)as string[];document.text(lines,x,y);return Math.max(lineHeight,lines.length*lineHeight);}

export async function createReceiptPdf(data:FinanceReceiptData,fonts?:ReceiptPdfFonts|null){
  const {jsPDF}=await import("jspdf");
  const thermal=data.format==="thermal_80";
  const document=new jsPDF({orientation:"portrait",unit:"mm",format:thermal?[80,200]:"a4",compress:true});
  const embeddedFonts=fonts===undefined?await browserPdfFonts():fonts;
  const fontFamily=embeddedFonts?"Roboto":"helvetica";
  if(embeddedFonts){document.addFileToVFS("Roboto-Regular.ttf",embeddedFonts.regular);document.addFileToVFS("Roboto-Bold.ttf",embeddedFonts.bold);document.addFont("Roboto-Regular.ttf","Roboto","normal");document.addFont("Roboto-Bold.ttf","Roboto","bold")}
  const pageWidth=document.internal.pageSize.getWidth();
  const pageHeight=document.internal.pageSize.getHeight();
  const margin=thermal?5:15;
  const contentWidth=pageWidth-margin*2;
  const navy:[number,number,number]=[16,44,70];
  const green:[number,number,number]=[8,122,98];
  document.setFillColor(255,255,255);document.rect(0,0,pageWidth,pageHeight,"F");
  const logo=await imageDataUrl(data.school.logoUrl);
  let headerX=margin;
  if(logo){try{document.addImage(logo,margin,margin,thermal?13:18,thermal?13:18);headerX+=thermal?17:23}catch{/* Le reçu reste exploitable sans logo. */}}
  document.setTextColor(...navy);document.setFont(fontFamily,"bold");document.setFontSize(thermal?12:16);document.text(data.school.name||"Établissement",headerX,margin+6);
  const contact=[data.school.address,data.school.city,data.school.phone,data.school.email].filter(Boolean).join(" · ");
  if(contact){document.setFont(fontFamily,"normal");document.setFontSize(thermal?7:9);document.text(document.splitTextToSize(contact,pageWidth-headerX-margin),headerX,margin+11)}
  let y=margin+(thermal?20:26);document.setDrawColor(...navy);document.setLineWidth(.6);document.line(margin,y,pageWidth-margin,y);y+=thermal?7:10;
  document.setFont(fontFamily,"normal");document.setFontSize(thermal?8:10);document.setTextColor(70,86,103);document.text("REÇU DE PAIEMENT",margin,y);y+=thermal?5:7;
  document.setFont(fontFamily,"bold");document.setFontSize(thermal?15:20);document.setTextColor(...navy);document.text(data.payment.receipt_number,margin,y);
  const date=new Intl.DateTimeFormat("fr-FR",{dateStyle:"long",timeStyle:"short",timeZone:"Africa/Libreville"}).format(new Date(data.payment.paid_at));
  y+=thermal?6:8;document.setFont(fontFamily,"normal");document.setFontSize(thermal?8:9);document.text(date,margin,y);y+=thermal?7:10;
  if(data.payment.status==="cancelled"){document.setTextColor(162,15,15);document.setFont(fontFamily,"bold");document.setFontSize(thermal?15:22);document.text("ANNULÉ",pageWidth/2,y,{align:"center"});y+=thermal?8:11}
  const labelWidth=thermal?25:48;
  for(const[label,value]of receiptPdfRows(data)){
    const labelLines=document.splitTextToSize(label,labelWidth-2)as string[];
    const valueLines=document.splitTextToSize(value||"—",contentWidth-labelWidth-2)as string[];
    const rowHeight=Math.max(7,(Math.max(labelLines.length,valueLines.length)*4)+3);
    document.setFillColor(242,244,246);document.rect(margin,y,labelWidth,rowHeight,"F");
    document.setDrawColor(217,222,227);document.line(margin,y+rowHeight,pageWidth-margin,y+rowHeight);
    document.setFontSize(thermal?7.5:9);document.setTextColor(...navy);document.setFont(fontFamily,"bold");writeWrapped(document,label,margin+2,y+4.5,labelWidth-4,4);
    document.setFont(fontFamily,"normal");writeWrapped(document,value,margin+labelWidth+2,y+4.5,contentWidth-labelWidth-4,4);
    y+=rowHeight;
  }
  y+=thermal?12:18;document.setFont(fontFamily,"bold");document.setFontSize(thermal?8:10);document.text("Signature et cachet",pageWidth-margin,y,{align:"right"});
  if(data.footer){y+=thermal?8:12;document.setDrawColor(157,166,174);document.line(margin,y,pageWidth-margin,y);y+=thermal?5:7;document.setFont(fontFamily,"normal");document.setFontSize(thermal?7:8);document.setTextColor(63,75,87);document.text(document.splitTextToSize(data.footer,contentWidth),pageWidth/2,y,{align:"center"})}
  document.setDrawColor(...green);document.setLineWidth(.5);document.rect(2,2,pageWidth-4,pageHeight-4);
  return document;
}

export async function downloadReceiptPdf(data:FinanceReceiptData){const document=await createReceiptPdf(data);document.save(receiptPdfFilename(data.payment.receipt_number));}

export function FinanceReceipt({data,showSummary}:{data:FinanceReceiptData;showSummary:boolean}){const generating=useRef(false);const[isGenerating,setIsGenerating]=useState(false);const[pdfError,setPdfError]=useState<string|null>(null);const download=useCallback(async()=>{if(generating.current)return;generating.current=true;setIsGenerating(true);setPdfError(null);try{await downloadReceiptPdf(data)}catch(error){setPdfError(error instanceof Error?error.message:"La génération du PDF a échoué.")}finally{generating.current=false;setIsGenerating(false)}},[data]);if(!showSummary)return null;return <article className={styles.receipt} id="finance-receipt"><header><FileText/><div><h2>Reçu {data.payment.receipt_number}</h2><p>{formatFcfa(data.payment.amount_fcfa)} · {paymentMethodLabel(data.payment.payment_method)}</p></div></header><p>Reste de l’échéance : <b>{formatFcfa(data.installmentRemaining)}</b> · Reste total : <b>{formatFcfa(data.studentRemaining)}</b></p><button type="button" className={styles.noPrint} disabled={isGenerating} onClick={()=>void download()}><Printer/>{isGenerating?"Génération du PDF…":"Télécharger le reçu PDF"}</button>{pdfError?<p role="alert" className={styles.error}>{pdfError}</p>:null}</article>}
