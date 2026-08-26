"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Bell, Printer, Send, TriangleAlert, Undo2 } from "lucide-react";
import { signOut } from "@/lib/profile-store";
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
import { cellKey, loadClassPupils, loadScoreGrid, type ClassPupil } from "@/lib/report-model/scores";
import { buildClassReport, formatRank } from "@/lib/report-model/report-card";
import { formatAverage } from "@/lib/report-model/scale";
import { isManagementRole, resolveMyRoles } from "@/lib/roles/current-role";
import {
  isPublished,
  loadPublications,
  publishReports,
  unpublishReports,
  type ReportPublication,
} from "@/lib/report-model/publication";
import { ReportCardPreview } from "./ReportCardPreview";
import styles from "./ReportCardPrinter.module.css";

/**
 * Les bulletins de la classe, prêts à imprimer.
 *
 * Rien ne se saisit ici : le bulletin affiche, il ne modifie pas. Les notes
 * viennent de l'espace de saisie de l'enseignant, les moyennes et les rangs du
 * calcul, et l'identité du dossier de l'élève. C'est la règle de
 * l'établissement, et c'est aussi la seule façon de garantir que le document
 * remis à la famille dit la même chose que le logiciel.
 *
 * L'impression sort toute la classe d'un coup, un élève par page. Imprimer
 * trente bulletins un par un occuperait une matinée, et le premier réflexe
 * serait alors de revenir au tableur.
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

export function ReportCardPrinter() {
  const router = useRouter();
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [yearLabel, setYearLabel] = useState("");
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [periods, setPeriods] = useState<SchoolPeriodRow[]>([]);
  const [domains, setDomains] = useState<ModelDomain[]>([]);
  const [classId, setClassId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [pupils, setPupils] = useState<ClassPupil[]>([]);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  /**
   * Publier reste à la direction : « seul le responsable et celui à qui il
   * aura confié le rôle sont habilités à publier les bulletins ». L'enseignant
   * saisit et imprime, il ne décide pas de la remise aux familles.
   */
  const [mayPublish, setMayPublish] = useState(false);
  const [publications, setPublications] = useState<ReportPublication[]>([]);
  const [busy, setBusy] = useState(false);

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
        const roles = await resolveMyRoles(school.id);
        setMayPublish(
          Boolean(roles?.roles?.some((role) => isManagementRole(role) && role !== "secretary")),
        );
        setPublications(await loadPublications(school.id));
        if (year) {
          setYearLabel(year.label);
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

  const refresh = useCallback(async (nextClassId: string, nextPeriodId: string) => {
    if (!nextClassId || !nextPeriodId) {
      setPupils([]);
      setScores({});
      return;
    }
    const list = await loadClassPupils(nextClassId);
    setPupils(list);
    setScores(await loadScoreGrid(list.map((item) => item.id), nextPeriodId));
    setSelected(list[0]?.id || "");
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setError("");
        await refresh(classId, periodId);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Lecture des notes impossible.");
      }
    })();
  }, [classId, periodId, refresh]);

  const report = useMemo(
    () => buildClassReport(domains, pupils, scores),
    [domains, pupils, scores],
  );

  const period = periods.find((item) => item.id === periodId) || null;
  const classRecord = classes.find((item) => item.id === classId) || null;

  /**
   * Les notes d'un seul élève, indexées par ligne.
   *
   * La maquette attend « ligne → note » ; la grille de classe est indexée par
   * « élève:ligne ». On extrait plutôt que de faire connaître la classe à la
   * maquette : le gabarit du bulletin ne doit dépendre que d'un élève.
   */
  function scoresOf(studentId: string) {
    const own: Record<string, number | null> = {};
    for (const domain of domains)
      for (const skill of domain.skills)
        for (const line of skill.lines) {
          const value = scores[cellKey(studentId, line.id)];
          if (value !== undefined) own[line.id] = value;
        }
    return own;
  }

  function pupilPropsOf(pupil: ClassPupil) {
    const computed = report.pupils.find((item) => item.studentId === pupil.id);
    return {
      fullName: pupil.fullName,
      className: classRecord?.name || "",
      // Le nom de l'enseignant reste un pointillé : l'affectation d'un
      // enseignant à une classe n'est pas encore reliée à ce document, et
      // imprimer un nom faux serait pire qu'un blanc à remplir.
      rankLabel: formatRank(computed?.rank ?? null, report.rankedCount),
      classAverage: formatAverage(report.classAverage),
      bestAverage: formatAverage(report.bestAverage),
    };
  }

  async function logout() {
    await signOut();
    router.push("/gabon-educ/connexion");
    router.refresh();
  }

  const ready = Boolean(classId && periodId && domains.length && pupils.length);
  const published = isPublished(publications, classId, periodId);
  const current = pupils.find((item) => item.id === selected) || null;

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
          <span>Bulletins — {schoolName || "établissement"}</span>
        </div>
        <Bell />
      </header>

      <SimpleSpaceNav space="teacher" onLogout={() => void logout()} />

      <section className="family-space-welcome">
        <div>
          <small>Espace enseignant</small>
          <h1><Printer /> Imprimer les bulletins</h1>
          <p>
            {ready
              ? `${pupils.length} élève(s) · ${report.rankedCount} classé(s) · moyenne de classe ${formatAverage(report.classAverage)}`
              : "Choisissez une classe et une période."}
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
            Élève
            <select value={selected} onChange={(event) => setSelected(event.target.value)}>
              {pupils.map((item) => (
                <option key={item.id} value={item.id}>{item.fullName}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.primary}
            disabled={!ready}
            onClick={() => window.print()}
          >
            <Printer /> Imprimer toute la classe
          </button>

          {/*
            La publication porte sur la classe et la période entières : remettre
            son bulletin à un enfant et pas à son voisin ne se fait pas, et
            laisser ce choix ouvert reviendrait à l'autoriser.
          */}
          {mayPublish && (
            <button
              type="button"
              className={styles.secondary}
              disabled={!ready || busy}
              onClick={() =>
                void (async () => {
                  setBusy(true);
                  setError("");
                  setMessage("");
                  try {
                    if (published) {
                      await unpublishReports(classId, periodId);
                      setMessage(
                        "Bulletin retiré de l’espace des familles. Les notes restent inchangées.",
                      );
                    } else {
                      await publishReports(schoolId, classId, periodId);
                      setMessage(
                        `Bulletin de « ${period?.label} » remis aux familles de la classe.`,
                      );
                    }
                    setPublications(await loadPublications(schoolId));
                  } catch (caught) {
                    setError(
                      caught instanceof Error ? caught.message : "Publication impossible.",
                    );
                  } finally {
                    setBusy(false);
                  }
                })()
              }
            >
              {published ? <Undo2 /> : <Send />}
              {published ? "Retirer aux familles" : "Publier aux familles"}
            </button>
          )}
        </div>

        {error && <p className={styles.error}><TriangleAlert /> {error}</p>}
        {message && !error && <p className={styles.ok}>{message}</p>}
        {ready && (
          <p className={published ? styles.publishedTag : styles.draftTag}>
            {published
              ? "Ce bulletin est visible par les familles de la classe."
              : "Ce bulletin n’est pas encore remis aux familles. Elles voient le relevé de notes, pas le document."}
          </p>
        )}

        {loading ? (
          <p className={styles.hint}>Chargement…</p>
        ) : !domains.length ? (
          <p className={styles.hint}>
            Aucun modèle de bulletin n’est composé. Ouvrez Pédagogie → Modèle de bulletin.
          </p>
        ) : !ready ? (
          <p className={styles.hint}>
            Choisissez une classe et une période pour afficher les bulletins.
          </p>
        ) : (
          <p className={styles.hint}>
            Aucune note ne se modifie ici. Le bulletin affiche ce que les enseignants ont
            saisi ; pour corriger, passez par « Saisie du bulletin ».
          </p>
        )}
      </section>

      {/* À l'écran : le bulletin de l'élève choisi. */}
      {ready && current && (
        <div className={styles.screenOnly}>
          <div className={styles.sheetFrame}>
            <ReportCardPreview
              domains={domains}
              schoolName={schoolName}
              periodLabel={(period?.label || "").toLocaleUpperCase("fr")}
              academicYear={yearLabel}
              scores={scoresOf(current.id)}
              pupil={pupilPropsOf(current)}
            />
          </div>
        </div>
      )}

      {/*
        À l'impression : toute la classe, un élève par page. Cette pile est
        masquée à l'écran — l'afficher ferait défiler trente pages A4 entre
        l'enseignant et le bouton suivant.
      */}
      {ready && (
        <div className={styles.printOnly}>
          {pupils.map((pupil) => (
            <div key={pupil.id} className={styles.page}>
              <ReportCardPreview
                domains={domains}
                schoolName={schoolName}
                periodLabel={(period?.label || "").toLocaleUpperCase("fr")}
                academicYear={yearLabel}
                scores={scoresOf(pupil.id)}
                pupil={pupilPropsOf(pupil)}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
