"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loadPlatformWorkspace } from "@/lib/platform/store";
import type { PlatformWorkspace } from "@/lib/platform/types";
import { AdminMegaNav } from "@/components/SpaceNavigation";
import { useRouter } from "next/navigation";
import { buildSchoolStaffPayload, formValues, personnelErrorMessage } from "@/lib/personnel-record";
import { confirmWrite } from "@/lib/supabase/confirm-write";

type StaffRow = {
  id:string; employee_number:string; first_name:string; last_name:string; staff_category:string;
  job_title:string; department:string; employment_status:string; hire_date:string; contract_type:string;
  phone:string; email:string; pedagogical_user_id:string|null;
};

function PrintValue({label,value,className=""}:{label:string;value?:string;className?:string}){
  return <div className={className}><span>{label}</span><strong>{value||"—"}</strong></div>;
}

function genderLabel(value:string){
  if(value==="female")return "Femme";
  if(value==="male")return "Homme";
  return "Non renseigné";
}

function categoryLabel(value:string){
  return ({
    teacher:"Enseignant",
    administration:"Administration",
    secretariat:"Secrétariat",
    supervision:"Surveillance / vie scolaire",
    accounting:"Comptabilité",
    health:"Santé / accompagnement",
    technical:"Technique / entretien",
    other:"Autre",
  } as Record<string,string>)[value]||value||"Non renseignée";
}

function dateLabel(value?:string){
  if(!value)return "—";
  const [year,month,day]=value.split("-");
  return year&&month&&day?`${day}/${month}/${year}`:value;
}

