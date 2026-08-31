"use client";

import { useEffect, useState } from "react";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { sanitizeRichText } from "@/lib/lesson-book/rich-text";
import { createClient } from "@/lib/supabase/client";

type Teacher = { id: string; first_name: string; last_name: string; role: string };
type Entry = { id: string; session_date: string; title: string; content_html: string; program_elements: string; category: string; is_published: boolean };

export function PedagogyLessonBookReader() {
  const [schoolId,setSchoolId]=useState("");
  const [teachers,setTeachers]=useState<Teacher[]>([]);
  const [teacherId,setTeacherId]=useState("");
  const [entries,setEntries]=useState<Entry[]>([]);
  const [message,setMessage]=useState("Chargement…");

  useEffect(()=>{ void (async()=>{
    try {
      const context=await resolveActiveSchoolContext();
      setSchoolId(context.school.id);
      const result=await createClient().rpc("list_school_access_users",{p_school_id:context.school.id});
      if(result.error) throw result.error;
      const rows=((result.data||[]) as Teacher[]).filter(row=>["teacher","head_teacher"].includes(row.role));
      setTeachers(rows); setMessage(rows.length?"Sélectionnez un enseignant.":"Aucun compte enseignant actif.");
    } catch(error) { setMessage(error instanceof Error?error.message:"Chargement impossible."); }
  })(); },[]);

  useEffect(()=>{ if(!schoolId||!teacherId){setEntries([]);return;} void (async()=>{
    setMessage("Chargement du cahier…");
    const result=await createClient().from("lesson_book_entries")
      .select("id,session_date,title,content_html,program_elements,category,is_published")
      .eq("school_id",schoolId).eq("teacher_id",teacherId).order("session_date",{ascending:false});
    if(result.error){setMessage(result.error.message);return;}
    setEntries((result.data||[]) as Entry[]); setMessage(result.data?.length?"":"Aucune séance enregistrée.");
  })(); },[schoolId,teacherId]);

  return <main style={{maxWidth:1000,margin:"32px auto",padding:20}}>
    <h1>Cahiers de textes des enseignants</h1>
    <p>Consultation en lecture seule des séances de l’établissement actif.</p>
    <label>Enseignant <select value={teacherId} onChange={event=>setTeacherId(event.target.value)}>
      <option value="">Choisir</option>{teachers.map(item=><option key={`${item.id}-${item.role}`} value={item.id}>{item.first_name} {item.last_name} — {item.role==="head_teacher"?"Titulaire":"Enseignant"}</option>)}
    </select></label>
    {message&&<p>{message}</p>}
    <div style={{display:"grid",gap:16,marginTop:24}}>{entries.map(entry=><article key={entry.id} style={{background:"white",border:"1px solid #dde8e3",borderRadius:12,padding:18}}>
      <small>{entry.session_date} · {entry.category||"Séance"} · {entry.is_published?"Publiée":"Brouillon"}</small>
      <h2>{entry.title||"Séance sans titre"}</h2>
      {entry.program_elements&&<p><strong>Éléments du programme :</strong> {entry.program_elements}</p>}
      <div dangerouslySetInnerHTML={{__html:sanitizeRichText(entry.content_html)}} />
    </article>)}</div>
  </main>;
}
