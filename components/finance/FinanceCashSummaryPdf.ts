"use client";

import type {jsPDF as JsPdfDocument} from "jspdf";
import type {SchoolProfile} from "@/lib/platform/types";
import {formatFcfa} from "@/lib/finance/calculations";
import type {CashClosureRow,PaymentRow} from "@/lib/finance/store";
import {paymentMethodLabel,type ReceiptPdfFonts} from "./FinanceReceipt";

export type FinanceCashSummaryData={
  school:SchoolProfile;
  academicYearLabel:string;
  cashDate:string;
  cashierName:string;
  payments:PaymentRow[];
  closure:CashClosureRow|null;
  postClosureCancellations:PaymentRow[];
};

function fcfa(value:number){return formatFcfa(value).replace(/\u202f/g," ")}

function bytesToBase64(bytes:Uint8Array){let binary="";for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));return btoa(binary)}

async function browserFonts():Promise<ReceiptPdfFonts|null>{
  if(typeof window==="undefined")return null;
  try{
    const[regular,bold]=await Promise.all([fetch("/fonts/Roboto-Regular.ttf"),fetch("/fonts/Roboto-Bold.ttf")]);
    if(!regular.ok||!bold.ok)return null;
    return{regular:bytesToBase64(new Uint8Array(await regular.arrayBuffer())),bold:bytesToBase64(new Uint8Array(await bold.arrayBuffer()))};
  }catch{return null}
}

