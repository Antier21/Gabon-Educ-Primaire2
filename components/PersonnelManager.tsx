"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadPlatformWorkspace } from "@/lib/platform/store";
import { AdminMegaNav } from "@/components/SpaceNavigation";
import { useRouter } from "next/navigation";
import { buildSchoolStaffPayload, formValues, personnelErrorMessage } from "@/lib/personnel-record";

type StaffRow = {
  id:string; employee_number:string; first_name:string; last_name:string; staff_category:string;
  job_title:string; department:string; employment_status:string; hire_date:string; contract_type:string;
  phone:string; email:string; pedagogical_user_id:string|null;
};

export function PersonnelManager(){
  const router=useRouter();
  const [schoolId,setSchoolId]=useState(""); const [rows,setRows]=useState<StaffRow[]>([]); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  const client=useMemo(()=>createClient(),[]);
  const reload=useCallback(async(id:string)=>{ const {data,error}=await client.from("school_staff").select("*").eq("school_id",id).order("last_name"); if(error) return error; setRows((data||[]) as StaffRow[]); return null; },[client]);
  useEffect(()=>{void (async()=>{const w=await loadPlatformWorkspace(); const id=w.workspace.school?.id||""; setSchoolId(id); if(id) await reload(id);})();},[reload]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const form=e.currentTarget;
    if(saving)return;
    setSaving(true); setMessage("");
    try{
      const payload=buildSchoolStaffPayload(formValues(new FormData(form)),schoolId);
      // created_by est volontairement omis : Supabase applique auth.uid() côté base.
      // Cela évite un appel réseau auth.getUser() supplémentaire avant chaque insertion.
      const {error}=await client.from("school_staff").insert(payload);
      if(error)throw error;
      form.reset();
      const reloadError=await reload(schoolId);
      setMessage(reloadError
        ? "Personnel enregistré. Actualisez la page pour voir la liste complète."
        : "Personnel enregistré avec succès.");
    }catch(error){
      setMessage(`Erreur : ${personnelErrorMessage(error)}`);
    }finally{
      setSaving(false);
    }
  }
  /**
   * Suppression d'un dossier de personnel.
   *
   * Refuser et expliquer : un membre du personnel dont le compte pédagogique
   * a été créé ne peut pas disparaître sans que cet accès soit d'abord retiré,
   * sinon un identifiant subsisterait sans dossier RH correspondant.
   */
  async function removeStaff(row:StaffRow){
    setMessage("");
    if(row.pedagogical_user_id){
      setMessage("Suppression impossible : un compte pédagogique est rattaché à ce dossier. Supprimez d’abord son accès dans Comptes et identifiants.");
      return;
    }
    if(!confirm(`Supprimer définitivement le dossier de ${row.first_name} ${row.last_name} ?`))return;
    setSaving(true);
    try{
      const {error}=await client.from("school_staff").delete().eq("id",row.id).eq("school_id",schoolId);
      if(error)throw error;
      await reload(schoolId);
      setMessage("Dossier supprimé.");
    }catch(error){
      setMessage(`Erreur : ${personnelErrorMessage(error)}`);
    }finally{
      setSaving(false);
    }
  }

  /** Correction rapide des champs les plus souvent saisis de travers. */
  async function editStaff(row:StaffRow){
    const firstName=prompt("Prénom",row.first_name); if(firstName===null)return;
    const lastName=prompt("Nom",row.last_name); if(lastName===null)return;
    const jobTitle=prompt("Fonction",row.job_title||""); if(jobTitle===null)return;
    const phone=prompt("Téléphone",row.phone||""); if(phone===null)return;
    setMessage(""); setSaving(true);
    try{
      const {error}=await client.from("school_staff")
        .update({first_name:firstName.trim(),last_name:lastName.trim(),job_title:jobTitle.trim()||"Personnel",phone:phone.trim(),updated_at:new Date().toISOString()})
        .eq("id",row.id).eq("school_id",schoolId);
      if(error)throw error;
      await reload(schoolId);
      setMessage("Dossier corrigé.");
    }catch(error){
      setMessage(`Erreur : ${personnelErrorMessage(error)}`);
    }finally{
      setSaving(false);
    }
  }

  async function logout(){await client.auth.signOut(); router.push("/gabon-educ");}
  return <>
    <AdminMegaNav onLogout={()=>void logout()}/>
    <main style={{minHeight:"100vh",maxWidth:"none",margin:0,padding:24,background:"#696969",color:"#fff"}}>
      <h1>Personnel de l’établissement</h1><p>Registre RH officiel de toutes les personnes employées par l’établissement. L’enregistrement ici ne crée pas automatiquement un compte pédagogique.</p>
      <form onSubmit={submit} style={{display:"grid",gap:12,background:"rgba(255,255,255,.08)",padding:20,borderRadius:16,boxShadow:"0 8px 30px #0003",border:"1px solid rgba(255,255,255,.22)"}}>
        <h2>Dossier de recrutement</h2>
        <div className="form-grid-3"><label>Matricule <small>(automatique si vide)</small><input name="employee_number"/></label><label>Prénom<input name="first_name" required/></label><label>Nom<input name="last_name" required/></label></div>
        <div className="form-grid-3"><label>Sexe<select name="gender"><option value="">—</option><option value="female">Femme</option><option value="male">Homme</option></select></label><label>Date de naissance<input type="date" name="date_of_birth"/></label><label>Lieu de naissance<input name="place_of_birth"/></label></div>
        <div className="form-grid-3"><label>Nationalité<input name="nationality"/></label><label>Situation matrimoniale<input name="marital_status"/></label><label>Adresse<input name="address"/></label></div>
        <div className="form-grid-3"><label>Téléphone<input name="phone"/></label><label>E-mail<input type="email" name="email"/></label><label>N° pièce d’identité<input name="national_id_number"/></label></div>
        <div className="form-grid-3"><label>N° CNSS<input name="cnss_number"/></label><label>Contact d’urgence<input name="emergency_contact_name"/></label><label>Téléphone urgence<input name="emergency_contact_phone"/></label></div>
        <h3>Emploi et contrat</h3>
        <div className="form-grid-3"><label>Catégorie<select name="staff_category" required><option value="teacher">Enseignant</option><option value="administration">Administration</option><option value="secretariat">Secrétariat</option><option value="supervision">Surveillance / vie scolaire</option><option value="accounting">Comptabilité</option><option value="health">Santé / accompagnement</option><option value="technical">Technique / entretien</option><option value="other">Autre</option></select></label><label>Fonction <small>(« Personnel » si vide)</small><input name="job_title" placeholder="Ex. Enseignant de français"/></label><label>Service<input name="department"/></label></div>
        <div className="form-grid-3"><label>Date d’embauche<input type="date" name="hire_date" defaultValue={new Date().toISOString().slice(0,10)}/></label><label>Type de contrat<select name="contract_type" required><option>CDI</option><option>CDD</option><option>Vacataire</option><option>Stage</option><option>Fonctionnaire affecté</option><option>Autre</option></select></label><label>Régime de travail<input name="work_schedule" placeholder="Temps plein, temps partiel…"/></label></div>
        <div className="form-grid-3"><label>Début du contrat<input type="date" name="contract_start"/></label><label>Fin du contrat<input type="date" name="contract_end"/></label><label>Ancienneté avant recrutement (années)<input type="number" min="0" name="years_experience" defaultValue="0"/></label></div>
        <h3>Qualifications</h3>
        <div className="form-grid-3"><label>Diplôme le plus élevé<input name="highest_diploma"/></label><label>Spécialité / discipline<input name="specialty"/></label><label>Ancien employeur<input name="previous_employer"/></label></div>
        <label>Notes administratives<textarea name="administrative_notes" rows={3}/></label>
        {message&&<p role="status" aria-live="polite" style={{fontWeight:700}}>{message}</p>}<button type="submit" disabled={saving}>{saving?"Enregistrement…":"Enregistrer le personnel"}</button>
      </form>
      <section style={{marginTop:24,background:"rgba(255,255,255,.08)",padding:20,borderRadius:16,border:"1px solid rgba(255,255,255,.22)"}}><h2>Personnel enregistré ({rows.length})</h2><div style={{overflowX:"auto"}}><table><thead><tr><th>Matricule</th><th>Nom</th><th>Catégorie</th><th>Fonction</th><th>Service</th><th>Contrat</th><th>Profil pédagogique</th><th>Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.employee_number}</td><td>{r.first_name} {r.last_name}</td><td>{r.staff_category}</td><td>{r.job_title}</td><td>{r.department}</td><td>{r.contract_type}</td><td>{r.pedagogical_user_id?"Créé":"Non créé"}</td><td style={{whiteSpace:"nowrap"}}><button type="button" onClick={()=>void editStaff(r)} disabled={saving} style={{background:"#0f5f8a",marginRight:6}}>Modifier</button><button type="button" onClick={()=>void removeStaff(r)} disabled={saving} style={{background:"#8a2f2f"}}>Supprimer</button></td></tr>)}</tbody></table></div></section>
    </main>
    <style jsx global>{`.form-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.form-grid-3 label,label{display:grid;gap:5px;color:#fff;font-weight:700}input,select,textarea{padding:10px;border:1px solid #ccd5d1;border-radius:8px;background:#fff!important;color:#111!important}button{padding:11px 16px;border:0;border-radius:9px;background:#08734f;color:#fff;font-weight:700}table{width:100%;border-collapse:collapse;color:#fff}th,td{padding:9px;border-bottom:1px solid rgba(255,255,255,.18);text-align:left}th{background:rgba(0,0,0,.25)}@media(max-width:800px){.form-grid-3{grid-template-columns:1fr}}`}</style>
  </>;
}
