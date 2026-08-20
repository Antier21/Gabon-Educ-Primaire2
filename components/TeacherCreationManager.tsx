"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadPlatformWorkspace, savePlatformWorkspace } from "@/lib/platform/store";
import { listClasses, type ClassRecord } from "@/lib/class-store";
import { suggestAccessIdentifier, normalizeAccessIdentifier } from "@/lib/access-identifiers";
import { getDefaultSubjectsForSchoolType } from "@/lib/school-profiles";
import type { PlatformWorkspace, SchoolSubject, TeachingAssignment } from "@/lib/platform/types";
import type { SyncOperationMetadata } from "@/lib/sync/types";
import styles from "./TeacherCreationManager.module.css";
import { PRODUCT } from "@/lib/product-edition";

type Staff = {
  id: string;
  first_name: string;
  last_name: string;
  employee_number: string;
  job_title: string;
  specialty: string;
  pedagogical_user_id: string | null;
};

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export function TeacherCreationManager() {
  const client = createClient();
  const [schoolId, setSchoolId] = useState("");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [workspace, setWorkspace] = useState<PlatformWorkspace | null>(null);
  const [msg, setMsg] = useState("");
  const [msgKind, setMsgKind] = useState<"success" | "error">("success");
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);

  async function reloadStaff(id: string) {
    const { data, error } = await client
      .from("school_staff")
      .select("id,first_name,last_name,employee_number,job_title,specialty,pedagogical_user_id")
      .eq("school_id", id)
      .eq("staff_category", "teacher")
      .eq("employment_status", "active")
      .order("last_name");
    if (error) {
      setMsgKind("error");
      setMsg(error.message.includes("pedagogical_user_id") ? "Base Supabase à mettre à jour : exécutez la migration 050_v0118_staff_link_and_schema_reload.sql." : error.message);
    }
    else setStaff((data || []) as Staff[]);
  }

  async function reloadAll() {
    const result = await loadPlatformWorkspace();
    const nextWorkspace = result.workspace;
    const id = nextWorkspace.school?.id || "";
    setWorkspace(nextWorkspace);
    setSchoolId(id);
    if (!id) return;
    const classResult = await listClasses({
      schoolId: id,
      schoolType: nextWorkspace.school?.schoolType || PRODUCT.defaultSchoolType,
    });
    setClasses(classResult.items);
    await reloadStaff(id);
  }

  useEffect(() => {
    void reloadAll();
  }, []);

  async function activate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const staffId = String(f.get("staffId") || "");
    const person = staff.find((x) => x.id === staffId);
    if (!person || !schoolId) return;

    const identifier = normalizeAccessIdentifier(
      String(f.get("identifier") || suggestAccessIdentifier(person.first_name, person.last_name, "ge")),
    );
    const password = String(f.get("password") || "");
    setSaving(true);
    setMsg("");
    setMsgKind("success");
    try {
      const res = await fetch("/api/gabon-educ/access/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schoolId,
          firstName: person.first_name,
          lastName: person.last_name,
          phone: "",
          role: "teacher",
          classId: "",
          identifier,
          password,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsgKind("error");
        setMsg(payload.error || "Création du profil enseignant impossible.");
        return;
      }
      const { error: updateError } = await client
        .from("school_staff")
        .update({ pedagogical_user_id: payload.id })
        .eq("id", staffId)
        .eq("school_id", schoolId);
      if (updateError) {
        setMsgKind("error");
        setMsg(updateError.message);
        return;
      }
      setMsgKind("success");
      setMsg("Profil enseignant créé. Vous pouvez maintenant effectuer ses affectations ci-dessous.");
      form.reset();
      await reloadAll();
    } finally {
      setSaving(false);
    }
  }

  async function persistWorkspace(next: PlatformWorkspace, metadata: SyncOperationMetadata | readonly SyncOperationMetadata[], note: string) {
    setAssigning(true);
    setMsg("");
    setMsgKind("success");
    try {
      const result = await savePlatformWorkspace(next, metadata);
      setWorkspace(result.workspace);
      setMsg(result.blocked ? result.message : note);
    } finally {
      setAssigning(false);
    }
  }

  async function assignPrimaryTitular(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workspace || assigning) return;
    const data = new FormData(e.currentTarget);
    const classId = String(data.get("classId") || "");
    const teacherId = String(data.get("teacherId") || "");
    if (!classId || !teacherId || !schoolId) return;

    const created = now();
    const profileLabels = getDefaultSubjectsForSchoolType("primary");
    const activeSubjects = workspace.subjects.filter((subject) => subject.active && (!subject.schoolId || subject.schoolId === schoolId));
    const known = new Set(activeSubjects.map((subject) => subject.label.trim().toLocaleLowerCase("fr")));
    const levelId = workspace.levels.find((level) => level.active)?.id || workspace.levels[0]?.id || "";
    const createdSubjects: SchoolSubject[] = profileLabels
      .filter((label) => !known.has(label.toLocaleLowerCase("fr")))
      .map((label, index) => ({
        id: id(), schoolId, code: label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase().slice(0, 18) || `MAT_${index + 1}`,
        label, color: "#08734f", icon: "book", levelId, coefficient: 1, weeklyHours: 0,
        category: "Primaire", bulletinOrder: workspace.subjects.length + index + 1,
        active: true, createdAt: created, updatedAt: created,
      }));
    const allSubjects = [...createdSubjects, ...activeSubjects];
    const previousTitular = workspace.assignments.filter((item) => item.active && item.classId === classId && item.headTeacher);
    const keptAssignments = workspace.assignments.filter((item) => !(item.active && item.classId === classId && item.headTeacher));
    const academicYearId = workspace.academicYears.find((item) => item.active)?.id || workspace.academicYears[0]?.id || "local";
    const assignments: TeachingAssignment[] = allSubjects.map((subject) => ({
      id: id(), schoolId, academicYearId, classId, subjectId: subject.id, teacherId,
      startsOn: "", endsOn: "", temporary: false, headTeacher: true, active: true,
      createdAt: created, updatedAt: created,
    }));
    const metadata: SyncOperationMetadata[] = [
      ...createdSubjects.map((subject) => ({ module: "subjects" as const, operation: "create" as const, entityId: subject.id, payload: { subject } })),
      ...previousTitular.map((assignment) => ({ module: "assignments" as const, operation: "delete" as const, entityId: assignment.id, payload: { assignment }, baseUpdatedAt: assignment.updatedAt })),
      ...assignments.map((assignment) => ({ module: "assignments" as const, operation: "create" as const, entityId: assignment.id, payload: { assignment } })),
    ];
    await persistWorkspace(
      { ...workspace, subjects: [...createdSubjects, ...workspace.subjects], assignments: [...assignments, ...keptAssignments] },
      metadata,
      `Titulaire affecté à ${assignments.length} matière(s).`,
    );
    e.currentTarget.reset();
  }

  async function assignSubject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!workspace || assigning) return;
    const data = new FormData(e.currentTarget);
    const teacherId = String(data.get("teacherId") || "");
    const classId = String(data.get("classId") || "");
    const subjectId = String(data.get("subjectId") || "");
    if (!teacherId || !classId || !subjectId || !schoolId) return;
    const created = now();
    const academicYearId = workspace.academicYears.find((item) => item.active)?.id || workspace.academicYears[0]?.id || "local";
    const assignment: TeachingAssignment = {
      id: id(), schoolId, academicYearId, classId, subjectId, teacherId,
      startsOn: "", endsOn: "", temporary: false, headTeacher: false, active: true,
      createdAt: created, updatedAt: created,
    };
    await persistWorkspace(
      { ...workspace, assignments: [assignment, ...workspace.assignments] },
      { module: "assignments", operation: "create", entityId: assignment.id, payload: { assignment } },
      "Affectation pédagogique enregistrée.",
    );
    e.currentTarget.reset();
  }

  const availableStaff = staff.filter((item) => !item.pedagogical_user_id);
  const pedagogicalStaff = staff.filter((item) => item.pedagogical_user_id);
  const activeSubjects = useMemo(() => (workspace?.subjects || []).filter((item) => item.active), [workspace]);
  const primary = workspace?.school?.schoolType === "primary";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Créer un enseignant</h1>
        <p>Activez le profil pédagogique d’un membre du personnel enseignant, puis effectuez ses affectations sans quitter cette page.</p>
      </header>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>1. Activation du profil pédagogique</h2>
          <p>Sélectionnez un enseignant déjà enregistré dans Direction et secrétariat → Personnel.</p>
        </div>
        <form onSubmit={activate} className={styles.form}>
          <label className={`${styles.field} ${styles.fieldFull}`}>
            Enseignant recruté
            <select name="staffId" required>
              <option value="">Choisir dans le personnel</option>
              {availableStaff.map((item) => (
                <option key={item.id} value={item.id}>{item.employee_number} — {item.first_name} {item.last_name} — {item.specialty || item.job_title}</option>
              ))}
            </select>
          </label>
          <label className={styles.field}>Identifiant pédagogique<input name="identifier" placeholder="Laisser vide pour suggestion automatique" /></label>
          <label className={styles.field}>Mot de passe provisoire<input name="password" type="password" minLength={8} required autoComplete="new-password" /></label>
          <div className={styles.actions}><button className={styles.button} disabled={saving || !schoolId || !availableStaff.length}>{saving ? "Création…" : "Créer le profil enseignant"}</button></div>
        </form>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <h2>2. Affectations pédagogiques</h2>
          <p>{primary ? "Au primaire, choisissez un titulaire pour toute la classe ou une exception pour une matière." : "Affectez chaque enseignant à une classe et à une matière."}</p>
        </div>
        {primary ? (
          <div className={styles.assignmentGrid}>
            <form className={styles.assignmentForm} onSubmit={assignPrimaryTitular}>
              <h3>Enseignant titulaire de la classe</h3>
              <label className={styles.field}>Enseignant<select name="teacherId" required><option value="">Choisir</option>{pedagogicalStaff.map((item) => <option key={item.id} value={item.pedagogical_user_id || ""}>{item.first_name} {item.last_name}</option>)}</select></label>
              <label className={styles.field}>Classe<select name="classId" required><option value="">Choisir</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <button className={styles.button} disabled={assigning || !pedagogicalStaff.length || !classes.length}>{assigning ? "Enregistrement…" : "Affecter comme titulaire"}</button>
            </form>
            <form className={styles.assignmentForm} onSubmit={assignSubject}>
              <h3>Exception par matière</h3>
              <label className={styles.field}>Enseignant<select name="teacherId" required><option value="">Choisir</option>{pedagogicalStaff.map((item) => <option key={item.id} value={item.pedagogical_user_id || ""}>{item.first_name} {item.last_name}</option>)}</select></label>
              <label className={styles.field}>Classe<select name="classId" required><option value="">Choisir</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className={styles.field}>Matière<select name="subjectId" required><option value="">Choisir</option>{activeSubjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <button className={styles.secondaryButton} disabled={assigning || !activeSubjects.length}>Ajouter l’exception</button>
            </form>
          </div>
        ) : (
          <form className={styles.assignmentFormWide} onSubmit={assignSubject}>
            <label className={styles.field}>Enseignant<select name="teacherId" required><option value="">Choisir</option>{pedagogicalStaff.map((item) => <option key={item.id} value={item.pedagogical_user_id || ""}>{item.first_name} {item.last_name}</option>)}</select></label>
            <label className={styles.field}>Classe<select name="classId" required><option value="">Choisir</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className={styles.field}>Matière<select name="subjectId" required><option value="">Choisir</option>{activeSubjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <button className={styles.button} disabled={assigning || !activeSubjects.length}>Affecter l’enseignant</button>
          </form>
        )}
      </section>

      {msg && <p className={`${styles.message} ${msgKind === "error" ? styles.errorMessage : ""}`}>{msg}</p>}
    </main>
  );
}
