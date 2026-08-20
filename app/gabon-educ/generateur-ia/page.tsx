import { AICourseGenerator } from "@/components/AICourseGenerator";
import { Suspense } from "react";
export default function GenerateurIAPage(){ return <Suspense fallback={<main className="ai-page"><div className="classes-loading">Chargement du moteur…</div></main>}><AICourseGenerator /></Suspense>; }
