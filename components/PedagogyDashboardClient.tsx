"use client";

import Link from "next/link";
import { BookOpen, CalendarDays, ClipboardCheck, GraduationCap, LogOut, MessageSquareText, School, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const groups = [
  { title: "Organisation pédagogique", links: [
    ["Classes", "/gabon-educ/classes", School], ["Matières et affectations", "/gabon-educ/matieres", BookOpen],
    ["Emplois du temps", "/gabon-educ/emplois-du-temps", CalendarDays], ["Comptes enseignants", "/gabon-educ/creer-enseignant", UserPlus],
  ]},
  { title: "Évaluations et résultats", links: [
    ["Évaluations", "/gabon-educ/evaluations", ClipboardCheck], ["Notes", "/gabon-educ/notes", GraduationCap],
    ["Bulletins", "/gabon-educ/notes-bulletins", GraduationCap], ["Modèle de bulletin", "/gabon-educ/modele-bulletin", BookOpen],
    ["Publication des bulletins", "/gabon-educ/bulletins-publication", GraduationCap],
  ]},
  { title: "Suivi pédagogique", links: [
    ["Cahiers de textes des enseignants", "/gabon-educ/pedagogie/cahiers-de-textes", BookOpen], ["Progression annuelle", "/gabon-educ/cahier-de-textes/progression", CalendarDays],
    ["Programmes APC", "/gabon-educ/programmes-apc", BookOpen], ["Fiches de préparation", "/gabon-educ/mes-fiches", ClipboardCheck],
  ]},
  { title: "Communication et vie scolaire", links: [
    ["Communication interne", "/gabon-educ/communication", MessageSquareText], ["Annonces", "/gabon-educ/annonces", MessageSquareText],
    ["Vie scolaire", "/gabon-educ/assiduite", Users],
  ]},
] as const;

export function PedagogyDashboardClient() {
  const router = useRouter();
  async function logout() { await createClient().auth.signOut(); router.push("/gabon-educ"); }
  return <main style={{minHeight:"100vh",background:"#f4f8f6",padding:"28px",color:"#14241e"}}>
    <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,maxWidth:1180,margin:"0 auto 28px"}}>
      <div><small style={{color:"#08734f",fontWeight:800}}>ESPACE AUTONOME</small><h1 style={{margin:"6px 0"}}>Pédagogie</h1><p style={{margin:0,color:"#65756f"}}>Organisation, suivi des enseignements, résultats et vie scolaire.</p></div>
      <button type="button" onClick={()=>void logout()} style={{display:"flex",gap:8,alignItems:"center",padding:"10px 14px",border:0,borderRadius:10,background:"#fff",color:"#08734f",fontWeight:700}}><LogOut size={18}/>Déconnexion</button>
    </header>
    <div style={{display:"grid",gap:22,maxWidth:1180,margin:"auto"}}>{groups.map(group=><section key={group.title}><h2>{group.title}</h2><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>{group.links.map(([label,href,Icon])=><Link key={href} href={href} style={{display:"flex",alignItems:"center",gap:12,padding:18,background:"#fff",border:"1px solid #dde8e3",borderRadius:14,fontWeight:700}}><Icon size={21} color="#08734f"/>{label}</Link>)}</div></section>)}</div>
  </main>;
}
