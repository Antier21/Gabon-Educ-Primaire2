"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardList, Edit3, FileText, LoaderCircle, Save, Trash2, UserRoundCheck } from "lucide-react";
import { Brand } from "@/components/Brand";
import { SubscriptionReadOnlyPanel } from "@/components/SubscriptionReadOnlyPanel";
import { cacheStudentInClass, listClasses, type ClassRecord } from "@/lib/class-store";
import { loadPlatformWorkspace, savePlatformWorkspace } from "@/lib/platform/store";
import type { PlatformWorkspace, StudentRecord } from "@/lib/platform/types";
import { filterLevelsForSchoolType, formatSchoolProfile, getDefaultLevelsForSchoolType } from "@/lib/school-profiles";
import { LEGACY_KEYS, STORAGE_KEYS } from "@/lib/storage-mode";
import { useSubscriptionAccess } from "@/lib/subscriptions/use-subscription-access";
import { resolveEnrollmentSubmitIntent } from "@/lib/enrollment/submit-intent";
import {
  deleteEnrollmentForm,
  loadEnrollmentForms,
  saveEnrollmentForm,
  type EnrollmentRecord,
} from "@/lib/enrollment/store";

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function field(data: FormData, name: string) {
  return String(data.get(name) || "").trim();
}

function genderLabel(value: string) {
  if (value === "male") return "Masculin";
  if (value === "female") return "Féminin";
  return "Non renseigné";
}

function classLabel(classes: ClassRecord[], classId: string) {
  const found = classes.find((item) => item.id === classId);
  return found ? `${found.name} (${found.level})` : "Classe non renseignée";
}

function buildNotes(data: Record<string, string>) {
  return [
    data.actNumber ? `Acte de naissance : ${data.actNumber}` : "",
    data.previousSchool ? `Dernier établissement : ${data.previousSchool}` : "",
    data.learnerStatus ? `Statut de l’apprenant : ${data.learnerStatus}` : "",
    data.pathology ? `Pathologie particulière : ${data.pathology}` : "",
    data.socialSituation ? `Situation sociale : ${data.socialSituation}` : "",
    data.handicap ? `Handicap : ${data.handicap}` : "",
    data.fatherName ? `Père : ${data.fatherName} (${data.fatherProfession || "profession non renseignée"})` : "",
    data.motherName ? `Mère : ${data.motherName} (${data.motherProfession || "profession non renseignée"})` : "",
    data.tutorName ? `Tuteur : ${data.tutorName} (${data.tutorProfession || "profession non renseignée"})` : "",
  ].filter(Boolean).join("\n");
}