async function imageDataUrl(source:string|null|undefined){
  if(!source)return null;
  if(source.startsWith("data:image/"))return source;
  try{
    const response=await fetch(new URL(source,window.location.href));
    if(!response.ok)return null;
    const blob=await response.blob();
    if(!blob.type.startsWith("image/"))return null;
    return`data:${blob.type};base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
  }catch{return null}
}

export function cashSummaryFilename(cashDate:string){return`caisse-${/^\d{4}-\d{2}-\d{2}$/.test(cashDate)?cashDate:"jour"}.pdf`}

export function cashSummaryTotals(data:FinanceCashSummaryData){
  const paymentCount=data.closure?.payment_count??data.payments.length;
  const total=data.closure?.total_fcfa??data.payments.reduce((sum,payment)=>sum+payment.amount_fcfa,0);
  const methods=data.closure?.method_totals??data.payments.reduce<Record<string,number>>((result,payment)=>{
    result[payment.payment_method]=(result[payment.payment_method]||0)+payment.amount_fcfa;
    return result;
  },{});
  return{paymentCount,total,methods};
}

function setFont(document:JsPdfDocument,fonts:ReceiptPdfFonts|null){
  if(!fonts)return"helvetica";
  document.addFileToVFS("Roboto-Regular.ttf",fonts.regular);
  document.addFileToVFS("Roboto-Bold.ttf",fonts.bold);
  document.addFont("Roboto-Regular.ttf","Roboto","normal");
  document.addFont("Roboto-Bold.ttf","Roboto","bold");
  return"Roboto";
}

export async function createCashSummaryPdf(data:FinanceCashSummaryData,fonts?:ReceiptPdfFonts|null){
  const{jsPDF}=await import("jspdf");
  const document=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
  const fontFamily=setFont(document,fonts===undefined?await browserFonts():fonts);
  const pageWidth=document.internal.pageSize.getWidth();
  const pageHeight=document.internal.pageSize.getHeight();
  const margin=15;
  const contentWidth=pageWidth-margin*2;
  const navy:[number,number,number]=[16,44,70];
  const green:[number,number,number]=[8,122,98];
  const totals=cashSummaryTotals(data);
  let page=1;
  let y=15;

  const paintPage=()=>{
    document.setFillColor(255,255,255);document.rect(0,0,pageWidth,pageHeight,"F");
    document.setDrawColor(...green);document.setLineWidth(.5);document.rect(2,2,pageWidth-4,pageHeight-4);
  };
  const footer=()=>{
    document.setFont(fontFamily,"normal");document.setFontSize(7.5);document.setTextColor(90,100,110);
    document.text(`${data.school.name||"Établissement"} · Page ${page}`,pageWidth/2,pageHeight-7,{align:"center"});
  };
  const nextPage=()=>{footer();document.addPage();page+=1;paintPage();y=15;};
  const ensure=(height:number)=>{if(y+height>pageHeight-16)nextPage();};

  paintPage();
  const logo=await imageDataUrl(data.school.logoUrl);
  let headerX=margin;
  if(logo){try{document.addImage(logo,margin,y,18,18);headerX+=23}catch{/* Le document reste utilisable sans logo. */}}
  document.setTextColor(...navy);document.setFont(fontFamily,"bold");document.setFontSize(16);document.text(data.school.name||"Établissement",headerX,y+6);
  const contact=[data.school.address,data.school.city,data.school.phone,data.school.email].filter(Boolean).join(" · ");
  if(contact){document.setFont(fontFamily,"normal");document.setFontSize(8.5);document.text(document.splitTextToSize(contact,pageWidth-headerX-margin),headerX,y+11)}
  y+=25;document.setDrawColor(...navy);document.setLineWidth(.6);document.line(margin,y,pageWidth-margin,y);y+=10;
  document.setFont(fontFamily,"bold");document.setFontSize(19);document.setTextColor(...navy);document.text("RÉCAPITULATIF DE CAISSE",margin,y);y+=8;
  const displayDate=new Intl.DateTimeFormat("fr-FR",{dateStyle:"long",timeZone:"Africa/Libreville"}).format(new Date(`${data.cashDate}T12:00:00+01:00`));
  document.setFont(fontFamily,"normal");document.setFontSize(9.5);document.text(`Journée du ${displayDate}`,margin,y);y+=5;
  document.text(`Année scolaire : ${data.academicYearLabel}`,margin,y);y+=5;
  document.text(`Caissier : ${data.cashierName||"Utilisateur connecté"}`,margin,y);y+=9;

  const boxWidth=(contentWidth-6)/2;
  document.setFillColor(242,247,250);document.roundedRect(margin,y,boxWidth,20,2,2,"F");document.roundedRect(margin+boxWidth+6,y,boxWidth,20,2,2,"F");
  document.setFont(fontFamily,"normal");document.setFontSize(8.5);document.setTextColor(70,86,103);document.text("PAIEMENTS",margin+4,y+6);document.text("TOTAL HISTORIQUE",margin+boxWidth+10,y+6);
  document.setFont(fontFamily,"bold");document.setFontSize(15);document.setTextColor(...navy);document.text(String(totals.paymentCount),margin+4,y+15);document.text(fcfa(totals.total),margin+boxWidth+10,y+15);y+=28;

  document.setFont(fontFamily,"bold");document.setFontSize(12);document.text("Répartition par moyen de paiement",margin,y);y+=6;
  const methodEntries=Object.entries(totals.methods);
  if(!methodEntries.length){document.setFont(fontFamily,"normal");document.setFontSize(9);document.text("Aucun encaissement enregistré.",margin,y);y+=8;}
  else for(const[method,amount]of methodEntries){ensure(8);document.setFillColor(247,248,249);document.rect(margin,y,contentWidth,7,"F");document.setFont(fontFamily,"normal");document.setFontSize(9);document.setTextColor(...navy);document.text(paymentMethodLabel(method),margin+2,y+4.7);document.setFont(fontFamily,"bold");document.text(fcfa(amount),pageWidth-margin-2,y+4.7,{align:"right"});y+=8;}

  y+=4;ensure(16);document.setFont(fontFamily,"bold");document.setFontSize(12);document.text("Détail des opérations",margin,y);y+=6;
  const drawTableHeader=()=>{document.setFillColor(...navy);document.rect(margin,y,contentWidth,8,"F");document.setTextColor(255,255,255);document.setFont(fontFamily,"bold");document.setFontSize(7.5);document.text("Reçu",margin+2,y+5.2);document.text("Heure",margin+39,y+5.2);document.text("Payeur",margin+56,y+5.2);document.text("Moyen",margin+108,y+5.2);document.text("Montant",pageWidth-margin-2,y+5.2,{align:"right"});y+=8;};
  drawTableHeader();
  if(!data.payments.length){document.setFont(fontFamily,"normal");document.setFontSize(9);document.setTextColor(...navy);document.text("Aucune opération pour cette caisse.",margin+2,y+6);y+=10;}
  else for(const payment of data.payments){ensure(10);if(y===15)drawTableHeader();const time=new Intl.DateTimeFormat("fr-FR",{hour:"2-digit",minute:"2-digit",timeZone:"Africa/Libreville"}).format(new Date(payment.paid_at));document.setDrawColor(217,222,227);document.line(margin,y+9,pageWidth-margin,y+9);document.setTextColor(...navy);document.setFont(fontFamily,"normal");document.setFontSize(7.5);document.text(payment.receipt_number,margin+2,y+5.5);document.text(time,margin+39,y+5.5);document.text(document.splitTextToSize(payment.payer_name,48)[0]||"—",margin+56,y+5.5);document.text(paymentMethodLabel(payment.payment_method),margin+108,y+5.5);document.setFont(fontFamily,"bold");document.text(fcfa(payment.amount_fcfa),pageWidth-margin-2,y+5.5,{align:"right"});y+=9;}

  if(data.closure){ensure(18);y+=5;document.setFillColor(235,247,242);document.rect(margin,y,contentWidth,12,"F");document.setFont(fontFamily,"bold");document.setFontSize(9);document.setTextColor(...green);const closedAt=new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short",timeZone:"Africa/Libreville"}).format(new Date(data.closure.closed_at));document.text(`Caisse clôturée le ${closedAt}.`,margin+3,y+7.5);y+=16;}
  if(data.postClosureCancellations.length){ensure(16);document.setFont(fontFamily,"bold");document.setFontSize(11);document.setTextColor(162,15,15);document.text("Annulations postérieures à la clôture",margin,y);y+=7;for(const payment of data.postClosureCancellations){ensure(8);document.setFont(fontFamily,"normal");document.setFontSize(8);document.text(`${payment.receipt_number} · ${fcfa(payment.amount_fcfa)} · ${payment.cancellation_reason||"Motif non renseigné"}`,margin+2,y);y+=6;}}
  footer();
  return document;
}

export async function downloadCashSummaryPdf(data:FinanceCashSummaryData){const document=await createCashSummaryPdf(data);document.save(cashSummaryFilename(data.cashDate));}
