"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, Clock3, ShieldAlert } from "lucide-react";
import { loadCurrentSubscription } from "@/lib/subscriptions/client";
import type { SubscriptionSnapshot } from "@/lib/subscriptions/types";

export function SubscriptionBanner() {
  const [item,setItem]=useState<SubscriptionSnapshot|null>(null);
  useEffect(()=>{ loadCurrentSubscription().then(setItem).catch(()=>setItem(null)); },[]);
  if(!item) return null;
  const status=item.effective_status;
  const blocked=["suspended","expired","cancelled"].includes(status);
  const warning=status==="grace_period" || status==="trial";
  if(!blocked && !warning) return null;
  return <aside className={`subscription-banner ${blocked?"blocked":"warning"}`}>
    <span>{blocked?<ShieldAlert/>:status==="trial"?<Clock3/>:<BadgeCheck/>}</span>
    <div><b>{blocked?"Abonnement à régulariser":status==="trial"?"Période pilote":"Période de grâce"}</b>
      <small>{blocked?"Consultation autorisée, créations et modifications suspendues.":`Échéance : ${new Date(item.expires_at).toLocaleDateString("fr-FR")}.`}</small></div>
    <Link href="/gabon-educ/abonnement">Voir l’abonnement</Link>
  </aside>;
}
