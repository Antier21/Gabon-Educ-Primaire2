"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_KEYS, readLocal, writeLocal } from "@/lib/storage-mode";
import type { SubscriptionStatus } from "@/lib/subscriptions/types";

type Row={school_id:string;plan_code:string;status:SubscriptionStatus;expires_at:string;grace_period_ends_at:string|null;schools:{name:string;school_type:string|null;school_sector:string|null}|null};
type ServiceSubscriptionRpcRow={school_id:string;plan_code:string;status:SubscriptionStatus;expires_at:string;grace_period_ends_at:string|null;school_name:string|null;school_type:string|null;school_sector:string|null};

export default function ServiceSubscriptionsPage(){
 const [rows,setRows]=useState<Row[]>([]); const [message,setMessage]=useState(""); const [refreshing,setRefreshing]=useState(false); const [activeSchoolId,setActiveSchoolId]=useState("");
 async function load(showConfirmation=false){
  setRefreshing(true);
  const supabase=createClient();
  const {data:userData,error:userError}=await supabase.auth.getUser();
  if(userError||!userData.user){setRows([]);setMessage("Session Supabase absente ou expirée. Reconnectez-vous.");setRefreshing(false);return;}
  const {data:isSuper,error:roleError}=await supabase.rpc("is_super_admin");
  if(roleError){setRows([]);setMessage(`Vérification super-admin impossible : ${roleError.message}`);setRefreshing(false);return;}
  if(isSuper!==true){setRows([]);setMessage("Accès réservé au super administrateur.");setRefreshing(false);return;}
  const {data,error}=await supabase.rpc("get_service_subscriptions");
  if(error){setRows([]);setMessage(`Chargement des abonnements impossible : ${error.message}`);setRefreshing(false);return;}
  const nextRows=((data||[]) as ServiceSubscriptionRpcRow[]).map(row=>({school_id:row.school_id,plan_code:row.plan_code,status:row.status,expires_at:row.expires_at,grace_period_ends_at:row.grace_period_ends_at,schools:{name:row.school_name||"Établissement",school_type:row.school_type,school_sector:row.school_sector}}));
  setRows(nextRows);
  let selected=readLocal<string>(STORAGE_KEYS.activeSchool,"");
  if(selected&&!nextRows.some(row=>row.school_id===selected))selected="";
  setActiveSchoolId(selected);
  if(showConfirmation){setMessage(`Données actualisées à ${new Date().toLocaleTimeString("fr-FR")}.`);}else{setMessage("");}
  setRefreshing(false);
 }
 useEffect(()=>{void load();},[]);
 function selectSchool(row:Row){
  const now=new Date().toISOString();
  writeLocal(STORAGE_KEYS.activeSchool,row.school_id);
  writeLocal(STORAGE_KEYS.school,{id:row.school_id,name:row.schools?.name||"Établissement",acronym:"",schoolType:(row.schools?.school_type as "primary"|"middle_school"|"high_school"|"complex_school")||"primary",schoolSector:(row.schools?.school_sector as "public"|"private")||"private",registrationNumber:"",province:"",city:"",district:"",neighborhood:"",address:"",phone:"",email:"",website:"",logoUrl:"",stampUrl:"",headName:"",motto:"",activeAcademicYearId:"",periodSystem:"trimester",maxScore:20,passThreshold:10,bulletinModel:"standard",timezone:"Africa/Libreville",language:"fr",isActive:true,createdAt:now,updatedAt:now});
  setActiveSchoolId(row.school_id);
  setMessage(`Établissement actif : ${row.schools?.name||row.school_id}.`);
 }
 async function change(row:Row,status:SubscriptionStatus){const expires=new Date(); expires.setDate(expires.getDate()+(status==="active"?30:0)); const grace=new Date(expires); grace.setDate(grace.getDate()+7); const {error}=await createClient().rpc("set_school_subscription",{p_school_id:row.school_id,p_status:status,p_plan_code:row.plan_code,p_expires_at:expires.toISOString(),p_grace_period_ends_at:["active","grace_period"].includes(status)?grace.toISOString():null,p_reason:`Action manuelle : ${status}`}); setMessage(error?error.message:"Statut mis à jour."); await load(); if(!error){window.dispatchEvent(new CustomEvent("gabon-educ:subscription-changed",{detail:{schoolId:row.school_id,status}}));}}
 return <main className="subscription-page service-subscriptions"><header><Link href="/gabon-educ/espaces"><ArrowLeft/>Espaces</Link><div><Building2/><h1>GABON EDUC+ SERVICE — abonnements</h1></div><Link href="/gabon-educ-service">Centre de pilotage</Link></header>{message&&<p className="subscription-notice">{message}</p>}
 <section className="service-table"><button onClick={()=>void load(true)} disabled={refreshing} aria-busy={refreshing}><RefreshCcw/>{refreshing?"Actualisation…":"Actualiser"}</button><div className="service-table-head"><span>Établissement</span><span>Formule</span><span>Échéance</span><span>Statut</span><span>Actions</span></div>{rows.map(row=><article key={row.school_id}><span><b>{row.schools?.name||row.school_id}</b></span><span>{row.plan_code}</span><span>{new Date(row.expires_at).toLocaleDateString("fr-FR")}</span><span>{row.status}</span><span><button onClick={()=>selectSchool(row)} disabled={activeSchoolId===row.school_id}>{activeSchoolId===row.school_id?"Établissement actif":"Gérer"}</button><button onClick={()=>void change(row,"active")}>Activer 30 j</button><button onClick={()=>void change(row,"grace_period")}>Délai</button><button onClick={()=>void change(row,"suspended")}>Suspendre</button></span></article>)}</section></main>;
}
