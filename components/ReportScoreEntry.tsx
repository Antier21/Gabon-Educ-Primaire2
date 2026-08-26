"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Lock, PenLine, TriangleAlert } from "lucide-react";
import { signOut } from "@/lib/profile-store";
import Image from "next/image";
import { SimpleSpaceNav } from "@/components/SpaceNavigation";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { listClasses, type ClassRecord } from "@/lib/class-store";
import { PRODUCT } from "@/lib/product-edition";
import { loadReportModel, type ModelDomain } from "@/lib/report-model/store";
import {
  loadSchoolPeriods,
  resolveActiveAcademicYear,
  type SchoolPeriodRow,
} from "@/lib/report-model/periods-store";
import {
  cellKey,
  loadClassPupils,
  loadScoreGrid,
  parseScoreInput,
  saveScore,
  type ClassPupil,
  type ScoreGrid,
} from "@/lib/report-model/scores";
import { formatAverage, masteryLevel, totalsOf } from "@/lib/report-model/scale";
import styles from "./ReportScoreEntry.module.css";

/**
 * Saisie des notes sur les lignes du bulletin.
 *
 * Un domaine à la fois, jamais les dix-neuf lignes ensemble : une grille de
 * trente élèves sur dix-neuf colonnes ne se lit sur aucun écran, et
 * l'enseignant corrige de toute façon une matière à la fois.
 *
 * Chaque note part dès que la case est quittée. Il n'y a pas de bouton
 * « enregistrer » global, et c'est délibéré : une saisie de trente élèves
 * interrompue par une coupure de courant ne doit pas être perdue en bloc.
 */

/**
 * La période proposée d'office.
 *
 * Jamais le bilan annuel : c'est le document de fin d'année, et le proposer
 * d'office a déjà conduit à y saisir les notes d'un palier. On prend la
 * première période ordinaire, et le bilan reste accessible dans la liste pour
 * qui le cherche.
 */
function defaultPeriodId(periods: readonly SchoolPeriodRow[]): string {
  const ordinaire = periods.find((item) => item.kind !== "annual");
  return (ordinaire || periods[0])?.id || "";
}