function toStudent(record: EnrollmentRecord, workspace: PlatformWorkspace): StudentRecord {
  const data = record.data;
  return {
    id: record.linkedStudentId || id(),
    schoolId: workspace.school?.id || record.schoolId || "local",
    academicYearId: workspace.academicYears.find((item) => item.active)?.id || workspace.academicYears[0]?.id || record.academicYearId || "local",
    classId: data.classId || "",
    registrationNumber: data.registrationNumber || "",
    firstName: data.firstName || "",
    lastName: data.lastName || "",
    gender: (data.gender || "") as StudentRecord["gender"],
    dateOfBirth: data.dateOfBirth || "",
    placeOfBirth: data.placeOfBirth || "",
    nationality: data.nationality || "Gabonaise",
    photoUrl: "",
    address: data.residence || "",
    phone: data.phone1 || "",
    email: data.email || "",
    previousSchool: data.previousSchool || "",
    enrolledOn: new Date().toISOString().slice(0, 10),
    status: "active",
    specialNeeds: [data.pathology, data.socialSituation, data.handicap].filter(Boolean).join(" · "),
    emergencyContact: data.tutorPhone1 || data.fatherPhone1 || data.motherPhone1 || data.phone2 || "",
    administrativeNotes: buildNotes(data),
    limitedMedicalNotes: data.pathology || "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function PrintValue({ label, value }: { label: string; value?: string }) {
  return <div><span>{label}</span><strong>{value || "—"}</strong></div>;
}

export function StudentEnrollmentManager() {
  const subscriptionAccess = useSubscriptionAccess();
  const [workspace, setWorkspace] = useState<PlatformWorkspace | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [editing, setEditing] = useState<EnrollmentRecord | null>(null);
  const [message, setMessage] = useState("Chargement…");
  const [saving, setSaving] = useState(false);
  const [printData, setPrintData] = useState<Record<string, string> | null>(null);

  /**
   * Suppression d'une fiche d'inscription.
   *
   * La fiche est un document de saisie : la supprimer n'efface pas le dossier
   * de l'élève, qui appartient à l'établissement dès la validation. La
   * confirmation le dit explicitement, pour éviter qu'un secrétariat croie
   * avoir désinscrit un élève alors qu'il n'a retiré qu'un formulaire.
   */
  async function removeEnrollment(record: EnrollmentRecord) {
    const name = `${record.data.lastName} ${record.data.firstName}`.trim();
    const validated = record.status === "validated";
    if (
      !confirm(
        validated
          ? `Supprimer la fiche d’inscription de ${name} ?\n\nLe dossier élève déjà créé est conservé : pour le retirer également, passez par Scolarité.`
          : `Supprimer définitivement la fiche d’inscription de ${name} ?`,
      )
    )
      return;
    const result = await deleteEnrollmentForm(record);
    setEnrollments(enrollments.filter((item) => item.id !== record.id));
    if (editing?.id === record.id) setEditing(null);
    setMessage(
      result.syncError ||
        (validated
          ? "Fiche supprimée. Le dossier élève reste enregistré dans Scolarité."
          : "Fiche d’inscription supprimée."),
    );
  }

  const reload = useCallback(async () => {
    const [workspaceResult, classResult] = await Promise.all([loadPlatformWorkspace(), listClasses()]);
    const activeSchoolId = workspaceResult.workspace.school?.id || "";
    setWorkspace(workspaceResult.workspace);
    setClasses(classResult.items.filter((item) => !activeSchoolId || item.schoolId === activeSchoolId));
    const forms = await loadEnrollmentForms(activeSchoolId);
    setEnrollments(forms.items);
    return forms;
  }, []);

  useEffect(() => {
    void (async () => {
      const forms = await reload();
      // Le message de démarrage rend compte de ce qui s'est réellement passé :
      // une fiche restée sur un ancien poste vient peut-être d'être remontée
      // en base, et le secrétariat doit le savoir.
      setMessage(
        forms.syncError ||
          (forms.migrated
            ? `${forms.migrated} fiche(s) de ce poste transférée(s) en ligne. Formulaire prêt.`
            : "Formulaire d’inscription prêt."),
      );
    })();
    // ENROLLMENTS_KEY est volontairement absent de cette liste : le
    // rechargement écrit lui-même le cache des fiches, et se réabonner à sa
    // propre écriture ferait boucler la page indéfiniment.
    const onStorage = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      // Le tableau est typé explicitement : composé uniquement de constantes,
      // TypeScript en déduirait sinon un type littéral fermé, dans lequel
      // chercher une clé de provenance inconnue devient une erreur.
      const watched: string[] = [STORAGE_KEYS.classes, LEGACY_KEYS.classes, STORAGE_KEYS.students];
      if (detail?.key && watched.includes(detail.key)) {
        void reload();
      }
    };
    const onExternalStorage = () => {
      void reload();
    };
    window.addEventListener("gabon-educ:storage", onStorage);
    window.addEventListener("storage", onExternalStorage);
    return () => {
      window.removeEventListener("gabon-educ:storage", onStorage);
      window.removeEventListener("storage", onExternalStorage);
    };
  }, [reload]);

  const levels = useMemo(() => {
    if (!workspace?.school) return [];
    const schoolType = workspace.school.schoolType;
    const configured = filterLevelsForSchoolType(
      (workspace.levels || []).filter((level) => level.active),
      schoolType,
    );
    if (configured.length) return configured.map((level) => level.label || level.code);
    return getDefaultLevelsForSchoolType(schoolType);
  }, [workspace?.levels, workspace?.school]);

  const schoolProfile = workspace?.school ? formatSchoolProfile(workspace.school.schoolType, workspace.school.schoolSector) : "Profil non configuré";
  const defaults = editing?.data || {};

  useEffect(() => {
    if (!printData) return;
    const cleanup = () => {
      document.body.classList.remove("printing-enrollment");
      setPrintData(null);
    };
    document.body.classList.add("printing-enrollment");
    window.addEventListener("afterprint", cleanup, { once: true });
    const timer = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", cleanup);
      document.body.classList.remove("printing-enrollment");
    };
  }, [printData]);

  function preparePrint(form: HTMLFormElement | null) {
    if (!form) return;
    const values: Record<string, string> = {};
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") values[key] = value.trim();
    });
    setPrintData(values);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setSaving(true);
    setMessage("Enregistrement de la fiche…");
    const form = event.currentTarget;
    const data = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent = resolveEnrollmentSubmitIntent(
      submitter instanceof HTMLButtonElement
        ? { name: submitter.name, value: submitter.value }
        : null,
    );
    const timestamp = now();
    const values: Record<string, string> = {
      lastName: field(data, "lastName"),
      firstName: field(data, "firstName"),
      dateOfBirth: field(data, "dateOfBirth"),
      placeOfBirth: field(data, "placeOfBirth"),
      actNumber: field(data, "actNumber"),
      gender: field(data, "gender"),
      phone1: field(data, "phone1"),
      phone2: field(data, "phone2"),
      nationality: field(data, "nationality") || "Gabonaise",
      email: field(data, "email"),
      previousSchool: field(data, "previousSchool"),
      learnerStatus: field(data, "learnerStatus"),
      residence: field(data, "residence"),
      pathology: field(data, "pathology"),
      socialSituation: field(data, "socialSituation"),
      handicap: field(data, "handicap"),
      level: field(data, "level"),
      classId: field(data, "classId"),
      registrationNumber: field(data, "registrationNumber"),
      fatherName: field(data, "fatherName"),
      fatherProfession: field(data, "fatherProfession"),
      fatherPhone1: field(data, "fatherPhone1"),
      fatherPhone2: field(data, "fatherPhone2"),
      motherName: field(data, "motherName"),
      motherProfession: field(data, "motherProfession"),
      motherPhone1: field(data, "motherPhone1"),
      motherPhone2: field(data, "motherPhone2"),
      tutorName: field(data, "tutorName"),
      tutorProfession: field(data, "tutorProfession"),
      tutorPhone1: field(data, "tutorPhone1"),
      tutorPhone2: field(data, "tutorPhone2"),
    };
    const matchingClasses = classes.filter((item) => item.level === values.level);
    if (!values.classId && matchingClasses.length === 1) values.classId = matchingClasses[0].id;
    const selectedClass = values.classId ? classes.find((item) => item.id === values.classId) : null;
    if (values.classId && !selectedClass) {
      setMessage("Classe invalide : elle n’appartient pas à l’établissement actif.");
      setSaving(false);
      return;
    }
    if (selectedClass && selectedClass.level !== values.level) {
      setMessage("La classe demandée ne correspond pas au niveau sélectionné.");
      setSaving(false);
      return;
    }
    const record: EnrollmentRecord = {
      id: editing?.id || id(),
      schoolId: workspace.school?.id || "local",
      academicYearId: workspace.academicYears.find((item) => item.active)?.id || workspace.academicYears[0]?.id || "local",
      status: intent === "validate" ? "validated" : editing?.status || "draft",
      linkedStudentId: editing?.linkedStudentId || "",
      createdAt: editing?.createdAt || timestamp,
      updatedAt: timestamp,
      data: values,
    };
    const nextEnrollments = [record, ...enrollments.filter((item) => item.id !== record.id)];

    if (intent === "validate") {
      const student = toStudent(record, workspace);
      record.linkedStudentId = student.id;
      const result = await savePlatformWorkspace(
        {
          ...workspace,
          students: [student, ...workspace.students.filter((item) => item.id !== student.id)],
        },
        {
          module: "students",
          operation: workspace.students.some((item) => item.id === student.id) ? "update" : "create",
          entityId: student.id,
          payload: { student, classId: student.classId },
          baseUpdatedAt: workspace.students.find((item) => item.id === student.id)?.updatedAt,
        },
      );
      if (result.blocked) {
        setMessage(result.message);
        setSaving(false);
        return;
      }
      if (student.classId) {
        cacheStudentInClass(student.classId, {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          email: student.email,
          registrationNumber: student.registrationNumber,
          dateOfBirth: student.dateOfBirth,
        });
      }
      const written = await saveEnrollmentForm(record);
      setWorkspace(result.workspace);
      setEnrollments([record, ...enrollments.filter((item) => item.id !== record.id)]);
      setEditing(null);
      form.reset();
      setMessage(
        written.syncError ||
          (student.classId
            ? "Inscription validée : l’élève figure maintenant dans sa classe."
            : "Inscription validée et dossier élève créé."),
      );
      setSaving(false);
      return;
    }

    const written = await saveEnrollmentForm(record);
    setEnrollments(nextEnrollments);
    setEditing(record);
    setMessage(
      written.syncError ||
        "Fiche d’inscription enregistrée. Elle est consultable depuis n’importe quel poste de l’établissement.",
    );
    setSaving(false);
  }

  return (
    <main className="enrollment-page">
      <header className="enrollment-topbar">
        <div className="enrollment-top-left">
          <Link className="icon-btn" href="/gabon-educ/tableau-de-bord" aria-label="Retour"><ArrowLeft /></Link>
          <Brand />
          <div>
            <b>Inscriptions scolaires</b>
            <small>Fiche d’identification et création du dossier élève</small>
          </div>
        </div>
        <span className="enrollment-status"><ClipboardList /> {message}</span>
      </header>

      <section className="enrollment-shell">
        {subscriptionAccess.blocked && <SubscriptionReadOnlyPanel message={subscriptionAccess.message} />}
        <div className="enrollment-intro-card">
          <div>
            <p className="portal-entry-kicker">SCOLARITÉ</p>
            <h1>Inscrire un apprenant</h1>
            <p>
              Le formulaire reprend la fiche d’identification fournie : identité, situation de l’apprenant,
              parents ou tuteur, classe demandée et établissement.
            </p>
          </div>
          <div className="enrollment-profile-card">
            <span>Établissement</span>
            <strong>{workspace?.school?.name || "Non configuré"}</strong>
            <small>{schoolProfile}</small>
          </div>
        </div>

        <fieldset className="subscription-write-lock" disabled={subscriptionAccess.blocked || saving}>
          <form className="enrollment-form" key={editing?.id || "new"} onSubmit={submit}>
            <section>
              <h2><FileText /> Identité de l’élève</h2>
              <div className="enrollment-grid three">
                <label>Nom(s)<input name="lastName" required defaultValue={defaults.lastName} /></label>
                <label>Prénom(s)<input name="firstName" required defaultValue={defaults.firstName} /></label>
                <label>Numéro matricule / dossier<input name="registrationNumber" defaultValue={defaults.registrationNumber} /></label>
              </div>
              <div className="enrollment-grid three">
                <label>Date de naissance<input type="date" name="dateOfBirth" defaultValue={defaults.dateOfBirth} /></label>
                <label>Lieu de naissance<input name="placeOfBirth" defaultValue={defaults.placeOfBirth} /></label>
                <label>N° acte de naissance<input name="actNumber" defaultValue={defaults.actNumber} /></label>
              </div>
              <div className="enrollment-grid three">
                <label>Sexe<select name="gender" defaultValue={defaults.gender || ""}><option value="">Non renseigné</option><option value="female">Féminin</option><option value="male">Masculin</option></select></label>
                <label>Nationalité<input name="nationality" defaultValue={defaults.nationality || "Gabonaise"} /></label>
                <label>E-mail<input type="email" name="email" defaultValue={defaults.email} /></label>
              </div>
              <div className="enrollment-grid two">
                <label>Téléphone 1<input name="phone1" defaultValue={defaults.phone1} /></label>
                <label>Téléphone 2<input name="phone2" defaultValue={defaults.phone2} /></label>
              </div>
            </section>

            <section>
              <h2><UserRoundCheck /> Situation scolaire et personnelle</h2>
              <div className="enrollment-grid three">
                <label>Dernier établissement fréquenté<input name="previousSchool" defaultValue={defaults.previousSchool} /></label>
                <label>Statut de l’apprenant<select name="learnerStatus" defaultValue={defaults.learnerStatus || "nouveau"}><option value="nouveau">Nouveau</option><option value="redoublant">Redoublant</option><option value="triplant">Triplant</option><option value="transféré">Transféré</option></select></label>
                <label>Lieu de résidence<input name="residence" defaultValue={defaults.residence} /></label>
              </div>
              <div className="enrollment-grid three">
                <label>Pathologie particulière<input name="pathology" defaultValue={defaults.pathology} /></label>
                <label>Situation sociale<select name="socialSituation" defaultValue={defaults.socialSituation || ""}><option value="">Non renseigné</option><option value="orphelin">Orphelin</option><option value="situation ordinaire">Situation ordinaire</option></select></label>
                <label>Handicap<select name="handicap" defaultValue={defaults.handicap || ""}><option value="">Aucun / non renseigné</option><option value="handicap moteur">Handicap moteur</option><option value="handicap sensoriel">Handicap sensoriel</option><option value="handicap psychique">Handicap psychique</option></select></label>
              </div>
              <div className="enrollment-grid two">
                <label>Niveau d’étude<select name="level" disabled={!workspace?.school || levels.length === 0} defaultValue={defaults.level || levels[0] || ""}>{!workspace?.school && <option value="">Chargement de l’établissement…</option>}{workspace?.school && levels.length === 0 && <option value="">Aucun niveau configuré</option>}{levels.map((level) => <option key={level} value={level}>{level}</option>)}</select></label>
                <label>Classe demandée<select name="classId" defaultValue={defaults.classId || ""}><option value="">Classe non encore affectée</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.level}</option>)}</select>{classes.length === 0 && <small>Aucune classe n’a encore été créée dans cet établissement.</small>}</label>
              </div>
            </section>

            <section>
              <h2>Parents ou tuteur</h2>
              <div className="enrollment-grid three">
                <label>Nom(s) et prénom(s) du père<input name="fatherName" defaultValue={defaults.fatherName} /></label>
                <label>Profession du père<input name="fatherProfession" defaultValue={defaults.fatherProfession} /></label>
                <label>Téléphone du père<input name="fatherPhone1" defaultValue={defaults.fatherPhone1} /></label>
              </div>
              <div className="enrollment-grid three">
                <label>Nom(s) et prénom(s) de la mère<input name="motherName" defaultValue={defaults.motherName} /></label>
                <label>Profession de la mère<input name="motherProfession" defaultValue={defaults.motherProfession} /></label>
                <label>Téléphone de la mère<input name="motherPhone1" defaultValue={defaults.motherPhone1} /></label>
              </div>
              <div className="enrollment-grid three">
                <label>Nom(s) et prénom(s) du tuteur<input name="tutorName" defaultValue={defaults.tutorName} /></label>
                <label>Profession du tuteur<input name="tutorProfession" defaultValue={defaults.tutorProfession} /></label>
                <label>Téléphone du tuteur<input name="tutorPhone1" defaultValue={defaults.tutorPhone1} /></label>
              </div>
              <div className="enrollment-grid three compact">
                <label>Téléphone 2 du père<input name="fatherPhone2" defaultValue={defaults.fatherPhone2} /></label>
                <label>Téléphone 2 de la mère<input name="motherPhone2" defaultValue={defaults.motherPhone2} /></label>
                <label>Téléphone 2 du tuteur<input name="tutorPhone2" defaultValue={defaults.tutorPhone2} /></label>
              </div>
            </section>

            <section className="enrollment-school-summary">
              <h2>Établissement</h2>
              <div className="enrollment-grid three">
                <div><span>Nom</span><strong>{workspace?.school?.name || "—"}</strong></div>
                <div><span>Statut</span><strong>{schoolProfile}</strong></div>
                <div><span>Année scolaire</span><strong>{workspace?.academicYears.find((item) => item.active)?.label || workspace?.academicYears[0]?.label || "—"}</strong></div>
              </div>
            </section>

            <div className="enrollment-actions">
              <button className="btn btn-light" type="button" onClick={() => setEditing(null)}>Annuler</button>
              <button className="btn btn-light" type="button" onClick={() => setMessage(editing ? "Fiche ouverte en modification." : "Sélectionnez une fiche enregistrée pour la modifier.")}><Edit3 /> Modifier</button>
              <button className="btn btn-light" name="intent" value="draft" disabled={saving}>{saving && <LoaderCircle className="spin-icon" />} Enregistrer</button>
              <button className="btn btn-light" type="button" onClick={(event) => preparePrint(event.currentTarget.form)}>Imprimer en A4</button>
              <button className="btn btn-primary" name="intent" value="validate" disabled={saving}>{saving && <LoaderCircle className="spin-icon" />} Valider et créer le dossier élève</button>
            </div>
          </form>
        </fieldset>

        <section className="enrollment-list-card">
          <h2>Fiches d’inscription enregistrées</h2>
          {!enrollments.length ? <p>Aucune fiche enregistrée pour le moment.</p> : (
            <div className="enrollment-table-wrap">
              <table className="enrollment-table">
                <thead><tr><th>Élève</th><th>Classe</th><th>Sexe</th><th>Statut fiche</th><th>Date</th><th>Action</th></tr></thead>
                <tbody>
                  {enrollments.map((record) => <tr key={record.id}>
                    <td><b>{record.data.lastName} {record.data.firstName}</b><br /><small>{record.data.registrationNumber || "Matricule non renseigné"}</small></td>
                    <td>{classLabel(classes, record.data.classId)}</td>
                    <td>{genderLabel(record.data.gender)}</td>
                    <td>{record.status === "validated" ? "Dossier élève créé" : "Brouillon"}</td>
                    <td>{new Date(record.updatedAt).toLocaleDateString("fr-FR")}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-light" onClick={() => setEditing(record)}><Edit3 /> Modifier</button>
                      <button
                        className="btn btn-light"
                        style={{ marginLeft: 6, color: "#9b3f3f" }}
                        onClick={() => removeEnrollment(record)}
                        title="Supprimer cette fiche d’inscription"
                      >
                        <Trash2 /> Supprimer
                      </button>
                    </td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {printData && <article className="enrollment-print-sheet" aria-label="Fiche d’inscription A4">
          <header className="enrollment-print-document-header">
            <div className="enrollment-print-reference"><span>Année scolaire</span><strong>{workspace?.academicYears.find((item) => item.active)?.label || workspace?.academicYears[0]?.label || "—"}</strong></div>
            <div className="enrollment-print-school"><strong>{workspace?.school?.name || "Établissement"}</strong><span>{schoolProfile}</span><small>{[workspace?.school?.address, workspace?.school?.city, workspace?.school?.phone].filter(Boolean).join(" · ") || "Administration scolaire"}</small></div>
            <div className="enrollment-print-reference right"><span>Matricule</span><strong>{printData.registrationNumber || "À attribuer"}</strong></div>
          </header>
          <section className="enrollment-print-heading">
            <span>Dossier administratif de l’élève</span>
            <h1>FICHE INDIVIDUELLE D’INSCRIPTION</h1>
          </section>
          <section className="enrollment-print-section"><h2><b>1</b> Identité de l’élève</h2><div className="enrollment-print-grid three">
            <PrintValue label="Nom(s)" value={printData.lastName}/><PrintValue label="Prénom(s)" value={printData.firstName}/><PrintValue label="Sexe" value={genderLabel(printData.gender)}/>
            <PrintValue label="Date de naissance" value={printData.dateOfBirth}/><PrintValue label="Lieu de naissance" value={printData.placeOfBirth}/><PrintValue label="N° acte de naissance" value={printData.actNumber}/>
            <PrintValue label="Nationalité" value={printData.nationality}/><PrintValue label="Téléphone(s)" value={[printData.phone1, printData.phone2].filter(Boolean).join(" / ")}/><PrintValue label="E-mail" value={printData.email}/>
          </div></section>
          <section className="enrollment-print-section"><h2><b>2</b> Situation scolaire et personnelle</h2><div className="enrollment-print-grid three">
            <PrintValue label="Niveau" value={printData.level}/><PrintValue label="Classe" value={classLabel(classes, printData.classId)}/><PrintValue label="Statut" value={printData.learnerStatus}/>
            <PrintValue label="Dernier établissement" value={printData.previousSchool}/><PrintValue label="Lieu de résidence" value={printData.residence}/><PrintValue label="Situation sociale" value={printData.socialSituation}/>
            <PrintValue label="Pathologie particulière" value={printData.pathology}/><PrintValue label="Handicap" value={printData.handicap}/><PrintValue label="Contact d’urgence" value={printData.tutorPhone1 || printData.fatherPhone1 || printData.motherPhone1}/>
          </div></section>
          <section className="enrollment-print-section"><h2><b>3</b> Parents ou tuteur</h2><div className="enrollment-print-grid three">
            <PrintValue label="Père" value={printData.fatherName}/><PrintValue label="Profession" value={printData.fatherProfession}/><PrintValue label="Téléphone(s)" value={[printData.fatherPhone1, printData.fatherPhone2].filter(Boolean).join(" / ")}/>
            <PrintValue label="Mère" value={printData.motherName}/><PrintValue label="Profession" value={printData.motherProfession}/><PrintValue label="Téléphone(s)" value={[printData.motherPhone1, printData.motherPhone2].filter(Boolean).join(" / ")}/>
            <PrintValue label="Tuteur" value={printData.tutorName}/><PrintValue label="Profession" value={printData.tutorProfession}/><PrintValue label="Téléphone(s)" value={[printData.tutorPhone1, printData.tutorPhone2].filter(Boolean).join(" / ")}/>
          </div></section>
          <section className="enrollment-print-certification">
            <div className="enrollment-print-declaration"><b>Déclaration du responsable</b><p>Je certifie exacts les renseignements portés sur cette fiche et m’engage à respecter le règlement intérieur de l’établissement.</p></div>
            <div className="enrollment-print-validation">
              <div><b>Dossier</b><span>☐ Complet</span><span>☐ À compléter</span></div>
              <div className="enrollment-print-signature"><span>Date et signature du parent / tuteur</span></div>
              <div className="enrollment-print-signature"><span>Visa et cachet de l’établissement</span></div>
            </div>
          </section>
          <footer>Document d’inscription de l’établissement · Édité le {new Date().toLocaleDateString("fr-FR")}</footer>
        </article>}
      </section>
    </main>
  );
}
