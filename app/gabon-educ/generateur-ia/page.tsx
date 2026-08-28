import { AICourseGenerator } from "@/components/AICourseGenerator";
import { Suspense } from "react";
import { RequireRole } from "@/components/RequireRole";
import { PEDAGOGY_ROLES } from "@/lib/roles/page-policies";
export default function GenerateurIAPage(){ return <RequireRole allow={PEDAGOGY_ROLES} what="Le générateur pédagogique"><Suspense fallback={<main className="ai-page"><div className="classes-loading">Chargement du moteur…</div></main>}><AICourseGenerator /></Suspense></RequireRole>; }
