"use client";
import Link from "next/link";
import { useEffect,useState } from "react";
import { ArrowLeft, CalendarDays, CreditCard, ShieldCheck } from "lucide-react";
import { loadCurrentSubscription } from "@/lib/subscriptions/client";
import type { SubscriptionSnapshot } from "@/lib/subscriptions/types";
import { RequireRole } from "@/components/RequireRole";
import { DIRECTION_ROLES } from "@/lib/roles/page-policies";
const labels={trial:"Période pilote",active:"Actif",grace_period:"Période de grâce",suspended:"Suspendu",expired:"Expiré",cancelled:"Résilié"};
export default function SubscriptionPage(){
 const [item,setItem]=useState<SubscriptionSnapshot|null>(null); const [error,setError]=useState("");
 useEffect(()=>{loadCurrentSubscription().then(setItem).catch(()=>setError("Impossible de charger l’abonnement."));},[]);
 return <RequireRole allow={DIRECTION_ROLES} what="La gestion de l’abonnement"><main className="subscription-page"><header><Link href="/gabon-educ/administration"><ArrowLeft/>Administration</Link><div><ShieldCheck/><h1>Abonnement et licence</h1></div></header>
 {error&&<p className="subscription-error">{error}</p>}
 {!item&&!error&&<p>Chargement…</p>}
 {item&&<section className="subscription-card"><div className={`subscription-status status-${item.effective_status}`}><b>{labels[item.effective_status]}</b><span>Formule {item.plan_code}</span></div>
 <div className="subscription-details"><article><CalendarDays/><div><small>Début</small><b>{new Date(item.starts_at).toLocaleDateString("fr-FR")}</b></div></article><article><CalendarDays/><div><small>Échéance</small><b>{new Date(item.expires_at).toLocaleDateString("fr-FR")}</b></div></article><article><CreditCard/><div><small>Licence hors ligne</small><b>{item.offline_licence_expires_at?new Date(item.offline_licence_expires_at).toLocaleDateString("fr-FR"):"Non délivrée"}</b></div></article></div>
 <div className="subscription-policy"><h2>Politique appliquée</h2><p>Après l’échéance, la période de grâce maintient le service. Ensuite, les données restent consultables, mais les nouvelles créations, modifications et suppressions sont bloquées jusqu’à régularisation.</p></div>
 <button type="button">Contacter GABON Educ+ Service</button></section>}
 </main></RequireRole>;
}