export function ReportScoreEntry() {
  const router = useRouter();
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [periods, setPeriods] = useState<SchoolPeriodRow[]>([]);
  const [domains, setDomains] = useState<ModelDomain[]>([]);
  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [domainId, setDomainId] = useState("");
  const [pupils, setPupils] = useState<ClassPupil[]>([]);
  const [grid, setGrid] = useState<ScoreGrid>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        const school = context.school;
        setSchoolId(school.id);
        setSchoolName(school.name);
        const [classResult, model, year] = await Promise.all([
          listClasses({ schoolId: school.id, schoolType: school.schoolType }),
          loadReportModel(school.id),
          resolveActiveAcademicYear(school.id),
        ]);
        setClasses(classResult.items);
        setDomains(model);
        setDomainId(model[0]?.id || "");
        if (year) {
          const periodList = await loadSchoolPeriods(school.id, year.id);
          setPeriods(periodList);
          setPeriodId(defaultPeriodId(periodList));
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshGrid = useCallback(async (nextClassId: string, nextPeriodId: string) => {
    if (!nextClassId || !nextPeriodId) {
      setPupils([]);
      setGrid({});
      return;
    }
    const list = await loadClassPupils(nextClassId);
    setPupils(list);
    setGrid(await loadScoreGrid(list.map((item) => item.id), nextPeriodId));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setError("");
        await refreshGrid(classId, periodId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Lecture des notes impossible.");
      }
    })();
  }, [classId, periodId, refreshGrid]);

  const domain = useMemo(
    () => domains.find((item) => item.id === domainId) || null,
    [domains, domainId],
  );
  const lines = useMemo(
    () => (domain ? domain.skills.flatMap((skill) => skill.lines) : []),
    [domain],
  );

  const period = periods.find((item) => item.id === periodId) || null;
  const locked = Boolean(period?.locked);
  const ready = Boolean(classId && periodId && domain && pupils.length);

  async function commit(studentId: string, lineId: string, raw: string) {
    if (locked) return;
    const parsed = parseScoreInput(raw);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    const previous = grid[cellKey(studentId, lineId)] ?? null;
    if (previous === parsed.value) return;
    setError("");
    setMessage("");
    try {
      await saveScore({ schoolId, studentId, periodId, lineId, score: parsed.value });
      setGrid((current) => ({ ...current, [cellKey(studentId, lineId)]: parsed.value }));
      setMessage("Note enregistrée.");
    } catch (caught) {
      // La base a le dernier mot sur le barème : si elle refuse, on remet la
      // valeur d'avant plutôt que de laisser à l'écran un chiffre qui n'a pas
      // été enregistré.
      setGrid((current) => ({ ...current }));
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    }
  }

  async function logout() {
    await signOut();
    router.push("/gabon-educ/connexion");
    router.refresh();
  }

  return (
    <main className="family-space family-space-teacher">
      <header className="family-space-brandbar">
        <Image
          src="/branding/logo-gabon-educ-plus-v2.png"
          alt={`Logo ${PRODUCT.name}`}
          width={52}
          height={52}
          unoptimized
        />
        <div>
          <b>{PRODUCT.name}</b>
          <span>Saisie du bulletin — {schoolName || "établissement"}</span>
        </div>
        <Bell />
      </header>

      <SimpleSpaceNav space="teacher" onLogout={() => void logout()} />

      <section className="family-space-welcome">
        <div>
          <small>Espace enseignant</small>
          <h1>
            <PenLine /> Notes du bulletin
          </h1>
          <p>
            {ready
              ? `${pupils.length} élève(s) · ${lines.length} ligne(s) de notes`
              : "Choisissez une classe, une période et un domaine."}
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.pickers}>
          <label>
            Classe
            <select value={classId} onChange={(event) => setClassId(event.target.value)}>
              <option value="">—</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            Période
            <select value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              <option value="">—</option>
              {periods.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
          <label>
            Domaine
            <select value={domainId} onChange={(event) => setDomainId(event.target.value)}>
              <option value="">—</option>
              {domains.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        {/*
          Le verrou se dit avant la grille, pas après une tentative refusée :
          un enseignant qui saisit trente notes pour découvrir ensuite qu'elles
          sont refusées perd son temps et sa confiance dans le logiciel.
        */}
        {locked && (
          <p className={styles.locked}>
            <Lock /> La saisie de « {period?.label} » est fermée par la direction. Les notes
            restent lisibles, mais ne peuvent plus être modifiées. Rapprochez-vous de la
            direction pour une réouverture.
          </p>
        )}
        {error && <p className={styles.error}><TriangleAlert /> {error}</p>}
        {message && !error && <p className={styles.ok}>{message}</p>}

        {loading ? (
          <p className={styles.hint}>Chargement…</p>
        ) : !domains.length ? (
          <p className={styles.hint}>
            Aucun modèle de bulletin n’est encore composé. Ouvrez Pédagogie → Modèle de
            bulletin et installez la structure officielle.
          </p>
        ) : !periods.length ? (
          <p className={styles.hint}>
            Aucune période n’est déclarée pour l’année active. Ouvrez Pédagogie → Modèle de
            bulletin et enregistrez le découpage de l’année.
          </p>
        ) : !ready ? (
          <p className={styles.hint}>
            Choisissez une classe, une période et un domaine pour commencer la saisie.
          </p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.grid}>
              <thead>
                <tr>
                  <th className={styles.pupilCol}>Élève</th>
                  {lines.map((line) => (
                    <th key={line.id} title={line.label}>
                      <span>{line.label}</span>
                      <small>/{line.maxScore}</small>
                    </th>
                  ))}
                  <th className={styles.totalCol}>Moyenne</th>
                  <th className={styles.masteryCol}>Maîtrise</th>
                </tr>
              </thead>
              <tbody>
                {pupils.map((pupil) => {
                  const totals = totalsOf(
                    lines.map((line) => ({
                      score: grid[cellKey(pupil.id, line.id)] ?? null,
                      maxScore: line.maxScore,
                    })),
                  );
                  const level = masteryLevel(totals.average);
                  return (
                    <tr key={pupil.id}>
                      <th className={styles.pupilCell}>{pupil.fullName}</th>
                      {lines.map((line) => {
                        const value = grid[cellKey(pupil.id, line.id)];
                        return (
                          <td key={line.id}>
                            <input
                              inputMode="decimal"
                              readOnly={locked}
                              disabled={locked}
                              defaultValue={
                                value === null || value === undefined ? "" : String(value)
                              }
                              aria-label={`${line.label} — ${pupil.fullName}`}
                              onBlur={(event) =>
                                void commit(pupil.id, line.id, event.target.value)
                              }
                            />
                          </td>
                        );
                      })}
                      <td className={styles.total}>{formatAverage(totals.average)}</td>
                      <td className={styles.mastery}>{level || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {ready && (
          <p className={styles.hint}>
            Chaque note part dès que vous quittez la case — il n’y a pas de bouton à
            actionner en fin de saisie. Une case laissée vide signifie « non évaluée » et
            sort du calcul : ce n’est pas un zéro.
          </p>
        )}
      </section>
    </main>
  );
}
