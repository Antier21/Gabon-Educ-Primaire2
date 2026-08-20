"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, Check, ChevronRight, Clock3, Eye, FileDown, GraduationCap, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { getLesson, saveLesson } from "@/lib/lesson-store";
import { readClasses } from "@/lib/class-store";
import { AcademicWeekStrip } from "@/components/AcademicWeekStrip";
import { TeacherWeeklyTimetable } from "@/components/TeacherWeeklyTimetable";
import { getDefaultLevelsForSchoolType, getDefaultSubjectsForSchoolType } from "@/lib/school-profiles";

type Step = { id: string; title: string; duration: number; teacher: string; students: string };
type FormState = {
  subject: string; grade: string; classGroup: string; week: number; title: string; duration: number;
  competency: string; objective: string; prerequisite: string; situationProblem: string;
  material: string; summary: string; differentiation: string; homework: string; status: "draft" | "published";
  steps: Step[];
};

const initialState: FormState = {
  subject: "Français", grade: "1ère Année", classGroup: "1ère Année A", week: 1, title: "", duration: 55,
  competency: "", objective: "", prerequisite: "", situationProblem: "", material: "",
  summary: "", differentiation: "", homework: "", status: "draft",
  steps: [
    { id: crypto.randomUUID(), title: "Mise en situation", duration: 10, teacher: "Présente la situation-problème et recueille les premières hypothèses.", students: "Observent, réagissent et formulent des hypothèses." },
    { id: crypto.randomUUID(), title: "Recherche et construction", duration: 25, teacher: "Guide l’analyse du support et organise la mise en commun.", students: "Analysent, échangent et construisent la notion." },
    { id: crypto.randomUUID(), title: "Institutionnalisation", duration: 10, teacher: "Formalise la règle ou la synthèse avec la classe.", students: "Reformulent et copient la trace écrite." },
    { id: crypto.randomUUID(), title: "Application", duration: 10, teacher: "Propose un exercice bref et accompagne la correction.", students: "Réalisent l’exercice puis justifient leurs réponses." },
  ],
};

const subjects = getDefaultSubjectsForSchoolType("primary");
const grades = getDefaultLevelsForSchoolType("primary");
const key = "gabon-educ-plus-lesson-draft";

