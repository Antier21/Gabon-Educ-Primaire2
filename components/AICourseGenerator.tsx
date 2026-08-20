"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Check, Clock3, FilePenLine, Gauge, GraduationCap, LoaderCircle, Save, Sparkles, WandSparkles } from "lucide-react";
import { readClasses } from "@/lib/class-store";
import { saveLesson, type LessonRecord } from "@/lib/lesson-store";
import { getDefaultLevelsForSchoolType, getDefaultSubjectsForSchoolType } from "@/lib/school-profiles";

type GeneratedStep = { id: string; title: string; duration: number; teacher: string; students: string };
type GeneratedCourse = {
  subject: string; grade: string; classGroup: string; week: number; title: string; duration: number;
  competency: string; objective: string; prerequisite: string; situationProblem: string;
  material: string; summary: string; differentiation: string; homework: string; status: "draft";
  steps: GeneratedStep[]; engineVersion?: string; pedagogicalModel?: string;
};

const subjects = getDefaultSubjectsForSchoolType("primary");
const grades = getDefaultLevelsForSchoolType("primary");
const levels = ["Hétérogène", "En difficulté", "Moyen", "Avancé"];

export function AICourseGenerator() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [classNames, setClassNames] = useState<string[]>([]);
  const [form, setForm] = useState({ subject: "Français", grade: "1ère Année", classGroup: "1ère Année A", week: 1, duration: 55, title: "", level: "Hétérogène", guidance: "" });
  const [result, setResult] = useState<GeneratedCourse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(()=>{
    setClassNames(readClasses().map(item=>item.name));
    const title=searchParams.get("title");
    if(title)setForm(current=>({...current,title,subject:searchParams.get("subject")||current.subject,grade:searchParams.get("grade")||current.grade,week:Number(searchParams.get("week")||current.week)}));
  },[searchParams]);

  const ready = useMemo(() => form.title.trim().length >= 3 && form.duration >= 20, [form]);
  function update(name: string, value: string | number) { setForm(current => ({ ...current, [name]: value })); }

  async function generate() {
    if (!ready) { setError("Indiquez un titre de leçon et une durée d’au moins 20 minutes."); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/gabon-educ/generate-course", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!response.ok) throw new Error("Génération impossible");
      setResult(await response.json());
    } catch {
      setError("Le générateur n’a pas pu produire la fiche. Réessayez.");
    } finally { setLoading(false); }
  }

  function openInWorkshop() {
    if (!result) return;
    localStorage.setItem("gabon-educ-plus-lesson-draft", JSON.stringify(result));
    router.push("/gabon-educ/preparer-un-cours?source=ia");
  }

  async function saveToLibrary(){if(!result)return;const record={...result,id:crypto.randomUUID(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()} as LessonRecord;const saved=await saveLesson(record);setNotice(saved.syncState==="synced"?"Fiche enregistrée et synchronisée.":"Fiche enregistrée localement ; synchronisation différée.");}

  return <main className="ai-page">
    <header className="builder-topbar">
      <div className="builder-top-left"><Link href="/gabon-educ/tableau-de-bord" className="icon-btn"><ArrowLeft /></Link><div><small>Assistant pédagogique</small><b>Générateur de cours IA</b></div></div>
      <Link className="btn btn-light" href="/gabon-educ/mes-fiches"><BookOpen /> Mes fiches</Link>
    </header>

    <section className="ai-shell">
      <div className="ai-intro"><span><Sparkles /></span><div><small>MOTEUR PÉDAGOGIQUE INTERNE · APC</small><h1>Transformez une intention de cours en fiche APC structurée.</h1><p>Renseignez le contexte de la séance. Le moteur interne prépare une proposition complète que vous pourrez relire, adapter et enregistrer.</p></div></div>

      <div className="ai-layout">
        <section className="ai-form-card">
          <div className="card-heading"><WandSparkles /><div><h2>Paramètres de génération</h2><p>Les informations essentielles utilisées par l’assistant.</p></div></div>
          <div className="form-grid three"><label>Matière<select value={form.subject} onChange={e=>update("subject",e.target.value)}>{subjects.map(x=><option key={x}>{x}</option>)}</select></label><label>Niveau<select value={form.grade} onChange={e=>update("grade",e.target.value)}>{grades.map(x=><option key={x}>{x}</option>)}</select></label><label>Classe <span className="optional">facultatif</span><input list="teacher-classes" value={form.classGroup} onChange={e=>update("classGroup",e.target.value)} /><datalist id="teacher-classes">{classNames.map(name=><option key={name} value={name}/>)}</datalist></label></div>
          <div className="form-grid three"><label>Semaine<input type="number" min="1" max="53" value={form.week} onChange={e=>update("week",Number(e.target.value))}/></label><label>Durée<select value={form.duration} onChange={e=>update("duration",Number(e.target.value))}><option value={40}>40 minutes</option><option value={55}>55 minutes</option><option value={90}>90 minutes</option><option value={110}>110 minutes</option></select></label><label>Niveau du groupe<select value={form.level} onChange={e=>update("level",e.target.value)}>{levels.map(x=><option key={x}>{x}</option>)}</select></label></div>
          <label>Titre ou notion à enseigner<input value={form.title} onChange={e=>update("title",e.target.value)} placeholder="Ex. L’accord du participe passé avec avoir" /></label>
          <label>Consigne particulière <span className="optional">facultatif</span><textarea value={form.guidance} onChange={e=>update("guidance",e.target.value)} placeholder="Ex. Prévoir une activité en groupes, utiliser un exemple gabonais, insister sur la remédiation…" /></label>
          {error && <div className="ai-error">{error}</div>}{notice&&<div className="save-toast static"><Check/> {notice}</div>}
          <button className="btn btn-primary full ai-generate" disabled={loading} onClick={generate}>{loading ? <><LoaderCircle className="spin" /> Construction de la fiche…</> : <><Sparkles /> Générer le cours</>}</button>
          <p className="ai-disclaimer">Le moteur 6.2 adapte maintenant la démarche, les consignes et les activités à chaque discipline. Aucune clé d’API n’est encore nécessaire.</p>
        </section>

        <aside className="ai-side-card"><h3>Ce que l’assistant prépare</h3><ul><li><Check /> Compétence et objectif</li><li><Check /> Situation-problème APC</li><li><Check /> Déroulement minuté</li><li><Check /> Actions enseignant/élèves</li><li><Check /> Trace écrite et devoir</li><li><Check /> Différenciation pédagogique</li></ul><div className="ai-note"><Gauge /><div><b>Contrôle humain obligatoire</b><p>L’enseignant reste responsable de la validation et de l’adaptation au contexte réel de sa classe.</p></div></div></aside>
      </div>

      {result && <section className="ai-result">
        <header><div><small>PROPOSITION GÉNÉRÉE</small><h2>{result.title}</h2><p>{result.subject} · {result.grade} · {result.classGroup} · Semaine {result.week}</p></div><span><Clock3 /> {result.duration} min</span></header>
        <div className="ai-result-grid"><article><GraduationCap /><b>Compétence</b><p>{result.competency}</p></article><article><FilePenLine /><b>Objectif</b><p>{result.objective}</p></article></div>
        {result.pedagogicalModel && <article className="ai-situation"><b>Modèle pédagogique retenu</b><p>{result.pedagogicalModel}</p></article>}<article className="ai-situation"><b>Situation-problème</b><p>{result.situationProblem}</p></article>
        <div className="ai-timeline">{result.steps.map((step,index)=><article key={step.id}><span>{index+1}</span><div><b>{step.title}</b><small>{step.duration} minutes</small><p><strong>Enseignant :</strong> {step.teacher}</p><p><strong>Élèves :</strong> {step.students}</p></div></article>)}</div>
        <footer><button className="btn btn-light" onClick={generate}><Sparkles /> Régénérer</button><button className="btn btn-light" onClick={()=>void saveToLibrary()}><Save/> Enregistrer dans Mes fiches</button><button className="btn btn-primary" onClick={openInWorkshop}><FilePenLine /> Ouvrir dans l’atelier</button></footer>
      </section>}
    </section>
  </main>;
}
