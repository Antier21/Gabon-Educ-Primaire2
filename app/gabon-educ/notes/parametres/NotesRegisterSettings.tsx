"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Cloud,
  GraduationCap,
  LoaderCircle,
  Lock,
  Plus,
  Save,
  Trash2,
  Unlock,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { SubscriptionReadOnlyPanel } from "@/components/SubscriptionReadOnlyPanel";
import styles from "@/components/Gradebook.module.css";
import { SUBJECTS, listClasses, type ClassRecord } from "@/lib/class-store";
import { getDefaultSubjectsForLevel, isPreschoolLevel } from "@/lib/school-profiles";
import {
  canLockPeriod,
  defaultWorkspace,
  loadGradingWorkspace,
  saveGradingWorkspace,
  setActivePeriod,
  upsertPeriod,
} from "@/lib/grading/store";
import type { ClassSubject, GradingWorkspace } from "@/lib/grading/types";
import { storageModeLabel, type StorageMode } from "@/lib/storage-mode";
import { useSubscriptionAccess } from "@/lib/subscriptions/use-subscription-access";

type Notice = { kind: "success" | "error"; text: string } | null;

export function NotesRegisterSettings() {
  const subscriptionAccess = useSubscriptionAccess();
  const [workspace, setWorkspace] = useState<GradingWorkspace>(defaultWorkspace);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [classId, setClassId] = useState("");
  const [mode, setMode] = useState<StorageMode>("demo");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void Promise.all([loadGradingWorkspace(), listClasses()])
      .then(([grading, classData]) => {
        setWorkspace(grading.workspace);
        setClasses(classData.items);
        setClassId(classData.items[0]?.id || "");
        setMode(grading.mode);
        setMessage(grading.message);
      })
      .catch((error) => {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "Chargement impossible.",
        });
      })
      .finally(() => setReady(true));
  }, []);

  async function persist(next: GradingWorkspace, success: string) {
    try {
      const result = await saveGradingWorkspace(next);
      setWorkspace(result.workspace);
      setMode(result.mode);
      setNotice({ kind: "success", text: success });
      return result.workspace;
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof Error ? error.message : "Enregistrement impossible.",
      });
      throw error;
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const maxScore = Number(data.get("maxScore"));
    const passThreshold = Number(data.get("passThreshold"));
    const decimals = Number(data.get("decimals"));
    if (
      maxScore <= 0 ||
      passThreshold < 0 ||
      passThreshold > maxScore ||
      decimals < 0 ||
      decimals > 4
    ) {
      setNotice({
        kind: "error",
        text: "Vérifiez le barème, le seuil et le nombre de décimales.",
      });
      return;
    }
    await persist(
      {
        ...workspace,
        settings: {
          ...workspace.settings,
          academicYear: String(data.get("academicYear")),
          periodKind: String(data.get("periodKind")) as "trimester" | "semester",
          maxScore,
          passThreshold,
          decimals,
          schoolName: String(data.get("schoolName")),
          logoUrl: String(data.get("logoUrl")),
          address: String(data.get("address")),
          phone: String(data.get("phone")),
          email: String(data.get("email")),
          headName: String(data.get("headName")),
          bulletinModel: String(data.get("bulletinModel")),
          individualMode: data.get("individualMode") === "on",
          simulatedRole: String(data.get("simulatedRole")) as GradingWorkspace["settings"]["simulatedRole"],
        },
      },
      "Paramètres scolaires enregistrés.",
    );
  }

  async function addPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const period = {
      id: crypto.randomUUID(),
      label: String(data.get("label")),
      startsOn: String(data.get("startsOn")),
      endsOn: String(data.get("endsOn")),
      active: false,
      locked: false,
    };
    if (!period.label || !period.startsOn || !period.endsOn) {
      setNotice({ kind: "error", text: "Complétez la période." });
      return;
    }
    await persist(upsertPeriod(workspace, period), "Période créée.");
    form.reset();
  }

  async function activatePeriod(id: string) {
    await persist(setActivePeriod(workspace, id), "Période active mise à jour.");
  }

  async function togglePeriodLock(id: string) {
    if (!canLockPeriod(workspace.settings.simulatedRole)) {
      setNotice({
        kind: "error",
        text: "Seuls l’administration et le chef d’établissement peuvent verrouiller une période.",
      });
      return;
    }
    const period = workspace.periods.find((item) => item.id === id);
    if (!period) return;
    await persist(
      upsertPeriod(workspace, { ...period, locked: !period.locked }),
      period.locked ? "Période rouverte." : "Période verrouillée.",
    );
  }

  async function addSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId) {
      setNotice({ kind: "error", text: "Sélectionnez une classe." });
      return;
    }
    const data = new FormData(event.currentTarget);
    const coefficient = Number(data.get("coefficient"));
    if (!Number.isFinite(coefficient) || coefficient <= 0) {
      setNotice({ kind: "error", text: "Le coefficient doit être supérieur à zéro." });
      return;
    }
    const item: ClassSubject = {
      id: crypto.randomUUID(),
      classId,
      periodId: workspace.settings.activePeriodId,
      subject: String(data.get("subject")),
      coefficient,
      teacherName: String(data.get("teacherName")),
      principal: data.get("principal") === "on",
      active: true,
    };
    await persist(
      {
        ...workspace,
        classSubjects: [
          ...workspace.classSubjects.filter(
            (entry) =>
              !(
                entry.classId === item.classId &&
                entry.periodId === item.periodId &&
                entry.subject === item.subject
              ),
          ),
          item,
        ],
      },
      "Matière affectée à la classe pour la période active.",
    );
  }

  async function toggleSubject(id: string) {
    await persist(
      {
        ...workspace,
        classSubjects: workspace.classSubjects.map((item) =>
          item.id === id ? { ...item, active: !item.active } : item,
        ),
      },
      "Statut de la matière mis à jour.",
    );
  }

  async function removeSubject(id: string) {
    await persist(
      {
        ...workspace,
        classSubjects: workspace.classSubjects.filter((item) => item.id !== id),
      },
      "Matière retirée.",
    );
  }

  const selectedClass = classes.find((item) => item.id === classId);
  const preschool = isPreschoolLevel(selectedClass?.level);
  const availableSubjects = useMemo(
    () => selectedClass ? getDefaultSubjectsForLevel(selectedClass.level) : SUBJECTS,
    [selectedClass],
  );
  const subjects = workspace.classSubjects.filter(
    (item) =>
      item.classId === classId &&
      (!item.periodId || item.periodId === workspace.settings.activePeriodId),
  );

  if (!ready) {
    return (
      <main className={styles.page}>
        <div className={styles.loading}>
          <LoaderCircle className={styles.spin} /> Chargement des paramètres…
        </div>
      </main>
    );
  }

  const s = workspace.settings;
  return (
    <main className={styles.page}>
      {subscriptionAccess.blocked && <SubscriptionReadOnlyPanel message={subscriptionAccess.message} />}
      <fieldset className="subscription-write-lock" disabled={subscriptionAccess.blocked}>
        <header className={styles.topbar}>
          <div className={styles.topLeft}>
            <Link className="icon-btn" href="/gabon-educ/notes" aria-label="Retour au relevé"><ArrowLeft /></Link>
            <Brand />
            <div><b>Notes · Paramètres</b><small>Barème, périodes, matières et affectations</small></div>
          </div>
          <span className={styles.mode}><Cloud /> {storageModeLabel(mode)} · {message}</span>
        </header>
        <section className={styles.shell}>
          <div className={styles.hero}>
            <div>
              <small>PARAMÈTRES DU CARNET</small>
              <h1>Organisation de la notation</h1>
              <p>Ces réglages alimentent directement le relevé de notes sans recréer un second formulaire de saisie.</p>
            </div>
            <Link className="btn btn-light" href="/gabon-educ/notes">Retour au relevé</Link>
          </div>

          {notice && <div className={`${styles.notice} ${notice.kind === "error" ? styles.error : ""}`}>{notice.text}</div>}

          <div className={styles.grid}>
            <form className={`${styles.card} ${styles.form}`} onSubmit={saveSettings}>
              <h2>Établissement et notation</h2>
              <div className={styles.two}>
                <label>Année scolaire<input name="academicYear" defaultValue={s.academicYear} required /></label>
                <label>Découpage
                  <select name="periodKind" defaultValue={s.periodKind}>
                    <option value="trimester">Trimestres</option>
                    <option value="semester">Semestres</option>
                  </select>
                </label>
              </div>
              <div className={styles.three}>
                <label>Note maximale<input name="maxScore" type="number" min="1" step="0.01" defaultValue={s.maxScore} /></label>
                <label>Seuil de réussite<input name="passThreshold" type="number" min="0" step="0.01" defaultValue={s.passThreshold} /></label>
                <label>Décimales<input name="decimals" type="number" min="0" max="4" defaultValue={s.decimals} /></label>
              </div>
              <label>Nom de l’établissement<input name="schoolName" defaultValue={s.schoolName} /></label>
              <label>URL du logo<input name="logoUrl" type="url" defaultValue={s.logoUrl} /></label>
              <label>Adresse<input name="address" defaultValue={s.address} /></label>
              <div className={styles.two}>
                <label>Téléphone<input name="phone" defaultValue={s.phone} /></label>
                <label>E-mail<input name="email" type="email" defaultValue={s.email} /></label>
              </div>
              <label>Chef d’établissement<input name="headName" defaultValue={s.headName} /></label>
              <label>Modèle de bulletin<input name="bulletinModel" defaultValue={s.bulletinModel} /></label>
              <label>Rôle simulé
                <select name="simulatedRole" defaultValue={s.simulatedRole}>
                  <option value="teacher">Enseignant</option>
                  <option value="head_teacher">Enseignant principal</option>
                  <option value="school_admin">Administration</option>
                  <option value="headmaster">Chef d’établissement</option>
                </select>
              </label>
              <label className={styles.check}><input name="individualMode" type="checkbox" defaultChecked={s.individualMode} /> Fonctionner en mode enseignant individuel</label>
              <button className="btn btn-primary"><Save /> Enregistrer les paramètres</button>
            </form>

            <div className={styles.card}>
              <h2>Périodes scolaires</h2>
              <p className={styles.muted}>La période active est celle proposée par défaut dans le relevé. Une période verrouillée devient non modifiable.</p>
              <form className={styles.form} onSubmit={addPeriod}>
                <label>Libellé<input name="label" placeholder="Trimestre 1" /></label>
                <div className={styles.two}>
                  <label>Début<input name="startsOn" type="date" /></label>
                  <label>Fin<input name="endsOn" type="date" /></label>
                </div>
                <button className="btn btn-light"><Plus /> Ajouter</button>
              </form>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Période</th><th>Dates</th><th>État</th><th>Actions</th></tr></thead>
                  <tbody>
                    {workspace.periods.map((item) => (
                      <tr key={item.id}>
                        <td><b>{item.label}</b></td>
                        <td>{item.startsOn} → {item.endsOn}</td>
                        <td><span className={`${styles.pill} ${item.locked ? styles.locked : ""}`}>{item.locked ? "Verrouillée" : item.active ? "Active" : "Ouverte"}</span></td>
                        <td>
                          <div className={styles.miniActions}>
                            <button type="button" onClick={() => void activatePeriod(item.id)}>Activer</button>
                            <button type="button" onClick={() => void togglePeriodLock(item.id)}>{item.locked ? <Unlock /> : <Lock />}{item.locked ? "Rouvrir" : "Verrouiller"}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`${styles.card} ${styles.wide}`}>
              <div className={styles.inlineTitle}>
                <div>
                  <h2>{preschool ? "Domaines d’apprentissage et affectations" : "Matières, coefficients et affectations"}</h2>
                  <p className={styles.muted}>{preschool ? "Les domaines actifs alimentent le carnet de suivi sans note numérique." : "Les matières actives et leurs coefficients alimentent le relevé et les calculs."}</p>
                </div>
                <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">Sélectionner une classe</option>
                  {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </div>
              <form className={`${styles.form} ${styles.three}`} onSubmit={addSubject}>
                <label>{preschool ? "Domaine d’apprentissage" : "Matière"}
                  <select name="subject">{availableSubjects.map((item) => <option key={item}>{item}</option>)}</select>
                </label>
                {!preschool ? (
                  <label>Coefficient<input name="coefficient" type="number" min="0.01" step="0.01" defaultValue="1" /></label>
                ) : <input name="coefficient" type="hidden" value="1" />}
                <label>Enseignant affecté<input name="teacherName" placeholder="Nom de l’enseignant" /></label>
                <label className={styles.check}><input name="principal" type="checkbox" /> Enseignant principal</label>
                <button className="btn btn-primary"><Plus /> Affecter {preschool ? "le domaine" : "la matière"}</button>
              </form>
              {subjects.length ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead><tr><th>{preschool ? "Domaine" : "Matière"}</th><th>Coefficient</th><th>Enseignant</th><th>Statut</th><th></th></tr></thead>
                    <tbody>
                      {subjects.map((item) => (
                        <tr key={item.id}>
                          <td><b>{item.subject}</b></td>
                          <td>{item.coefficient}</td>
                          <td>{item.teacherName || "Non précisé"}{item.principal ? " · Prof. principal" : ""}</td>
                          <td><button type="button" className={styles.pill} onClick={() => void toggleSubject(item.id)}>{item.active ? "Active" : "Inactive"}</button></td>
                          <td><button type="button" className={`btn btn-light ${styles.danger}`} onClick={() => void removeSubject(item.id)} aria-label={`Retirer ${item.subject}`}><Trash2 /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.empty}><GraduationCap /> Aucune matière affectée à cette classe pour la période active.</div>
              )}
            </div>
          </div>
        </section>
      </fieldset>
    </main>
  );
}
