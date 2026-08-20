"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, CheckCircle2, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_KEYS, writeLocal } from "@/lib/storage-mode";
import {
  formatSchoolProfile,
  getDefaultLevelsForSchoolType,
  getDefaultSchoolProfile,
  getSchoolProfileByKey,
  levelCycleForCode,
  normalizeSchoolSector,
  normalizeSchoolType,
  type SchoolProfileKey,
} from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";

function id() {
  return crypto.randomUUID();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "etablissement";
}

export function SchoolRegistrationForm({ profileKey }: { profileKey?: string }) {
  const router = useRouter();
  const profile = getSchoolProfileByKey(profileKey as SchoolProfileKey | undefined) || getDefaultSchoolProfile();
  const schoolType = profile.schoolType;
  const schoolSector = profile.schoolSector;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageErreur, setMessageErreur] = useState(false);
  const [sessionManquante, setSessionManquante] = useState(false);
  const levels = useMemo(() => getDefaultLevelsForSchoolType(schoolType), [schoolType]);
  const profileLabel = formatSchoolProfile(schoolType, schoolSector);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessageErreur(false);
    setSessionManquante(false);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const localSchoolId = id();
    const academicYearId = id();
    const name = String(data.get("name") || "").trim();
    const normalizedType = normalizeSchoolType(schoolType);
    const normalizedSector = normalizeSchoolSector(schoolSector);
    const academicYear = String(data.get("academicYear") || "2026-2027").trim() || "2026-2027";

    let cloudSchoolId = "";
    const cloudConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
    try {
      if (cloudConfigured) {
        const supabase = createClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
          // Sans session ouverte, la fonction Supabase refuserait l'appel.
          // On le dit clairement plutôt que de laisser croire à une panne.
          setSessionManquante(true);
          setMessageErreur(true);
          setMessage("Vous n’êtes pas connecté. L’enregistrement d’un établissement exige une session ouverte : créez le compte responsable ou connectez-vous, puis revenez à ce formulaire.");
          setSaving(false);
          return;
        }
        {
          const { data: createdSchoolId, error } = await supabase.rpc("register_school_from_onboarding", {
            school_name: name,
            requested_school_type: normalizedType,
            requested_school_sector: normalizedSector,
            registration_number: String(data.get("registrationNumber") || ""),
            province_name: String(data.get("province") || "Estuaire"),
            city_name: String(data.get("city") || "Libreville"),
            school_address: String(data.get("address") || ""),
            school_phone: String(data.get("phone") || ""),
            school_email: String(data.get("email") || ""),
            academic_year_label: academicYear,
          });
          if (error) {
            if (error.code === "PGRST202") {
              throw new Error("La fonction Supabase register_school_from_onboarding est absente. Exécutez la migration 047_v01098_restore_onboarding_rpc.sql dans Supabase.");
            }
            throw error;
          }
          cloudSchoolId = String(createdSchoolId || "");
        }
      }
    } catch (error) {
      setMessageErreur(true);
      setMessage(error instanceof Error ? `Enregistrement Supabase impossible : ${error.message}` : "Enregistrement Supabase impossible.");
      setSaving(false);
      return;
    }

    if (cloudConfigured && !cloudSchoolId) {
      setMessageErreur(true);
      setMessage("Supabase n’a renvoyé aucun identifiant d’établissement. Aucune redirection n’a été effectuée afin d’éviter d’ouvrir un ancien établissement.");
      setSaving(false);
      return;
    }

    const schoolId = cloudSchoolId || localSchoolId;
    const school = {
      id: schoolId,
      name,
      acronym: String(data.get("acronym") || ""),
      schoolType: normalizedType,
      schoolSector: normalizedSector,
      registrationNumber: String(data.get("registrationNumber") || ""),
      province: String(data.get("province") || "Estuaire"),
      city: String(data.get("city") || "Libreville"),
      district: "",
      neighborhood: "",
      address: String(data.get("address") || ""),
      phone: String(data.get("phone") || ""),
      email: String(data.get("email") || ""),
      website: "",
      logoUrl: "",
      stampUrl: "",
      headName: String(data.get("headName") || ""),
      motto: String(data.get("motto") || ""),
      activeAcademicYearId: academicYearId,
      periodSystem: "trimester" as const,
      maxScore: PRODUCT.maxScore,
      passThreshold: PRODUCT.passThreshold,
      bulletinModel: PRODUCT.bulletinLabel,
      timezone: "Africa/Libreville",
      language: "fr",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    writeLocal(STORAGE_KEYS.activeSchool, schoolId);
    writeLocal(STORAGE_KEYS.school, school);
    writeLocal("gabon-educ-plus:expected-school-profile", {
      schoolId,
      schoolType: normalizedType,
      schoolSector: normalizedSector,
      label: profileLabel,
      createdAt: now,
    });
    writeLocal(STORAGE_KEYS.academicStructure, {
      academicYears: [{
        id: academicYearId,
        schoolId,
        label: academicYear,
        startsOn: `${academicYear.slice(0, 4) || "2026"}-09-01`,
        endsOn: `${String(Number(academicYear.slice(0, 4)) + 1 || 2027)}-07-31`,
        active: true,
        archived: false,
        createdAt: now,
        updatedAt: now,
      }],
      periods: [1, 2, 3].map((index) => ({
        id: id(),
        schoolId,
        academicYearId,
        label: `Trimestre ${index}`,
        startsOn: "",
        endsOn: "",
        active: index === 1,
        locked: false,
        lockedAt: "",
        reopenedReason: "",
        updatedAt: now,
      })),
      levels: levels.map((code) => ({
        id: id(),
        schoolId,
        code,
        label: code,
        cycle: levelCycleForCode(code),
        active: true,
      })),
      updatedAt: now,
    });
    localStorage.setItem("gabon-educ-plus:registration-summary", JSON.stringify({ profile: profileLabel, schoolName: name, savedAt: now }));

    setMessage("Établissement enregistré. Redirection vers la page de connexion…");
    setTimeout(() => {
      router.push("/gabon-educ/connexion-administration?registered=1");
      router.refresh();
    }, 650);
    setSaving(false);
  }

  return (
    <form className="school-registration-form" onSubmit={submit}>
      <div className="registration-profile-summary">
        <Building2 aria-hidden="true" />
        <div>
          <span>Profil de l’établissement</span>
          <strong>{profileLabel}</strong>
        </div>
      </div>
      <div className="levels-preview">
        <span>Niveaux qui seront préparés automatiquement :</span>
        <div>{levels.map((level) => <b key={level}>{level}</b>)}</div>
      </div>
      <div className="form-row">
        <label>Nom de l’établissement<input name="name" required placeholder="Ex. Établissement Mbélé" /></label>
        <label>Sigle <span>(facultatif)</span><input name="acronym" placeholder="EM" /></label>
      </div>
      <div className="form-row">
        <label>Responsable / Directeur<input name="headName" required placeholder="Nom du responsable" /></label>
        <label>N° d’enregistrement <span>(facultatif)</span><input name="registrationNumber" /></label>
      </div>
      <div className="form-row">
        <label>Province<input name="province" defaultValue="Estuaire" /></label>
        <label>Ville<input name="city" defaultValue="Libreville" /></label>
      </div>
      <label>Adresse<input name="address" placeholder="Quartier, rue, BP…" /></label>
      <div className="form-row">
        <label>Téléphone<input name="phone" placeholder="+241…" /></label>
        <label>E-mail de l’établissement<input name="email" type="email" placeholder="contact@etablissement.ga" /></label>
      </div>
      <div className="form-row">
        <label>Année scolaire<input name="academicYear" defaultValue="2026-2027" /></label>
        <label>Devise <span>(facultatif)</span><input name="motto" /></label>
      </div>
      {message && (
        <p className={messageErreur ? "form-message form-message-erreur" : "form-message"} role={messageErreur ? "alert" : "status"}>
          {messageErreur ? <AlertCircle aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />} {message}
          {sessionManquante && (
            <>
              {" "}
              <Link href="/gabon-educ/connexion-administration">Aller à la connexion Administration</Link>
            </>
          )}
        </p>
      )}
      <button className="btn btn-primary btn-large full" disabled={saving}>
        {saving && <LoaderCircle className="spin-icon" aria-hidden="true" />}
        Enregistrer l’établissement et aller à la connexion
      </button>
    </form>
  );
}
