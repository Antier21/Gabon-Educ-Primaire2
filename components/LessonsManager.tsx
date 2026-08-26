"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Copy, Download, Edit3, FilePlus2, Filter, Search, Trash2 } from "lucide-react";
import { deleteLesson, listLessonsWithStatus, saveLesson, syncLocalLessons, type LessonRecord } from "@/lib/lesson-store";
import type { StorageMode } from "@/lib/storage-mode";
import { AcademicWeekStrip } from "@/components/AcademicWeekStrip";
import { BackToSpace } from "@/components/BackToSpace";

function formatDate(value: string) {
  try { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)); }
  catch { return "—"; }
}

export function LessonsManager() {
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("Toutes");
  const [grade, setGrade] = useState("Tous");
  const [status, setStatus] = useState("Tous");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<StorageMode>("demo");
  const [syncMessage, setSyncMessage] = useState("Données enregistrées sur cet appareil");

  async function reload() {
    setLoading(true); setError("");
    try { const result = await listLessonsWithStatus(); setLessons(result.items); setMode(result.mode); setSyncMessage(result.message); }
    catch (e) { setError(e instanceof Error ? e.message : "Impossible de charger les fiches."); }
    finally { setLoading(false); }
  }

  async function transferLocal() {
    if (!confirm("Transférer les fiches locales vers votre compte Supabase ? Les copies locales seront conservées.")) return;
    try { const result = await syncLocalLessons(); setNotice(`${result.synced} fiche(s) synchronisée(s)${result.failed ? `, ${result.failed} en attente` : ""}.`); await reload(); }
    catch (e) { setError(e instanceof Error ? e.message : "Synchronisation impossible."); }
  }

  useEffect(() => { void reload(); }, []);

  async function remove(id: string) {
    if (!confirm("Supprimer définitivement cette fiche ?")) return;
    try { await deleteLesson(id); setLessons(items => items.filter(item => item.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Suppression impossible."); }
  }

  async function duplicate(item: LessonRecord) {
    try {
      const copy: LessonRecord = { ...item, id: crypto.randomUUID(), title: `${item.title || "Fiche sans titre"} — copie`, status: "draft", updatedAt: new Date().toISOString() };
      const saved = await saveLesson(copy);
      setLessons(items => [saved, ...items]);
      setNotice("Fiche dupliquée."); setTimeout(() => setNotice(""), 2200);
    } catch (e) { setError(e instanceof Error ? e.message : "Duplication impossible."); }
  }

  function exportJson(item: LessonRecord) {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${(item.title || "fiche-apc").toLowerCase().replace(/[^a-z0-9à-ÿ]+/gi, "-")}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  const subjects = useMemo(() => ["Toutes", ...Array.from(new Set(lessons.map(x => x.subject).filter(Boolean)))], [lessons]);
  const grades = useMemo(() => ["Tous", ...Array.from(new Set(lessons.map(x => x.grade).filter(Boolean)))], [lessons]);
  const filtered = useMemo(() => lessons.filter(item => {
    const haystack = `${item.title} ${item.subject} ${item.grade} ${item.classGroup} ${item.objective || ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (subject === "Toutes" || item.subject === subject) && (grade === "Tous" || item.grade === grade) && (status === "Tous" || item.status === status);
  }), [lessons, query, subject, grade, status]);

  return <main className="lessons-page">
    <header className="builder-topbar">
      <div className="builder-top-left"><BackToSpace /><div><small>Espace enseignant</small><b>Mes fiches pédagogiques</b></div></div>
      <Link className="btn btn-primary" href="/gabon-educ/preparer-un-cours"><FilePlus2 /> Nouvelle fiche</Link>
    </header>
    <section className="lessons-shell">
      <div className="lessons-heading"><div><h1>Bibliothèque de fiches APC</h1><p>Recherchez, modifiez, dupliquez et exportez vos préparations.</p><small>{syncMessage}</small>{mode === "cloud" && lessons.some(item => item.syncState !== "synced") && <button className="btn btn-light" onClick={() => void transferLocal()}>Transférer les fiches locales</button>}</div><span>{lessons.length} fiche{lessons.length > 1 ? "s" : ""}</span></div>
      <AcademicWeekStrip compact title="Semaines du cahier de textes" onSelect={(week) => { window.location.href = `/gabon-educ/preparer-un-cours?week=${week}`; }} />
      {notice && <div className="save-toast static"><Copy /> {notice}</div>}
      {error && <div className="save-toast static" role="alert">{error} <button onClick={() => void reload()}>Réessayer</button></div>}
      <div className="lesson-filters">
        <label className="search-box"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un titre, une classe, un objectif…" /></label>
        <label><Filter /> Matière<select value={subject} onChange={e => setSubject(e.target.value)}>{subjects.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Niveau<select value={grade} onChange={e => setGrade(e.target.value)}>{grades.map(x => <option key={x}>{x}</option>)}</select></label>
        <label>Statut<select value={status} onChange={e => setStatus(e.target.value)}><option>Tous</option><option value="draft">Brouillon</option><option value="published">Finalisée</option></select></label>
      </div>

      {loading ? <section className="empty-lessons"><BookOpen /><h2>Chargement de vos fiches…</h2></section> : filtered.length === 0 ? <section className="empty-lessons"><BookOpen /><h2>{lessons.length ? "Aucune fiche ne correspond aux filtres" : "Votre bibliothèque est encore vide"}</h2><p>Créez votre première préparation APC. Elle apparaîtra automatiquement ici.</p><Link className="btn btn-primary" href="/gabon-educ/preparer-un-cours"><FilePlus2 /> Préparer un cours</Link></section> :
      <div className="lesson-library">{filtered.map(item => <article className="lesson-card" key={item.id}>
        <div className="lesson-card-top"><span className="lesson-subject">{item.subject || "Matière"}</span><em className={item.status === "published" ? "published" : "draft"}>{item.status === "published" ? "Finalisée" : "Brouillon"}</em></div>
        <h2>{item.title || "Fiche sans titre"}</h2>
        <p>{String(item.objective || item.competency || "Aucun objectif renseigné.")}</p>
        <div className="lesson-meta"><span>{item.grade}</span><span>{item.classGroup}</span><span>Semaine {item.week}</span><span>{item.duration} min</span></div>
        <small>Modifiée le {formatDate(item.updatedAt)} · {item.syncState === "synced" ? "Synchronisée" : item.syncState === "pending" ? "Synchronisation différée" : "Locale"}</small>
        <div className="lesson-actions"><Link title="Modifier" href={`/gabon-educ/preparer-un-cours?id=${item.id}`}><Edit3 /></Link><button title="Dupliquer" onClick={() => void duplicate(item)}><Copy /></button><button title="Exporter les données" onClick={() => exportJson(item)}><Download /></button><button className="danger" title="Supprimer" onClick={() => void remove(item.id)}><Trash2 /></button></div>
      </article>)}</div>}
    </section>
  </main>;
}