export function PersonnelManager(){
  const router=useRouter();
  const [schoolId,setSchoolId]=useState(""); const [workspace,setWorkspace]=useState<PlatformWorkspace|null>(null); const [rows,setRows]=useState<StaffRow[]>([]); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false); const [printData,setPrintData]=useState<Record<string,string>|null>(null);
  const client=useMemo(()=>createClient(),[]);
  const reload=useCallback(async(id:string)=>{ const {data,error}=await client.from("school_staff").select("*").eq("school_id",id).order("last_name"); if(error) return error; setRows((data||[]) as StaffRow[]); return null; },[client]);
  useEffect(()=>{void (async()=>{const w=await loadPlatformWorkspace(); const id=w.workspace.school?.id||""; setWorkspace(w.workspace); setSchoolId(id); if(id) await reload(id);})();},[reload]);
  useEffect(()=>{
    if(!printData)return;
    const cleanup=()=>{document.body.classList.remove("printing-personnel");setPrintData(null);};
    document.body.classList.add("printing-personnel");
    window.addEventListener("afterprint",cleanup,{once:true});
    const timer=window.setTimeout(()=>window.print(),80);
    return()=>{window.clearTimeout(timer);window.removeEventListener("afterprint",cleanup);document.body.classList.remove("printing-personnel");};
  },[printData]);

  function preparePrint(form:HTMLFormElement|null){
    if(!form)return;
    const values:Record<string,string>={};
    new FormData(form).forEach((value,key)=>{if(typeof value==="string")values[key]=value.trim();});
    setPrintData(values);
  }
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
      confirmWrite(
        await client.from("school_staff").delete().eq("id",row.id).eq("school_id",schoolId).select("id"),
        `la suppression du dossier de ${row.first_name} ${row.last_name}`,
      );
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
      confirmWrite(
        await client.from("school_staff")
          .update({first_name:firstName.trim(),last_name:lastName.trim(),job_title:jobTitle.trim()||"Personnel",phone:phone.trim(),updated_at:new Date().toISOString()})
          .eq("id",row.id).eq("school_id",schoolId).select("id"),
        "la correction de ce dossier",
      );
      await reload(schoolId);
      setMessage("Dossier corrigé.");
    }catch(error){
      setMessage(`Erreur : ${personnelErrorMessage(error)}`);
    }finally{
      setSaving(false);
    }
  }

  async function logout(){await client.auth.signOut(); router.push("/gabon-educ");}
  const activeAcademicYear=workspace?.academicYears.find(item=>item.active)?.label||workspace?.academicYears[0]?.label||"—";
  return <div className="personnel-page-shell">
    <AdminMegaNav onLogout={()=>void logout()}/>
    <main className="personnel-page" style={{minHeight:"100vh",maxWidth:"none",margin:0,padding:24,background:"#696969",color:"#fff"}}>
      <h1>Personnel de l’établissement</h1><p>Registre RH officiel de toutes les personnes employées par l’établissement. L’enregistrement ici ne crée pas automatiquement un compte pédagogique.</p>
      <form className="personnel-form" onSubmit={submit} style={{display:"grid",gap:12,background:"rgba(255,255,255,.08)",padding:20,borderRadius:16,boxShadow:"0 8px 30px #0003",border:"1px solid rgba(255,255,255,.22)"}}>
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
        {message&&<p role="status" aria-live="polite" style={{fontWeight:700}}>{message}</p>}
        <div className="personnel-form-actions">
          <button className="personnel-print-button" type="button" onClick={event=>preparePrint(event.currentTarget.form)}><Printer/> Imprimer la fiche</button>
          <button type="submit" disabled={saving}>{saving?"Enregistrement…":"Enregistrer le personnel"}</button>
        </div>
      </form>
      <section className="personnel-list" style={{marginTop:24,background:"rgba(255,255,255,.08)",padding:20,borderRadius:16,border:"1px solid rgba(255,255,255,.22)"}}><h2>Personnel enregistré ({rows.length})</h2><div style={{overflowX:"auto"}}><table><thead><tr><th>Matricule</th><th>Nom</th><th>Catégorie</th><th>Fonction</th><th>Service</th><th>Contrat</th><th>Profil pédagogique</th><th>Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.employee_number}</td><td>{r.first_name} {r.last_name}</td><td>{r.staff_category}</td><td>{r.job_title}</td><td>{r.department}</td><td>{r.contract_type}</td><td>{r.pedagogical_user_id?"Créé":"Non créé"}</td><td style={{whiteSpace:"nowrap"}}><button type="button" onClick={()=>void editStaff(r)} disabled={saving} style={{background:"#0f5f8a",marginRight:6}}>Modifier</button><button type="button" onClick={()=>void removeStaff(r)} disabled={saving} style={{background:"#8a2f2f"}}>Supprimer</button></td></tr>)}</tbody></table></div></section>
      {printData&&<article className="personnel-print-sheet" aria-label="Fiche individuelle du personnel A4">
        <header className="personnel-print-header">
          <div><span>Année scolaire</span><strong>{activeAcademicYear}</strong></div>
          <section><strong>{workspace?.school?.name||"Établissement"}</strong><small>{[workspace?.school?.address,workspace?.school?.city,workspace?.school?.phone].filter(Boolean).join(" · ")||"Administration scolaire"}</small></section>
          <div className="right"><span>Matricule</span><strong>{printData.employee_number||"À attribuer"}</strong></div>
        </header>
        <div className="personnel-print-title"><span>Dossier administratif du personnel</span><h1>FICHE INDIVIDUELLE DE RECRUTEMENT</h1></div>
        <section className="personnel-print-section"><h2><b>1</b> Identité et coordonnées</h2><div className="personnel-print-grid three">
          <PrintValue label="Nom" value={printData.last_name}/><PrintValue label="Prénom" value={printData.first_name}/><PrintValue label="Sexe" value={genderLabel(printData.gender)}/>
          <PrintValue label="Date de naissance" value={dateLabel(printData.date_of_birth)}/><PrintValue label="Lieu de naissance" value={printData.place_of_birth}/><PrintValue label="Nationalité" value={printData.nationality}/>
          <PrintValue label="Situation matrimoniale" value={printData.marital_status}/><PrintValue label="Téléphone" value={printData.phone}/><PrintValue label="E-mail" value={printData.email}/>
          <PrintValue label="Adresse" value={printData.address}/><PrintValue label="N° pièce d’identité" value={printData.national_id_number}/><PrintValue label="N° CNSS" value={printData.cnss_number}/>
          <PrintValue label="Contact d’urgence" value={printData.emergency_contact_name}/><PrintValue label="Téléphone d’urgence" value={printData.emergency_contact_phone}/><PrintValue label="Matricule" value={printData.employee_number||"À attribuer"}/>
        </div></section>
        <section className="personnel-print-section"><h2><b>2</b> Emploi et contrat</h2><div className="personnel-print-grid three">
          <PrintValue label="Catégorie" value={categoryLabel(printData.staff_category)}/><PrintValue label="Fonction" value={printData.job_title||"Personnel"}/><PrintValue label="Service" value={printData.department}/>
          <PrintValue label="Date d’embauche" value={dateLabel(printData.hire_date)}/><PrintValue label="Type de contrat" value={printData.contract_type}/><PrintValue label="Régime de travail" value={printData.work_schedule}/>
          <PrintValue label="Début du contrat" value={dateLabel(printData.contract_start)}/><PrintValue label="Fin du contrat" value={dateLabel(printData.contract_end)}/><PrintValue label="Expérience avant recrutement" value={`${printData.years_experience||"0"} an(s)`}/>
        </div></section>
        <section className="personnel-print-section"><h2><b>3</b> Qualifications</h2><div className="personnel-print-grid three single-row">
          <PrintValue label="Diplôme le plus élevé" value={printData.highest_diploma}/><PrintValue label="Spécialité / discipline" value={printData.specialty}/><PrintValue label="Ancien employeur" value={printData.previous_employer}/>
        </div></section>
        <section className="personnel-print-section personnel-print-notes"><h2><b>4</b> Notes administratives</h2><PrintValue label="Observations" value={printData.administrative_notes}/></section>
        <section className="personnel-print-validation"><div><span>Date et signature du membre du personnel</span></div><div><span>Visa du responsable administratif</span></div><div><span>Cachet de l’établissement</span></div></section>
        <footer>Document administratif de l’établissement · Édité le {new Date().toLocaleDateString("fr-FR")}</footer>
      </article>}
    </main>
    <style jsx global>{`.form-grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.form-grid-3 label,label{display:grid;gap:5px;color:#fff;font-weight:700}input,select,textarea{padding:10px;border:1px solid #ccd5d1;border-radius:8px;background:#fff!important;color:#111!important}button{padding:11px 16px;border:0;border-radius:9px;background:#08734f;color:#fff;font-weight:700}table{width:100%;border-collapse:collapse;color:#fff}th,td{padding:9px;border-bottom:1px solid rgba(255,255,255,.18);text-align:left}th{background:rgba(0,0,0,.25)}.personnel-form-actions{display:flex;justify-content:flex-end;gap:10px}.personnel-form-actions button{display:inline-flex;align-items:center;justify-content:center;gap:8px}.personnel-form-actions svg{width:18px;height:18px}.personnel-print-button{background:#fff!important;color:#2f4f4f!important;border:1px solid #d4ded9!important}.personnel-print-sheet{display:none}@media(max-width:800px){.form-grid-3{grid-template-columns:1fr}.personnel-form-actions{flex-direction:column}.personnel-form-actions button{width:100%}}@media print{@page{size:A4 portrait;margin:15mm}html:has(body.printing-personnel),body.printing-personnel{min-height:0!important;height:auto!important;margin:0!important;background:#fff!important}body.printing-personnel .personnel-page-shell,body.printing-personnel .personnel-page,body.printing-personnel .personnel-print-sheet,body.printing-personnel .personnel-print-sheet *{visibility:visible!important}body.printing-personnel .personnel-page-shell> :not(.personnel-page),body.printing-personnel .personnel-page> :not(.personnel-print-sheet){display:none!important}body.printing-personnel .personnel-page-shell,body.printing-personnel .personnel-page{display:block!important;width:100%!important;max-width:none!important;min-height:0!important;margin:0!important;padding:0!important;background:#fff!important}body.printing-personnel .personnel-print-sheet{display:grid!important;width:100%;height:267mm;box-sizing:border-box;grid-template-rows:auto auto auto auto auto minmax(20mm,1fr) 24mm auto;gap:2mm;padding:4mm;background:#fff;color:#17221e;border:.35mm solid #789589;font-family:Arial,sans-serif;font-size:8.5pt;line-height:1.15;overflow:hidden;print-color-adjust:exact;-webkit-print-color-adjust:exact;break-inside:avoid-page;page-break-inside:avoid}.personnel-print-header{display:grid;grid-template-columns:1fr 2.5fr 1fr;align-items:center;gap:4mm;padding:1mm 2mm 2.5mm;border-bottom:.7mm solid #176448}.personnel-print-header>div{display:grid;gap:1mm}.personnel-print-header .right{text-align:right}.personnel-print-header span,.personnel-print-grid span,.personnel-print-notes span{color:#64726c;font-size:6.5pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase}.personnel-print-header>div strong{font-size:9pt;color:#17221e}.personnel-print-header section{display:grid;gap:1mm;text-align:center}.personnel-print-header section strong{color:#124f3a;font-size:14pt;text-transform:uppercase}.personnel-print-header section small{color:#64726c;font-size:6.8pt}.personnel-print-title{display:grid;place-items:center;gap:.8mm;padding:2mm 4mm;background:#e9f4ef;border:.35mm solid #85aa9b}.personnel-print-title h1{margin:0;text-align:center;font-size:14pt;color:#103e2f;letter-spacing:.035em}.personnel-print-title span{color:#4e655c;font-size:6.8pt;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.personnel-print-section{min-height:0;display:grid;grid-template-rows:auto 1fr;break-inside:avoid;border:.3mm solid #87a499}.personnel-print-section h2{display:flex;align-items:center;gap:2mm;margin:0;padding:1.4mm 2.2mm;background:#176448;color:#fff;font-size:8.5pt;text-transform:uppercase;letter-spacing:.035em}.personnel-print-section h2 b{width:5mm;height:5mm;display:grid;place-items:center;border-radius:50%;background:#fff;color:#176448;font-size:7pt}.personnel-print-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));background:#fff}.personnel-print-grid>div{min-height:9mm;padding:1.5mm 2mm;border-right:.25mm solid #b8c8c1;border-bottom:.25mm solid #b8c8c1;display:grid;align-content:center;gap:1mm;overflow-wrap:anywhere}.personnel-print-grid>div:nth-child(3n){border-right:0}.personnel-print-grid>div:nth-last-child(-n+3){border-bottom:0}.personnel-print-grid>div:nth-child(odd){background:#f8fbfa}.personnel-print-grid strong,.personnel-print-notes strong{color:#111a17;font-size:8.5pt}.personnel-print-grid.single-row>div{border-bottom:0}.personnel-print-notes>div{padding:2mm;display:grid;align-content:start;gap:1.5mm;white-space:pre-wrap;overflow-wrap:anywhere}.personnel-print-validation{display:grid;grid-template-columns:repeat(3,1fr);border:.3mm solid #87a499;break-inside:avoid}.personnel-print-validation>div{display:flex;align-items:flex-end;justify-content:center;padding:2.5mm;border-right:.25mm solid #a9bdb5}.personnel-print-validation>div:last-child{border-right:0}.personnel-print-validation span{width:100%;padding-top:1.5mm;border-top:.25mm solid #778a82;color:#53645d;text-align:center;font-size:6.8pt}.personnel-print-sheet footer{padding-top:1mm;border-top:.25mm solid #a9bdb5;text-align:center;color:#65736e;font-size:6.4pt;letter-spacing:.03em}}`}</style>
  </div>;
}
