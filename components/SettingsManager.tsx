"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Bell, Cloud, Languages, LogOut, Moon, Save, ShieldCheck } from "lucide-react";
import { Brand } from "./Brand";
import { defaultProfile, loadProfile, saveProfile, signOut, type TeacherProfile } from "@/lib/profile-store";
import { storageModeLabel, type StorageMode } from "@/lib/storage-mode";
import styles from "./Workspace.module.css";
import { useRouter } from "next/navigation";
import { PRODUCT } from "@/lib/product-edition";
import { getDefaultLevelsForSchoolType, getDefaultSubjectsForSchoolType } from "@/lib/school-profiles";

export function SettingsManager() {
  const productSubjects = getDefaultSubjectsForSchoolType(PRODUCT.defaultSchoolType);
  const productLevels = getDefaultLevelsForSchoolType(PRODUCT.defaultSchoolType);
  const router = useRouter(); const [profile, setProfile] = useState<TeacherProfile>(defaultProfile); const [mode, setMode] = useState<StorageMode>("demo");
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { void loadProfile().then(result => { setProfile(result.profile); setMode(result.mode); setMessage(result.message); }).catch(() => setError("Impossible de charger le profil.")).finally(() => setLoading(false)); }, []);
  async function submit(event: FormEvent) { event.preventDefault(); setError(""); try { const result = await saveProfile(profile); setProfile(result.profile); setMode(result.mode); setMessage(result.mode === "cloud" ? "Profil enregistré et synchronisé." : "Profil enregistré sur cet appareil."); } catch (e) { setError(e instanceof Error ? e.message : "Enregistrement impossible."); } }
  async function logout() { await signOut(); router.push("/gabon-educ/connexion"); router.refresh(); }
  const set = (key: keyof TeacherProfile, value: string) => setProfile(current => ({ ...current, [key]: value }));
  return <main className={styles.page}><header className={styles.topbar}><div className={styles.topLeft}><Link className="icon-btn" href="/gabon-educ/tableau-de-bord"><ArrowLeft/></Link><Brand/><div><small>Espace enseignant</small><b>Paramètres</b></div></div><button className="btn btn-light" onClick={() => void logout()}><LogOut/> Déconnexion</button></header><section className={styles.shell}>
    <div className={styles.heading}><div><span className={styles.eyebrow}>COMPTE ENSEIGNANT</span><h1>Profil et préférences</h1><p>Personnalisez les informations utilisées dans votre espace pédagogique.</p></div><span className={`${styles.mode} ${mode === "offline" ? styles.offline : ""}`}><Cloud/> {storageModeLabel(mode)}</span></div>
    {message && <div className={`${styles.notice} ${styles.success}`}>{message}</div>}{error && <div className={`${styles.notice} ${styles.error}`}>{error}</div>}
    <div className={styles.grid}><form className={`${styles.card} ${styles.form}`} onSubmit={submit}><h2>Informations personnelles</h2><div className={styles.two}><label>Prénom<input value={profile.firstName} onChange={e=>set("firstName",e.target.value)} required/></label><label>Nom<input value={profile.lastName} onChange={e=>set("lastName",e.target.value)} required/></label></div><label>Adresse e-mail<input value={profile.email} readOnly disabled/></label><div className={styles.two}><label>Téléphone<input value={profile.phone} onChange={e=>set("phone",e.target.value)}/></label><label>Ville<input value={profile.city} onChange={e=>set("city",e.target.value)} placeholder="Libreville"/></label></div><label>Établissement<input value={profile.schoolName} onChange={e=>set("schoolName",e.target.value)}/></label><div className={styles.two}><label>Matière principale<select value={profile.mainSubject} onChange={e=>set("mainSubject",e.target.value)}>{productSubjects.map(subject=><option key={subject}>{subject}</option>)}</select></label><label>Niveau principal<select value={profile.mainGrade} onChange={e=>set("mainGrade",e.target.value)}>{productLevels.map(level=><option key={level}>{level}</option>)}</select></label></div><div className={styles.actions}><button className="btn btn-primary" disabled={loading}><Save/> Enregistrer</button></div></form>
      <aside className={styles.card}><h2>Synchronisation</h2><p>État actuel de votre espace.</p><div className={styles.placeholder}><div><Cloud/> <b>Stockage actif :</b> {storageModeLabel(mode)}</div><div><ShieldCheck/> Les données locales sont conservées lors d’une interruption réseau.</div></div><div className={styles.sectionTitle}><h2>Prochainement</h2></div><div className={styles.placeholder}><div><Bell/> Notifications</div><div><Languages/> Langue de l’interface</div><div><Moon/> Apparence</div><div>Abonnement — non disponible dans cette version</div></div><p className={styles.muted}>{PRODUCT.name} v0.12.0 — Plateforme établissement</p></aside></div>
  </section></main>;
}
