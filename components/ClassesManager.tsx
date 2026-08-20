"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Edit3, GraduationCap, LoaderCircle, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateClass, validateStudent } from "@/lib/classes/validation";
import { Brand } from "./Brand";
import styles from "./ClassesManager.module.css";

type Grade = { id: string; code: string; name: string };
type Student = { id: string; first_name: string; last_name: string; email: string | null };
type SchoolClass = { id: string; name: string; room: string | null; grade_level_id: string; grade_levels: Grade | null; class_students: Student[] };
type Notice = { type: "success" | "error"; text: string } | null;

const STORAGE_KEY = "gabon-educ-plus-classes";
const DEMO_GRADES: Grade[] = [
  { id: "00000000-0000-4000-8000-000000000006", code: "6E", name: "Sixième" },
  { id: "00000000-0000-4000-8000-000000000005", code: "5E", name: "Cinquième" },
  { id: "00000000-0000-4000-8000-000000000004", code: "4E", name: "Quatrième" },
  { id: "00000000-0000-4000-8000-000000000003", code: "3E", name: "Troisième" },
];

function isCloudMode() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}

function readLocal(): SchoolClass[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as SchoolClass[]; }
  catch { return []; }
}

function writeLocal(items: SchoolClass[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function ClassesManager() {
  const cloudMode = useMemo(isCloudMode, []);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [grades, setGrades] = useState<Grade[]>(DEMO_GRADES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [classModal, setClassModal] = useState(false);
  const [studentClass, setStudentClass] = useState<SchoolClass | null>(null);
  const [editing, setEditing] = useState<SchoolClass | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!cloudMode) {
        setGrades(DEMO_GRADES);
        setClasses(readLocal());
        return;
      }
      const supabase = createClient();
      const [{ data: gradeData, error: gradeError }, { data: classData, error: classError }] = await Promise.all([
        supabase.from("grade_levels").select("id,code,name").eq("is_active", true).order("sort_order"),
        supabase.from("class_groups").select("id,name,room,grade_level_id,grade_levels(id,code,name),class_students(id,first_name,last_name,email)").order("created_at", { ascending: false }),
      ]);
      if (gradeError) throw gradeError;
      if (classError) throw classError;
      setGrades((gradeData ?? []) as Grade[]);
      setClasses((classData ?? []) as unknown as SchoolClass[]);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Impossible de charger les classes." });
    } finally { setLoading(false); }
  }, [cloudMode]);

  useEffect(() => { void load(); }, [load]);

  async function saveClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      const values = validateClass({ name: String(form.get("name") ?? ""), gradeLevelId: String(form.get("gradeLevelId") ?? ""), room: String(form.get("room") ?? "") });
      if (!cloudMode) {
        const grade = grades.find(item => item.id === values.gradeLevelId) ?? null;
        const record: SchoolClass = editing
          ? { ...editing, name: values.name, grade_level_id: values.gradeLevelId, grade_levels: grade, room: values.room || null }
          : { id: crypto.randomUUID(), name: values.name, grade_level_id: values.gradeLevelId, grade_levels: grade, room: values.room || null, class_students: [] };
        const next = editing ? classes.map(item => item.id === editing.id ? record : item) : [record, ...classes];
        writeLocal(next); setClasses(next);
      } else {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Votre session a expiré. Reconnectez-vous.");
        const query = editing
          ? supabase.from("class_groups").update({ name: values.name, grade_level_id: values.gradeLevelId, room: values.room || null }).eq("id", editing.id)
          : supabase.from("class_groups").insert({ name: values.name, grade_level_id: values.gradeLevelId, room: values.room || null, owner_teacher_id: user.id });
        const { error } = await query;
        if (error) throw error;
        await load();
      }
      setClassModal(false); setEditing(null);
      setNotice({ type: "success", text: editing ? "Classe modifiée." : "Classe créée." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Enregistrement impossible." }); }
    finally { setSaving(false); }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!studentClass) return; setSaving(true); setNotice(null);
    const form = new FormData(event.currentTarget);
    try {
      const values = validateStudent({ firstName: String(form.get("firstName") ?? ""), lastName: String(form.get("lastName") ?? ""), email: String(form.get("email") ?? "") });
      if (!cloudMode) {
        const student: Student = { id: crypto.randomUUID(), first_name: values.firstName, last_name: values.lastName, email: values.email || null };
        const next = classes.map(item => item.id === studentClass.id ? { ...item, class_students: [...item.class_students, student] } : item);
        writeLocal(next); setClasses(next);
      } else {
        const { error } = await createClient().from("class_students").insert({ class_group_id: studentClass.id, first_name: values.firstName, last_name: values.lastName, email: values.email || null });
        if (error) throw error;
        await load();
      }
      setStudentClass(null); setNotice({ type: "success", text: "Élève ajouté à la classe." });
    } catch (error) { setNotice({ type: "error", text: error instanceof Error ? error.message : "Ajout impossible." }); }
    finally { setSaving(false); }
  }

  async function removeClass(item: SchoolClass) {
    if (!window.confirm(`Supprimer la classe « ${item.name} » et sa liste d’élèves ?`)) return;
    if (!cloudMode) {
      const next = classes.filter(entry => entry.id !== item.id); writeLocal(next); setClasses(next);
    } else {
      const { error } = await createClient().from("class_groups").delete().eq("id", item.id);
      if (error) { setNotice({ type: "error", text: error.message }); return; }
      await load();
    }
    setNotice({ type: "success", text: "Classe supprimée." });
  }

  async function removeStudent(student: Student) {
    if (!window.confirm(`Retirer ${student.first_name} ${student.last_name} de cette classe ?`)) return;
    if (!cloudMode) {
      const next = classes.map(item => ({ ...item, class_students: item.class_students.filter(entry => entry.id !== student.id) }));
      writeLocal(next); setClasses(next); return;
    }
    const { error } = await createClient().from("class_students").delete().eq("id", student.id);
    if (error) setNotice({ type: "error", text: error.message }); else await load();
  }

  const studentCount = classes.reduce((sum, item) => sum + item.class_students.length, 0);

  return <main className={styles.page}>
    <header className={styles.topbar}><div className={styles.topLeft}><Link className="icon-btn" href="/gabon-educ/tableau-de-bord" aria-label="Retour au tableau de bord"><ArrowLeft/></Link><Brand/><div><b>Mes classes</b><small>Organisation et suivi des élèves</small></div></div><button className="btn btn-primary" onClick={() => { setEditing(null); setClassModal(true); }}><Plus/> Créer une classe</button></header>
    <section className={styles.shell}>
      <div className={styles.heading}><div><small>ESPACE ENSEIGNANT</small><h1>Mes classes</h1><p>Créez vos classes et gérez simplement vos listes d’élèves.</p></div><div className={styles.stats}><span><GraduationCap/> {classes.length} classes</span><span><Users/> {studentCount} élèves</span></div></div>
      <p className={styles.mode}>{cloudMode ? "Sauvegarde Supabase activée" : "Mode démonstration : données conservées sur cet appareil"}</p>
      {notice && <div className={`${styles.notice} ${styles[notice.type]}`}>{notice.text}<button onClick={() => setNotice(null)}><X/></button></div>}
      {loading ? <div className={styles.loading}><LoaderCircle className={styles.spin}/> Chargement…</div> : classes.length === 0 ? <div className={styles.empty}><GraduationCap/><h2>Votre première classe vous attend</h2><p>Créez une classe, puis ajoutez-y vos élèves.</p><button className="btn btn-primary" onClick={() => setClassModal(true)}><Plus/> Créer une classe</button></div> : <div className={styles.grid}>{classes.map(item => <article className={styles.card} key={item.id}>
        <div className={styles.cardHead}><span className={styles.cardIcon}><GraduationCap/></span><div><small>{item.grade_levels?.name ?? item.grade_levels?.code ?? "Niveau"}</small><h2>{item.name}</h2><p>{item.room ? `Salle ${item.room}` : "Salle non renseignée"}</p></div><div className={styles.cardMenu}><button aria-label="Modifier" onClick={() => { setEditing(item); setClassModal(true); }}><Edit3/></button><button className={styles.danger} aria-label="Supprimer" onClick={() => void removeClass(item)}><Trash2/></button></div></div>
        <div className={styles.rosterTitle}><b>Liste des élèves</b><span>{item.class_students.length}</span></div>
        <div className={styles.studentList}>{item.class_students.length === 0 ? <p>Aucun élève pour le moment.</p> : item.class_students.map(student => <div key={student.id}><span>{student.first_name[0]}{student.last_name[0]}</span><div><b>{student.first_name} {student.last_name}</b><small>{student.email || "Sans e-mail"}</small></div><button aria-label="Retirer l’élève" onClick={() => void removeStudent(student)}><X/></button></div>)}</div>
        <button className={styles.addStudent} onClick={() => setStudentClass(item)}><UserPlus/> Ajouter un élève</button>
      </article>)}</div>}
    </section>

    {classModal && <div className={styles.backdrop} role="dialog" aria-modal="true"><form className={styles.modal} onSubmit={saveClass}><header><div><h2>{editing ? "Modifier la classe" : "Créer une classe"}</h2><p>Renseignez les informations principales.</p></div><button type="button" onClick={() => { setClassModal(false); setEditing(null); }}><X/></button></header><label>Nom de la classe<input name="name" required maxLength={80} defaultValue={editing?.name} placeholder="Ex. 5e Année A"/></label><label>Niveau<select name="gradeLevelId" required defaultValue={editing?.grade_level_id ?? ""}><option value="" disabled>Sélectionner un niveau</option>{grades.map(grade => <option value={grade.id} key={grade.id}>{grade.name} ({grade.code})</option>)}</select></label><label>Salle <span>(facultatif)</span><input name="room" maxLength={40} defaultValue={editing?.room ?? ""} placeholder="Ex. Salle 5"/></label><footer><button type="button" className="btn btn-light" onClick={() => setClassModal(false)}>Annuler</button><button className="btn btn-primary" disabled={saving}>{saving && <LoaderCircle className={styles.spin}/>} {editing ? "Enregistrer" : "Créer la classe"}</button></footer></form></div>}
    {studentClass && <div className={styles.backdrop} role="dialog" aria-modal="true"><form className={styles.modal} onSubmit={addStudent}><header><div><h2>Ajouter un élève</h2><p>Classe : {studentClass.name}</p></div><button type="button" onClick={() => setStudentClass(null)}><X/></button></header><div className={styles.two}><label>Prénom<input name="firstName" required maxLength={60}/></label><label>Nom<input name="lastName" required maxLength={60}/></label></div><label>Adresse e-mail <span>(facultatif)</span><input name="email" type="email" maxLength={160}/></label><footer><button type="button" className="btn btn-light" onClick={() => setStudentClass(null)}>Annuler</button><button className="btn btn-primary" disabled={saving}>{saving && <LoaderCircle className={styles.spin}/>} Ajouter l’élève</button></footer></form></div>}
  </main>;
}