export function LessonPlanBuilder() {
  const [form, setForm] = useState<FormState>(initialState);
  const [active, setActive] = useState(1);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [recordId, setRecordId] = useState<string | null>(null);
  const [classNames, setClassNames] = useState<string[]>([]);
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled=false;
    async function load(){try {
      setClassNames(readClasses().map(item=>item.name));
      const requestedId = searchParams.get("id");
      if (requestedId) {
        const existing = await getLesson(requestedId);
        if (existing&&!cancelled) { setForm(existing as FormState); setRecordId(requestedId); return; }
      }
      const requestedWeek = Number(searchParams.get("week") || 0);
      const title=searchParams.get("title");
      if(title&&!cancelled){setForm(current=>({...current,title,subject:searchParams.get("subject")||current.subject,grade:searchParams.get("grade")||current.grade,week:requestedWeek||current.week,objective:searchParams.get("objective")||current.objective,competency:searchParams.get("competency")||current.competency}));return;}
      const saved = localStorage.getItem(key);
      if (saved&&!cancelled) {
        const parsed = JSON.parse(saved);
        setForm({ ...parsed, week: requestedWeek || parsed.week || initialState.week });
        return;
      }
      if (requestedWeek&&!cancelled) setForm(current=>({...current, week: requestedWeek}));
    } catch {}}void load();return()=>{cancelled=true};
  }, [searchParams]);

  useEffect(() => {
    const requestedClassId = searchParams.get("classId");
    if (!requestedClassId) return;
    const requestedClass = readClasses().find((item) => item.id === requestedClassId);
    if (requestedClass) {
      setForm((current) => ({ ...current, classGroup: requestedClass.name, grade: requestedClass.level }));
    }
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => { localStorage.setItem(key, JSON.stringify(form)); }, 350);
    return () => clearTimeout(timer);
  }, [form]);

  const totalDuration = useMemo(() => form.steps.reduce((sum, step) => sum + Number(step.duration || 0), 0), [form.steps]);
  const completion = useMemo(() => {
    const values = [form.title, form.competency, form.objective, form.situationProblem, form.summary];
    return Math.round((values.filter(Boolean).length / values.length) * 100);
  }, [form]);

  function field<K extends keyof FormState>(name: K, value: FormState[K]) { setForm(current => ({ ...current, [name]: value })); }
  function updateStep(id: string, prop: keyof Step, value: string | number) {
    field("steps", form.steps.map(step => step.id === id ? { ...step, [prop]: value } : step));
  }
  function addStep() { field("steps", [...form.steps, { id: crypto.randomUUID(), title: "Nouvelle étape", duration: 10, teacher: "", students: "" }]); }
  function removeStep(id: string) { if (form.steps.length > 1) field("steps", form.steps.filter(step => step.id !== id)); }
  async function save(status: "draft" | "published" = "draft") {
    const id = recordId || crypto.randomUUID();
    const updated = { ...form, status };
    const record = { ...updated, id, updatedAt: new Date().toISOString() };
    setForm(updated); setRecordId(id); localStorage.setItem(key, JSON.stringify(updated));
    try {
      const saved=await saveLesson(record);
      setMessage(saved.syncState === "synced" ? (status === "published" ? "Fiche finalisée et synchronisée." : "Brouillon synchronisé.") : "Fiche enregistrée localement ; synchronisation différée.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Enregistrement impossible."); }
    setTimeout(() => setMessage(""), 2500);
  }

  const tabs = ["Cadre du cours", "Démarche APC", "Déroulement", "Finalisation"];
  return <main className="builder-page">
    <header className="builder-topbar">
      <div className="builder-top-left"><Link href="/gabon-educ/tableau-de-bord" className="icon-btn"><ArrowLeft /></Link><div><small>Atelier pédagogique</small><b>Préparer une fiche APC</b></div></div>
      <div className="builder-actions"><Link className="btn btn-light" href="/gabon-educ/mes-fiches"><BookOpen /> Mes fiches</Link><span className="autosave"><Check /> Sauvegarde automatique</span><button className="btn btn-light" onClick={() => setActive(1)}><BookOpen /> Modifier</button><button className="btn btn-light" onClick={() => setPreview(false)}>Annuler</button><button className="btn btn-light" onClick={() => window.print()}><FileDown /> Imprimer</button><button className="btn btn-light" onClick={() => setPreview(true)}><Eye /> Aperçu</button><button className="btn btn-primary" onClick={() => void save("draft")}><Save /> Enregistrer</button></div>
    </header>

    <AcademicWeekStrip selectedWeek={form.week} onSelect={(week) => field("week", week)} title="Semaines du cahier de textes" />

    <section className="builder-shell with-timetable">
      <aside className="builder-steps">
        <div className="completion"><div><b>{completion}%</b><small>Fiche complétée</small></div><span><i style={{width:`${completion}%`}} /></span></div>
        {tabs.map((tab, index) => <button key={tab} className={active === index + 1 ? "active" : ""} onClick={() => setActive(index + 1)}><span>{index + 1}</span><div><b>{tab}</b><small>{["Matière, classe et objectif", "Compétence et situation", "Phases de la séance", "Synthèse et devoir"][index]}</small></div><ChevronRight /></button>)}
        <div className="builder-tip"><Sparkles /><b>Assistant pédagogique</b><p>La génération par IA sera ajoutée après validation de ce formulaire.</p></div>
      </aside>

      <TeacherWeeklyTimetable selectedWeek={form.week} classGroup={form.classGroup} />

      <div className="builder-main">
        {message && <div className="save-toast"><Check /> {message}</div>}
        {active === 1 && <section className="builder-card"><div className="card-heading"><GraduationCap /><div><h1>Cadre général du cours</h1><p>Identifiez la séance et son inscription dans la progression.</p></div></div>
          <div className="form-grid three"><label>Matière<select value={form.subject} onChange={e=>field("subject",e.target.value)}>{subjects.map(x=><option key={x}>{x}</option>)}</select></label><label>Niveau<select value={form.grade} onChange={e=>field("grade",e.target.value)}>{grades.map(x=><option key={x}>{x}</option>)}</select></label><label>Classe<input list="workshop-classes" value={form.classGroup} onChange={e=>field("classGroup",e.target.value)} /><datalist id="workshop-classes">{classNames.map(name=><option value={name} key={name}/>)}</datalist></label></div>
          <div className="form-grid three"><label>Semaine<input type="number" min="1" max="53" value={form.week} onChange={e=>field("week",Number(e.target.value))}/></label><label>Durée prévue<input type="number" min="10" value={form.duration} onChange={e=>field("duration",Number(e.target.value))}/></label><label>Statut<select value={form.status} onChange={e=>field("status",e.target.value as FormState["status"])}><option value="draft">Brouillon</option><option value="published">Finalisée</option></select></label></div>
          <label>Titre de la leçon<input placeholder="Ex. Les expansions du nom" value={form.title} onChange={e=>field("title",e.target.value)}/></label>
          <label>Objectif d’apprentissage<textarea placeholder="À la fin de la séance, l’élève sera capable de…" value={form.objective} onChange={e=>field("objective",e.target.value)}/></label>
          <div className="step-footer"><span/><button className="btn btn-primary" onClick={()=>setActive(2)}>Continuer <ChevronRight /></button></div></section>}

        {active === 2 && <section className="builder-card"><div className="card-heading"><BookOpen /><div><h1>Démarche APC</h1><p>Définissez la compétence, les acquis et la situation-problème.</p></div></div>
          <label>Compétence visée<textarea placeholder="Mobiliser des ressources pour…" value={form.competency} onChange={e=>field("competency",e.target.value)}/></label>
          <label>Prérequis<textarea placeholder="Notions ou savoir-faire déjà maîtrisés" value={form.prerequisite} onChange={e=>field("prerequisite",e.target.value)}/></label>
          <label>Situation-problème<textarea className="large" placeholder="Décrivez une situation concrète qui pousse l’élève à mobiliser ses acquis…" value={form.situationProblem} onChange={e=>field("situationProblem",e.target.value)}/></label>
          <label>Matériel et supports<textarea placeholder="Texte, carte, schéma, manuel, objets, vidéo…" value={form.material} onChange={e=>field("material",e.target.value)}/></label>
          <div className="step-footer"><button className="btn btn-light" onClick={()=>setActive(1)}>Retour</button><button className="btn btn-primary" onClick={()=>setActive(3)}>Continuer <ChevronRight /></button></div></section>}

        {active === 3 && <section className="builder-card"><div className="card-heading"><Clock3 /><div><h1>Déroulement de la séance</h1><p>Organisez les actions de l’enseignant et celles des élèves.</p></div></div>
          <div className={totalDuration === form.duration ? "duration-ok" : "duration-warn"}><Clock3 /> Durée des étapes : <b>{totalDuration} min</b> / durée prévue : {form.duration} min</div>
          <div className="lesson-step-list">{form.steps.map((step,index)=><article key={step.id} className="lesson-step"><div className="lesson-step-head"><span>{index+1}</span><input value={step.title} onChange={e=>updateStep(step.id,"title",e.target.value)}/><label>Minutes<input type="number" min="1" value={step.duration} onChange={e=>updateStep(step.id,"duration",Number(e.target.value))}/></label><button onClick={()=>removeStep(step.id)} title="Supprimer"><Trash2 /></button></div><div className="form-grid two"><label>Actions de l’enseignant<textarea value={step.teacher} onChange={e=>updateStep(step.id,"teacher",e.target.value)}/></label><label>Activités des élèves<textarea value={step.students} onChange={e=>updateStep(step.id,"students",e.target.value)}/></label></div></article>)}</div>
          <button className="add-step" onClick={addStep}><Plus /> Ajouter une étape</button>
          <div className="step-footer"><button className="btn btn-light" onClick={()=>setActive(2)}>Retour</button><button className="btn btn-primary" onClick={()=>setActive(4)}>Continuer <ChevronRight /></button></div></section>}

        {active === 4 && <section className="builder-card"><div className="card-heading"><FileDown /><div><h1>Finalisation</h1><p>Ajoutez la trace écrite, l’adaptation et le travail à faire.</p></div></div>
          <label>Synthèse ou trace écrite<textarea className="large" placeholder="Résumé essentiel à retenir par les élèves" value={form.summary} onChange={e=>field("summary",e.target.value)}/></label>
          <label>Différenciation pédagogique<textarea placeholder="Aides prévues, groupes de besoin, exercices adaptés…" value={form.differentiation} onChange={e=>field("differentiation",e.target.value)}/></label>
          <label>Devoir ou prolongement<textarea placeholder="Travail à faire après la séance" value={form.homework} onChange={e=>field("homework",e.target.value)}/></label>
          <div className="final-actions"><button className="btn btn-light" onClick={()=>setPreview(true)}><Eye /> Vérifier la fiche</button><button className="btn btn-primary" onClick={()=>void save("published")}><Check /> Finaliser la fiche</button></div>
          <div className="step-footer"><button className="btn btn-light" onClick={()=>setActive(3)}>Retour</button><span/></div></section>}
      </div>
    </section>

    {preview && <div className="preview-overlay" onClick={()=>setPreview(false)}><article className="lesson-preview" onClick={e=>e.stopPropagation()}><button className="preview-close" onClick={()=>setPreview(false)}>×</button><header><div><small>GABON ÉDUC+</small><h1>Fiche pédagogique APC</h1></div><span>{form.status === "published" ? "Finalisée" : "Brouillon"}</span></header><div className="preview-meta"><b>{form.subject}</b><span>{form.grade} · {form.classGroup}</span><span>Semaine {form.week}</span><span>{form.duration} minutes</span></div><h2>{form.title || "Titre de la leçon"}</h2><section><h3>Compétence visée</h3><p>{form.competency || "Non renseignée"}</p><h3>Objectif d’apprentissage</h3><p>{form.objective || "Non renseigné"}</p><h3>Situation-problème</h3><p>{form.situationProblem || "Non renseignée"}</p></section><table><thead><tr><th>Phase</th><th>Durée</th><th>Actions de l’enseignant</th><th>Activités des élèves</th></tr></thead><tbody>{form.steps.map(s=><tr key={s.id}><td>{s.title}</td><td>{s.duration} min</td><td>{s.teacher}</td><td>{s.students}</td></tr>)}</tbody></table><section><h3>Trace écrite</h3><p>{form.summary || "Non renseignée"}</p><h3>Différenciation</h3><p>{form.differentiation || "Non renseignée"}</p><h3>Devoir</h3><p>{form.homework || "Non renseigné"}</p></section><footer><button className="btn btn-light" onClick={()=>void save("draft")}><Save /> Enregistrer</button><button className="btn btn-light" onClick={()=>setPreview(false)}>Modifier</button><button className="btn btn-light" onClick={()=>setPreview(false)}>Annuler</button><button className="btn btn-primary" onClick={()=>window.print()}><FileDown /> Imprimer / PDF</button></footer></article></div>}
  </main>;
}
