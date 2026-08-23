"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, CalendarDays, ClipboardPenLine, GraduationCap, NotebookPen, Users, X } from "lucide-react";
import { Brand } from "@/components/Brand";
import { createClient } from "@/lib/supabase/client";
import { listClasses } from "@/lib/class-store";
import { loadPlatformWorkspace, savePlatformWorkspace } from "@/lib/platform/store";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import type { ClassRecord } from "@/lib/class-store";
import type { PlatformWorkspace, SchoolSubject, TeachingAssignment, TimetableSlot } from "@/lib/platform/types";
import type { SyncOperationMetadata } from "@/lib/sync/types";
import styles from "./TeacherAssignedClasses.module.css";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const ROWS = [
  ["07h30","07:30","08:25"],["08h25","08:25","09:20"],["09h30","09:30","10:25"],
  ["10h25","10:25","11:20"],["11h30","11:30","12:25"],["12h25","12:25","13:15"],
  ["13h15","13:15","14:10"],["14h25","14:25","15:20"],["15h20","15:20","16:10"],
  ["16h10","16:10","16:55"],["16h55","16:55","17:40"],
] as const;
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function effectiveAssignments(workspace: PlatformWorkspace, teacherId: string) {
  const grouped = new Map<string, TeachingAssignment[]>();
  for (const assignment of workspace.assignments.filter((item) => item.active)) {
    const key = `${assignment.classId}|${assignment.subjectId}`;
    grouped.set(key, [...(grouped.get(key) || []), assignment]);
  }
  const effective: TeachingAssignment[] = [];
  for (const list of grouped.values()) {
    const selected = workspace.school?.schoolType === "primary"
      ? (list.find((item) => !item.headTeacher) || list.find((item) => item.headTeacher) || list[0])
      : list[0];
    if (selected?.teacherId === teacherId) effective.push(selected);
  }
  return effective;
}

