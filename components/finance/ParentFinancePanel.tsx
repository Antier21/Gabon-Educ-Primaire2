"use client";

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { loadParentFinanceSummary } from "@/lib/finance/store";
import { formatFcfa, remainingTotal } from "@/lib/finance/calculations";
import styles from "./ParentFinancePanel.module.css";

type Child = { id:string; first_name:string; last_name:string; registration_number:string|null };
type Charge = { id:string; student_id:string; amount_fcfa:number; finance_fee_types:{label:string}|null };
type Payment = { id:string; student_id:string; amount_fcfa:number; receipt_number:string; paid_at:string; status:string };

export function ParentFinancePanel(){
  const [state,setState]=useState<"loading"|"hidden"|"ready"|"error">("loading"); const [message,setMessage]=useState("");
  const [children,setChildren]=useState<Child[]>([]); const [charges,setCharges]=useState<Charge[]>([]); const [payments,setPayments]=useState<Payment[]>([]);
  useEffect(()=>{void(async()=>{try{const {school}=await resolveActiveSchoolContext();const summary=await loadParentFinanceSummary(school.id);if(!summary.published){setState("hidden");return;}setChildren(summary.children.map(({id,first_name,last_name,registration_number})=>({id,first_name,last_name,registration_number})));setCharges(summary.children.flatMap(child=>child.charges.map(charge=>({id:charge.id,student_id:child.id,amount_fcfa:charge.amount_fcfa,finance_fee_types:{label:charge.label}}))));setPayments(summary.children.flatMap(child=>child.payments.map(payment=>({...payment,student_id:child.id})))) ;setState("ready");
  }catch(e){setMessage(e instanceof Error?e.message:"Situation financière indisponible.");setState("error");}})();},[]);
  if(state==="hidden")return null; if(state==="loading")return <section id="frais-de-scolarite" className={styles.panel}><p>Chargement de la situation financière…</p></section>;
  if(state==="error")return <section id="frais-de-scolarite" className={styles.panel}><h2>Frais de scolarité</h2><p className={styles.error}>{message}</p></section>;
  return <section id="frais-de-scolarite" className={styles.panel}><header><Receipt/><div><h2>Frais de scolarité</h2><p>Consultation uniquement — les encaissements sont réalisés par l’établissement.</p></div></header>{!children.length?<p>Aucun enfant lié à ce compte.</p>:children.map(child=>{const due=charges.filter(c=>c.student_id===child.id).reduce((s,c)=>s+c.amount_fcfa,0);const paid=payments.filter(p=>p.student_id===child.id&&p.status==="active").reduce((s,p)=>s+p.amount_fcfa,0);return <article key={child.id}><h3>{child.last_name} {child.first_name}</h3><div className={styles.totals}><span>Exigé <b>{formatFcfa(due)}</b></span><span>Payé <b>{formatFcfa(paid)}</b></span><span>Reste <b>{formatFcfa(remainingTotal(due,paid))}</b></span></div><ul>{payments.filter(p=>p.student_id===child.id).map(p=><li key={p.id}><span>{p.receipt_number} · {new Date(p.paid_at).toLocaleDateString("fr-FR")}</span><b>{formatFcfa(p.amount_fcfa)} {p.status==="cancelled"&&<em>ANNULÉ</em>}</b></li>)}</ul></article>})}</section>;
}
