"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Cloud, Download, Edit3, GraduationCap, LoaderCircle, Plus, Search, Trash2, Upload, UserPlus, Users, X } from "lucide-react";
import { Brand } from "./Brand";
import { classesToCsv, deleteClassRecord, deleteStudent, listClasses, parseStudentCsv, saveClassRecord, saveStudent, type ClassRecord, type ClassStudent } from "@/lib/class-store";
import { readLocal, storageModeLabel, STORAGE_KEYS, type StorageMode } from "@/lib/storage-mode";
import styles from "./ClassesManager.module.css";
import { useSubscriptionAccess } from "@/lib/subscriptions/use-subscription-access";
import { SubscriptionReadOnlyPanel } from "@/components/SubscriptionReadOnlyPanel";
import { getDefaultLevelsForSchoolType, getDefaultSubjectsForSchoolType, type SchoolEducationLevel } from "@/lib/school-profiles";
import { PRODUCT, productAllowsSchoolType } from "@/lib/product-edition";
import { resolveActiveSchoolContext } from "@/lib/active-school";

type Notice = { kind: "success" | "error"; text: string } | null;

export function ClassesManagerLocal() {
  const subscriptionAccess = useSubscriptionAccess();
  const [classes, setClasses] = useState<ClassRecord[]>([]); const [mode, setMode] = useState<StorageMode>("demo"); const [statusText, setStatusText] = useState("");
  const [ready, setReady] = useState(false); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState<Notice>(null); const [query, setQuery] = useState("");
  const [classModal, setClassModal] = useState(false); const [studentClassId, setStudentClassId] = useState<string | null>(null); const [editingClass, setEditingClass] = useState<ClassRecord | null>(null); const [editingStudent, setEditingStudent] = useState<ClassStudent | null>(null);

  const cachedSchoolProfile = readLocal<{ schoolType?: SchoolEducationLevel } | null>(STORAGE_KEYS.school, null);
  const cachedSchoolType = cachedSchoolProfile?.schoolType && productAllowsSchoolType(cachedSchoolProfile.schoolType) ? cachedSchoolProfile.schoolType : null;
  const [schoolType, setSchoolType] = useState<SchoolEducationLevel | null>(cachedSchoolType || PRODUCT.defaultSchoolType);
  const [activeSchoolId, setActiveSchoolId] = useState<string>(readLocal<string>(STORAGE_KEYS.activeSchool, ""));
  const classLevels = useMemo(
    () => schoolType ? getDefaultLevelsForSchoolType(schoolType) : [],
    [schoolType],
  );
  const classSubjects = useMemo(() => {
    const standard = schoolType ? getDefaultSubjectsForSchoolType(schoolType) : [];
    if (editingClass?.mainSubject && !standard.includes(editingClass.mainSubject)) return [editingClass.mainSubject, ...standard];
    return standard;
  }, [schoolType, editingClass?.mainSubject]);

  const refreshClasses = useCallback(async (schoolId: string, type: SchoolEducationLevel) => {
    const result = await listClasses({ schoolId, schoolType: type });
    setClasses(result.items);
    setMode(result.mode);
    setStatusText(result.message);
    return result;
  }, []);

  const reload = useCallback(async () => {
    setReady(false);
    try {
      // La page des classes ne dépend plus du chargement des autres modules.
      const schoolContext = await resolveActiveSchoolContext();
      const resolvedSchool = schoolContext.school;
      setSchoolType(resolvedSchool.schoolType);
      setActiveSchoolId(resolvedSchool.id);
      await refreshClasses(resolvedSchool.id, resolvedSchool.schoolType);
    } catch (error) {
      const fallbackType = cachedSchoolType || PRODUCT.defaultSchoolType;
      const fallbackSchoolId = readLocal<string>(STORAGE_KEYS.activeSchool, "");
      setSchoolType(fallbackType);
      setActiveSchoolId(fallbackSchoolId);
      if (fallbackSchoolId && fallbackType) {
        await refreshClasses(fallbackSchoolId, fallbackType);
      } else {
        setClasses([]);
      }
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Impossible de résoudre l’établissement actif." });
    } finally {
      setReady(true);
    }
  }, [refreshClasses, cachedSchoolType]);
  useEffect(() => { void reload(); }, [reload]);

  async function submitClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(null); const data = new FormData(event.currentTarget);
    try {
      const selectedLevel = String(data.get("level") || classLevels[0] || "");
      if (!classLevels.includes(selectedLevel)) throw new Error("Ce niveau ne correspond pas au type de l’établissement.");
      if (!activeSchoolId || !schoolType) throw new Error("Établissement actif non résolu. Rechargez la page avant de créer une classe.");
      const record = await saveClassRecord({ id: editingClass?.id || crypto.randomUUID(), name: String(data.get("name") || ""), level: selectedLevel, room: String(data.get("room") || ""), academicYear: String(data.get("academicYear") || ""), mainSubject: String(data.get("mainSubject") || ""), students: editingClass?.students || [] }, { schoolId: activeSchoolId, schoolType });
      // Mise à jour optimiste : la classe apparaît immédiatement. Surtout, ne pas
      // rappeler loadPlatformWorkspace ici : cela pouvait changer de contexte juste
      // après un POST Supabase réussi et faire disparaître la classe de l’écran.
      setClasses((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      setClassModal(false);
      setEditingClass(null);
      try {
        await refreshClasses(activeSchoolId, schoolType);
      } catch {
        // La création a déjà réussi. Une erreur de relecture ne doit jamais retirer
        // la classe affichée ; la prochaine actualisation pourra réessayer.
        setStatusText(record.syncState === "synced" ? "Classe enregistrée dans Supabase" : "Synchronisation différée");
      }
      setNotice({ kind:"success", text: record.syncState === "pending" ? "Classe enregistrée localement ; synchronisation différée." : "Classe enregistrée." });
    } catch (error) { setNotice({kind:"error",text:error instanceof Error?error.message:"Enregistrement impossible."}); } finally { setSaving(false); }
  }

  async function submitStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!studentClassId) return; setSaving(true); const data = new FormData(event.currentTarget);
    try { await saveStudent(studentClassId,{id:editingStudent?.id||crypto.randomUUID(),firstName:String(data.get("firstName")||""),lastName:String(data.get("lastName")||""),email:String(data.get("email")||"")}); setStudentClassId(null); setEditingStudent(null); if (activeSchoolId && schoolType) await refreshClasses(activeSchoolId, schoolType); setNotice({kind:"success",text:"Élève enregistré."}); }
    catch(error){setNotice({kind:"error",text:error instanceof Error?error.message:"Ajout impossible."});} finally{setSaving(false);}
  }

  async function removeClass(item: ClassRecord){if(!confirm(`Supprimer « ${item.name} » et tous ses élèves ?`))return;try{await deleteClassRecord(item.id);if (activeSchoolId && schoolType) await refreshClasses(activeSchoolId, schoolType);setNotice({kind:"success",text:"Classe supprimée."});}catch(error){setNotice({kind:"error",text:error instanceof Error?error.message:"Suppression impossible."});}}
  async function removeStudent(item:ClassRecord,student:ClassStudent){if(!confirm(`Supprimer ${student.firstName} ${student.lastName} de la classe ?`))return;try{await deleteStudent(item.id,student.id);if (activeSchoolId && schoolType) await refreshClasses(activeSchoolId, schoolType);}catch(error){setNotice({kind:"error",text:error instanceof Error?error.message:"Suppression impossible."});}}
  function exportCsv(item:ClassRecord){const blob=new Blob(["\uFEFF"+classesToCsv(item)],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`${item.name.replace(/\s+/g,"-").toLowerCase()}-eleves.csv`;link.click();URL.revokeObjectURL(url);}
  async function importCsv(event:ChangeEvent<HTMLInputElement>,item:ClassRecord){const file=event.target.files?.[0];if(!file)return;setSaving(true);try{const students=parseStudentCsv(await file.text());for(const student of students)await saveStudent(item.id,student);if (activeSchoolId && schoolType) await refreshClasses(activeSchoolId, schoolType);setNotice({kind:"success",text:`${students.length} élève(s) importé(s).`});}catch(error){setNotice({kind:"error",text:error instanceof Error?error.message:"Import impossible."});}finally{setSaving(false);event.target.value="";}}

  const filtered = useMemo(()=>{const needle=query.trim().toLocaleLowerCase("fr");return classes.map(item=>({...item,students:item.students.filter(student=>!needle||`${student.firstName} ${student.lastName} ${student.email}`.toLocaleLowerCase("fr").includes(needle))})).filter(item=>!needle||item.students.length||`${item.name} ${item.level}`.toLocaleLowerCase("fr").includes(needle));},[classes,query]);
  const count=classes.reduce((sum,item)=>sum+item.students.length,0);

  return <main className={styles.page}><header className={styles.topbar}><div className={styles.topLeft}><Link className="icon-btn" href="/gabon-educ/tableau-de-bord" aria-label="Retour"><ArrowLeft/></Link><Brand/><div><b>Gestion des classes</b><small>Organisation et suivi des élèves</small></div></div><button className="btn btn-primary" disabled={subscriptionAccess.loading || subscriptionAccess.blocked || !ready || !activeSchoolId || !schoolType || classLevels.length === 0} title={subscriptionAccess.blocked?"Fonction indisponible pendant la suspension de l’abonnement.":undefined} onClick={()=>{setEditingClass(null);setClassModal(true);}}><Plus/> Créer une classe</button></header><section className={styles.shell}>
    {!subscriptionAccess.loading&&subscriptionAccess.blocked&&<SubscriptionReadOnlyPanel message={subscriptionAccess.message}/>} 
    <fieldset className="subscription-write-lock" disabled={subscriptionAccess.loading || subscriptionAccess.blocked}>
    <div className={styles.heading}><div><small>ESPACE ADMINISTRATION</small><h1>Gestion des classes</h1><p>Créez les classes de l’établissement et suivez leurs listes d’élèves.</p></div><div className={styles.stats}><span><GraduationCap/> {classes.length} classes</span><span><Users/> {count} élèves</span></div></div>
    <div className={`${styles.mode} ${mode==="offline"?styles.offline:""}`}><Cloud/> {storageModeLabel(mode)} · {statusText}</div>
    {notice&&<div className={`${styles.notice} ${styles[notice.kind]}`}>{notice.text}<button onClick={()=>setNotice(null)}><X/></button></div>}
    <label className={styles.search}><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher une classe ou un élève…"/></label>
    {!ready?<div className={styles.loading}><LoaderCircle className={styles.spin}/> Chargement…</div>:filtered.length===0?<div className={styles.empty}><GraduationCap/><h2>{classes.length?"Aucun résultat":"Votre première classe vous attend"}</h2><p>{classes.length?"Modifiez votre recherche.":"Créez une classe, puis ajoutez-y vos élèves."}</p>{!classes.length&&<button className="btn btn-primary" disabled={subscriptionAccess.loading || subscriptionAccess.blocked || !activeSchoolId || !schoolType || classLevels.length === 0} onClick={()=>setClassModal(true)}><Plus/> Créer une classe</button>}</div>:<div className={styles.grid}>{filtered.map(item=><article className={styles.card} key={item.id}><div className={styles.cardHead}><span className={styles.cardIcon}><GraduationCap/></span><div><small>{item.level} · {item.academicYear}</small><h2>{item.name}</h2><p>{item.room?`Salle ${item.room}`:"Salle non renseignée"}{item.mainSubject?` · ${item.mainSubject}`:""}</p></div><div className={styles.cardMenu}><button aria-label="Modifier la classe" onClick={()=>{setEditingClass(item);setClassModal(true);}}><Edit3/></button><button className={styles.danger} aria-label="Supprimer la classe" onClick={()=>void removeClass(item)}><Trash2/></button></div></div>
      <div className={styles.rosterTitle}><b>Liste des élèves</b><span>{item.students.length}</span></div><div className={styles.studentList}>{item.students.length===0?<p>Aucun élève pour le moment.</p>:item.students.map(student=><div key={student.id}><span>{student.firstName[0]}{student.lastName[0]}</span><div><b>{student.lastName.toLocaleUpperCase("fr")} {student.firstName}</b><small>{student.email||"Sans e-mail"}</small></div><div className={styles.studentActions}><button aria-label="Modifier l’élève" onClick={()=>{setEditingStudent(student);setStudentClassId(item.id);}}><Edit3/></button><button aria-label="Supprimer l’élève" onClick={()=>void removeStudent(item,student)}><X/></button></div></div>)}</div>
      <div className={styles.cardActions}><button className={styles.addStudent} onClick={()=>{setEditingStudent(null);setStudentClassId(item.id);}}><UserPlus/> Ajouter</button><label><Upload/> Importer CSV<input type="file" accept=".csv,text/csv" onChange={event=>void importCsv(event,item)}/></label><button onClick={()=>exportCsv(item)}><Download/> Exporter</button></div>
    </article>)}</div>}
    </fieldset>
  </section>
  {classModal&&!subscriptionAccess.loading&&!subscriptionAccess.blocked&&<div className={styles.backdrop} role="dialog" aria-modal="true"><form className={styles.modal} onSubmit={submitClass}><header><div><h2>{editingClass?"Modifier la classe":"Créer une classe"}</h2><p>Les informations peuvent être modifiées plus tard.</p></div><button type="button" onClick={()=>{setClassModal(false);setEditingClass(null);}}><X/></button></header><div className={styles.two}><label>Nom<input name="name" required maxLength={80} defaultValue={editingClass?.name} placeholder={classLevels[0]?`${classLevels[0]} A`:"Nom de la classe"}/></label><label>Niveau<select name="level" disabled={!schoolType || classLevels.length === 0} defaultValue={editingClass?.level||classLevels[0]||""}>{classLevels.map(level=><option key={level}>{level}</option>)}</select></label></div><div className={styles.two}><label>Année scolaire<input name="academicYear" required defaultValue={editingClass?.academicYear||"2026-2027"}/></label><label>Salle <span>(facultatif)</span><input name="room" defaultValue={editingClass?.room}/></label></div><label>Matière principale <span>(facultatif)</span><select name="mainSubject" defaultValue={editingClass?.mainSubject||""}><option value="">Aucune</option>{classSubjects.map(subject=><option key={subject}>{subject}</option>)}</select></label><footer><button type="button" className="btn btn-light" onClick={()=>setClassModal(false)}>Annuler</button><button className="btn btn-primary" disabled={saving || !ready || !activeSchoolId || !schoolType || classLevels.length === 0}>{saving&&<LoaderCircle className={styles.spin}/>} {saving ? "Enregistrement…" : "Enregistrer"}</button></footer></form></div>}
  {studentClassId&&!subscriptionAccess.blocked&&<div className={styles.backdrop} role="dialog" aria-modal="true"><form className={styles.modal} onSubmit={submitStudent}><header><div><h2>{editingStudent?"Modifier l’élève":"Ajouter un élève"}</h2><p>Aucun compte utilisateur n’est nécessaire.</p></div><button type="button" onClick={()=>{setStudentClassId(null);setEditingStudent(null);}}><X/></button></header><div className={styles.two}><label>Prénom<input name="firstName" required defaultValue={editingStudent?.firstName}/></label><label>Nom<input name="lastName" required defaultValue={editingStudent?.lastName}/></label></div><label>E-mail <span>(facultatif)</span><input name="email" type="email" defaultValue={editingStudent?.email}/></label><footer><button type="button" className="btn btn-light" onClick={()=>setStudentClassId(null)}>Annuler</button><button className="btn btn-primary" disabled={saving}>Enregistrer</button></footer></form></div>}
  </main>;
}