export function TeacherAssignedClasses() {
  const [workspace, setWorkspace] = useState<PlatformWorkspace | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [editing, setEditing] = useState<{ weekday:number; start:string; end:string; slot?:TimetableSlot } | null>(null);
  const [subjectId, setSubjectId] = useState("");
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");

  async function reload() {
    const client = createClient();
    const { data: auth } = await client.auth.getUser();
    const id = auth.user?.id || "";
    setTeacherId(id);
    const platformResult = await loadPlatformWorkspace();
    setWorkspace(platformResult.workspace);
    const school = platformResult.workspace.school;
    // Sans établissement résolu, la page resterait vide sans la moindre
    // explication. On remonte alors la raison exacte du refus.
    if (!school?.id) {
      try {
        await resolveActiveSchoolContext();
        setMessage(platformResult.message || "Établissement introuvable pour ce compte.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Établissement introuvable pour ce compte.");
      }
    }
    const classResult = school?.id && school.schoolType
      ? await listClasses({ schoolId: school.id, schoolType: school.schoolType })
      : { items: [] as ClassRecord[] };
    const assignments = effectiveAssignments(platformResult.workspace, id);
    const assignedIds = new Set(assignments.map((item) => item.classId));
    const own = classResult.items.filter((item) => assignedIds.has(item.id));
    setClasses(own);
    setSelectedClassId((current) => current && own.some((item) => item.id === current) ? current : (own[0]?.id || ""));
  }

  useEffect(() => { void reload(); }, []);

  const assignments = useMemo(() => workspace ? effectiveAssignments(workspace, teacherId) : [], [workspace, teacherId]);
  const subjects = useMemo(() => {
    if (!workspace || !selectedClassId) return [] as SchoolSubject[];
    const ids = new Set(assignments.filter((item) => item.classId === selectedClassId).map((item) => item.subjectId));
    return workspace.subjects.filter((item) => item.active && ids.has(item.id));
  }, [workspace, assignments, selectedClassId]);
  const selectedClass = classes.find((item) => item.id === selectedClassId);

  function slotAt(weekday:number,start:string) {
    return workspace?.timetable.find((slot) => slot.classId === selectedClassId && slot.teacherId === teacherId && slot.weekday === weekday && slot.startsAt <= start && slot.endsAt > start);
  }
  function subjectName(id:string) { return workspace?.subjects.find((item) => item.id === id)?.label || "Matière"; }
  function openCell(weekday:number,start:string,end:string,slot?:TimetableSlot) {
    setEditing({weekday,start,end,slot});
    setSubjectId(slot?.subjectId || subjects[0]?.id || "");
    setRoom(slot?.room || selectedClass?.room || "");
  }
  async function saveCell(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !editing || !selectedClassId || !subjectId || !teacherId) return;
    if (!assignments.some((item) => item.classId === selectedClassId && item.subjectId === subjectId && item.teacherId === teacherId)) {
      setMessage("Cette matière ne fait pas partie de vos affectations pour cette classe."); return;
    }
    const existing=editing.slot;
    const slot:TimetableSlot={
      id:existing?.id || uid(), schoolId:workspace.school?.id || "local",
      academicYearId:workspace.academicYears.find((item)=>item.active)?.id || workspace.academicYears[0]?.id || "local",
      classId:selectedClassId, subjectId, teacherId, room,
      weekday:editing.weekday, startsAt:editing.start, endsAt:editing.end,
      weekLabel:"Toutes les semaines", createdAt:existing?.createdAt || now(), updatedAt:now(),
    };
    // Refuse les doubles réservations évidentes avant l'écriture.
    const conflict=workspace.timetable.find((item)=>item.id!==existing?.id && item.weekday===slot.weekday && item.startsAt < slot.endsAt && item.endsAt > slot.startsAt && (item.classId===slot.classId || item.teacherId===slot.teacherId));
    if (conflict) { setMessage("Ce créneau est déjà occupé pour cette classe ou pour vous-même."); return; }
    const next=existing ? workspace.timetable.map((item)=>item.id===existing.id?slot:item) : [slot,...workspace.timetable];
    const metadata:SyncOperationMetadata={module:"timetables",operation:existing?"update":"create",entityId:slot.id,payload:{slot},...(existing?{baseUpdatedAt:existing.updatedAt}:{})};
    const result=await savePlatformWorkspace({...workspace,timetable:next},metadata);
    setWorkspace(result.workspace); setEditing(null); setMessage(existing?"Programmation modifiée.":"Programmation ajoutée.");
  }
  async function deleteCell() {
    if (!workspace || !editing?.slot) return;
    const slot=editing.slot;
    const result=await savePlatformWorkspace({...workspace,timetable:workspace.timetable.filter((item)=>item.id!==slot.id)}, {module:"timetables",operation:"delete",entityId:slot.id,payload:{slot},baseUpdatedAt:slot.updatedAt});
    setWorkspace(result.workspace); setEditing(null); setMessage("Programmation supprimée.");
  }

  return <main className={styles.page}>
    <header className={styles.topbar}><div className={styles.brand}><Link href="/gabon-educ/tableau-de-bord" className={styles.back}><ArrowLeft/></Link><Brand/><div><b>Voir mes classes</b><small>Consultation et programmations</small></div></div></header>
    <section className={styles.shell}>
      <div className={styles.heading}><div><small>ESPACE ENSEIGNANT</small><h1>Voir mes classes</h1><p>Vous voyez uniquement les classes qui vous sont affectées. La création des classes appartient à l’administration.</p></div><div className={styles.stats}><span><GraduationCap/> {classes.length} classe(s)</span><span><Users/> {classes.reduce((n,c)=>n+c.students.length,0)} élève(s)</span></div></div>
      {message && <div className={styles.notice}>{message}<button onClick={()=>setMessage("")}><X/></button></div>}
      {!classes.length ? <div className={styles.empty}><GraduationCap/><h2>Aucune classe affectée</h2><p>La Direction ou la Pédagogie doit d’abord vous affecter à une classe et à une matière.</p></div> : <>
        <div className={styles.classGrid}>{classes.map((classe)=><button key={classe.id} className={classe.id===selectedClassId?styles.classActive:styles.classCard} onClick={()=>setSelectedClassId(classe.id)}><GraduationCap/><div><small>{classe.level} · {classe.academicYear}</small><b>{classe.name}</b><span>{classe.students.length} élève(s)</span></div></button>)}</div>
        <nav className={styles.teacherActions} aria-label="Actions pédagogiques pour la classe sélectionnée">
          <Link href={`/gabon-educ/notes?classId=${selectedClassId}`}><NotebookPen/><span><b>Saisir une note</b><small>Ouvrir le carnet de notes de {selectedClass?.name}</small></span></Link>
          <Link href={`/gabon-educ/preparer-un-cours?classId=${selectedClassId}`}><BookOpenCheck/><span><b>Planifier un cours</b><small>Préparer une fiche pour {selectedClass?.name}</small></span></Link>
          <Link href={`/gabon-educ/evaluations?new=1&classId=${selectedClassId}`}><ClipboardPenLine/><span><b>Planifier une évaluation</b><small>Créer un sujet pour {selectedClass?.name}</small></span></Link>
        </nav>
        <div className={styles.classWorkspace}>
          <section className={styles.studentsList}>
            <h2><Users/> Élèves de {selectedClass?.name}<span className={styles.count}>{selectedClass?.students.length || 0}</span></h2>
            {selectedClass && selectedClass.students.length > 0 ? (
              <ol>
                {selectedClass.students.map((student, index) => (
                  <li key={student.id} className={styles.studentRow}>
                    <span>{index + 1}.</span>
                    <div>
                      <b>{student.lastName} {student.firstName}</b>
                      {student.email && <small>{student.email}</small>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={styles.emptyStudents}>Aucun élève affecté à cette classe.</div>
            )}
          </section>
          <section className={styles.scheduleCard}><div className={styles.scheduleHead}><div><h2><CalendarDays/> Emploi du temps éditable</h2><p>{selectedClass?.name} — cliquez sur une case pour programmer votre matière.</p></div><label>Classe<select value={selectedClassId} onChange={(e)=>setSelectedClassId(e.target.value)}>{classes.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
            <div className={styles.timetableScroll}><div className="platform-timetable-board"><div className="platform-timetable-head"><b/>{DAYS.map((d)=><b key={d}>{d}</b>)}</div>{ROWS.map(([label,start,end])=><div className="platform-timetable-row" key={start}><small>{label}</small>{DAYS.map((d,i)=>{const slot=slotAt(i+1,start);return <button type="button" className={slot?"platform-timetable-cell has-course":"platform-timetable-cell"} onClick={()=>openCell(i+1,start,end,slot)} key={`${d}-${start}`}>{slot?<><strong>{subjectName(slot.subjectId)}</strong><span>{selectedClass?.name}</span><em>{slot.room||""}</em></>:<span className="empty-cell-label">+</span>}</button>})}</div>)}</div></div>
          </section>
        </div>
      </>}
    </section>
    {editing && <div className={styles.backdrop}><form className={styles.modal} onSubmit={saveCell}><header><div><h2>{editing.slot?"Modifier la programmation":"Programmer ce créneau"}</h2><p>{DAYS[editing.weekday-1]} · {editing.start} – {editing.end} · {selectedClass?.name}</p></div><button type="button" onClick={()=>setEditing(null)}><X/></button></header><label>Matière<select value={subjectId} onChange={(e)=>setSubjectId(e.target.value)} required><option value="">Choisir</option>{subjects.map((s)=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label><label>Salle <span>(facultatif)</span><input value={room} onChange={(e)=>setRoom(e.target.value)}/></label><footer>{editing.slot&&<button type="button" className={styles.delete} onClick={()=>void deleteCell()}>Supprimer</button>}<button type="button" className={styles.light} onClick={()=>setEditing(null)}>Annuler</button><button className={styles.save}>Enregistrer</button></footer></form></div>}
  </main>;
}
