"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, Paperclip, Printer, TriangleAlert } from "lucide-react";
import { Brand } from "@/components/Brand";
import { BackToSpace } from "@/components/BackToSpace";
import { createClient } from "@/lib/supabase/client";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { DEFAULT_HEADER, loadReportHeader, type ReportHeader } from "@/lib/report-model/header";
import { HOMEWORK_MODES, loadTeacherAssignments, type TeacherAssignment } from "@/lib/lesson-book/store";
import {
  formatDuration,
  groupByPeriod,
  loadPeriodBounds,
  loadProgression,
  sessionMinutes,
  type PeriodBounds,
  type ProgressionEntry,
} from "@/lib/lesson-book/progression";
import { formatDayShort, fromISODate } from "@/lib/lesson-book/week";
import styles from "./LessonProgression.module.css";

/**
 * La progression annuelle d'une classe dans une matière.
 *
 * L'écran de la semaine sert à écrire, celui-ci à rendre compte. Un inspecteur
 * qui ouvre le cahier de textes ne demande pas « qu'avez-vous fait mercredi »
 * mais « où en êtes-vous du programme » — et cette question n'a de réponse que
 * sur l'année entière, d'un seul tenant.
 *
 * C'est donc une page distincte, et non un onglet de l'autre : elle a sa
 * propre adresse, que l'on garde en favori, et sa propre mise en page
 * d'impression. Mêler les deux aurait alourdi l'écran d'écriture, qui est
 * celui où l'enseignant passe son temps.
 */

const MODE_LABELS = new Map(HOMEWORK_MODES.map((mode) => [mode.value, mode.label]));

/**
 * Les étiquettes d'une séance, sans doublon.
 *
 * La catégorie et les thèmes sont deux champs libres remplis par la même
 * personne : « Grammaire » se retrouve souvent dans les deux, et la cellule
 * affichait alors deux fois la même pastille. La comparaison ignore la casse et
 * les espaces, mais garde l'orthographe de la première occurrence.
 */
function etiquettes(category: string, themes: string[]): string[] {
  const vues = new Set<string>();
  const sortie: string[] = [];
  for (const brut of [category, ...themes]) {
    const valeur = String(brut || "").trim();
    if (!valeur) continue;
    const cle = valeur.toLocaleLowerCase("fr");
    if (vues.has(cle)) continue;
    vues.add(cle);
    sortie.push(valeur);
  }
  return sortie;
}

/** « 12/09 » — le jour d'échéance, court, dans une colonne étroite. */
function jourCourt(iso: string): string {
  if (!iso) return "";
  const date = fromISODate(iso);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function LessonProgression() {
  const [teacherId, setTeacherId] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [selection, setSelection] = useState("");
  const [periods, setPeriods] = useState<PeriodBounds[]>([]);
  const [entries, setEntries] = useState<ProgressionEntry[]>([]);
  const [header, setHeader] = useState<ReportHeader>(DEFAULT_HEADER);
  const [yearLabel, setYearLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [impression, setImpression] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const client = createClient();
        const { data: auth } = await client.auth.getUser();
        const identifiant = auth.user?.id || "";
        setTeacherId(identifiant);

        const contexte = await resolveActiveSchoolContext();
        const ecole = contexte.school.id;
        const annee = contexte.school.activeAcademicYearId || "";

        const [affectations, bornes, entete] = await Promise.all([
          loadTeacherAssignments(identifiant),
          loadPeriodBounds(ecole, annee),
          // Le même en-tête que le bulletin : le document imprimé sort sous les
          // mêmes armes que le reste des pièces de l'établissement.
          loadReportHeader(ecole),
        ]);
        setAssignments(affectations);
        setPeriods(bornes);
        setHeader(entete);
        if (affectations[0]) {
          setSelection(`${affectations[0].classId}|${affectations[0].subjectId}`);
        }

        // Le nom de l'enseignant et le libellé de l'année : deux lectures qui
        // n'empêchent rien si elles échouent, donc silencieuses.
        void client
          .from("profiles")
          .select("first_name,last_name")
          .eq("id", identifiant)
          .maybeSingle()
          .then(({ data }) => {
            const row = (data || {}) as { first_name?: string; last_name?: string };
            const nom = `${row.first_name || ""} ${row.last_name || ""}`.trim();
            if (nom) setTeacherName(nom);
          });
        if (annee) {
          void client
            .from("academic_years")
            .select("label")
            .eq("id", annee)
            .maybeSingle()
            .then(({ data }) => {
              const row = (data || {}) as { label?: string };
              if (row.label) setYearLabel(String(row.label));
            });
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const relire = useCallback(
    async (identifiant: string, cle: string) => {
      if (!identifiant || !cle) {
        setEntries([]);
        return;
      }
      const [classId, subjectId] = cle.split("|");
      setReading(true);
      setError("");
      try {
        setEntries(await loadProgression(identifiant, classId, subjectId));
      } catch (caught) {
        setEntries([]);
        setError(caught instanceof Error ? caught.message : "Lecture de la progression impossible.");
      } finally {
        setReading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void relire(teacherId, selection);
  }, [teacherId, selection, relire]);

  /**
   * L'impression.
   *
   * Le corps de page reçoit une classe le temps du tirage, et la feuille
   * globale masque tout ce qui n'est pas le tableau. Les modules CSS
   * n'acceptent pas de sélecteur portant sur « body » : c'est pourquoi ces
   * règles-là vivent dans la feuille globale, comme pour le bulletin.
   */
  useEffect(() => {
    if (!impression) return;
    const nettoyer = () => {
      document.body.classList.remove("printing-progression");
      setImpression(false);
    };
    document.body.classList.add("printing-progression");
    window.addEventListener("afterprint", nettoyer, { once: true });
    const minuteur = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(minuteur);
      window.removeEventListener("afterprint", nettoyer);
      document.body.classList.remove("printing-progression");
    };
  }, [impression]);

  const blocs = useMemo(() => groupByPeriod(entries, periods), [entries, periods]);
  const affectation = assignments.find(
    (item) => `${item.classId}|${item.subjectId}` === selection,
  );

  const totalMinutes = entries.reduce(
    (somme, item) => somme + sessionMinutes(item.startsAt, item.endsAt),
    0,
  );
  const totalDevoirs = entries.reduce((somme, item) => somme + item.homework.length, 0);
  const nonRemises = entries.filter((item) => !item.isPublished).length;

  return (
    <main className={`${styles.page} progression-page`}>
      <header className={styles.topbar}>
        <div className={styles.topLeft}>
          <BackToSpace />
          <Brand />
          <div>
            <b>Progression annuelle</b>
            <small>Le cahier de textes de l’année, d’un seul tenant</small>
          </div>
        </div>
        <div className={styles.topActions}>
          {/* « Revenir » serait faux : cette page s'ouvre dans un onglet à
              part, et l'onglet du cahier reste ouvert derrière. */}
          <Link className={styles.ghost} href="/gabon-educ/cahier-de-textes">
            <CalendarRange /> Cahier de la semaine
          </Link>
          <button
            type="button"
            className={styles.primary}
            disabled={!entries.length}
            onClick={() => setImpression(true)}
          >
            <Printer /> Imprimer
          </button>
        </div>
      </header>

      {error && (
        <p className={styles.error}>
          <TriangleAlert /> {error}
        </p>
      )}

      <section className={styles.filters}>
        <label>
          Classe et matière
          <select
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
            disabled={!assignments.length}
          >
            {!assignments.length && <option value="">Aucune affectation</option>}
            {assignments.map((item) => (
              <option
                key={`${item.classId}|${item.subjectId}`}
                value={`${item.classId}|${item.subjectId}`}
              >
                {item.className} · {item.subjectLabel}
              </option>
            ))}
          </select>
        </label>

        <div className={styles.counters}>
          <span>
            <b>{entries.length}</b>séance{entries.length > 1 ? "s" : ""}
          </span>
          <span>
            <b>{formatDuration(totalMinutes)}</b>consignées
          </span>
          <span>
            <b>{totalDevoirs}</b>travail{totalDevoirs > 1 ? "aux" : ""} donné
            {totalDevoirs > 1 ? "s" : ""}
          </span>
        </div>
      </section>

      {/*
        Le compte des séances non remises.

        C'est le seul chiffre de cet écran sur lequel l'enseignant peut agir, et
        la raison la plus fréquente pour laquelle une famille dit « nous
        n'avons rien reçu ». Il mérite donc d'être dit, et non deviné en
        parcourant la colonne « état ».
      */}
      {!reading && nonRemises > 0 && (
        <p className={styles.warn}>
          <TriangleAlert /> {nonRemises} séance{nonRemises > 1 ? "s" : ""} de cette progression
          {nonRemises > 1 ? " ne sont" : " n’est"} pas encore remise
          {nonRemises > 1 ? "s" : ""} aux familles. Ouvrez la semaine concernée pour
          {nonRemises > 1 ? " les" : " la"} publier.
        </p>
      )}

      <div className={`${styles.sheet} progression-sheet`}>
        {/* L'en-tête officiel, celui du bulletin. */}
        <header className={styles.sheetHead}>
          {header.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={header.logoUrl} alt="" className={styles.logo} />
          )}
          <div className={styles.sheetTitles}>
            {header.authority1 && <small>{header.authority1}</small>}
            {header.authority2 && <small>{header.authority2}</small>}
            {header.schoolName && <b>{header.schoolName}</b>}
            <h1>Cahier de textes — progression annuelle</h1>
            <p>
              {affectation
                ? `${affectation.className} · ${affectation.subjectLabel}`
                : "Aucune classe sélectionnée"}
              {teacherName ? ` · ${teacherName}` : ""}
              {yearLabel ? ` · Année ${yearLabel}` : ""}
            </p>
          </div>
        </header>

        {loading || reading ? (
          <p className={styles.hint}>Lecture de la progression…</p>
        ) : !assignments.length ? (
          <p className={styles.hint}>
            Aucune classe ne vous est affectée. L’administration les pose dans « Matières et
            affectations » ; la progression s’affichera ensuite d’elle-même.
          </p>
        ) : !blocs.length ? (
          <p className={styles.hint}>
            Aucune séance consignée pour cette classe. Écrivez-en une dans le cahier de la semaine,
            elle apparaîtra ici.
          </p>
        ) : (
          blocs.map((bloc) => (
            <section className={styles.period} key={bloc.id || bloc.label}>
              <h2>
                <span>{bloc.label}</span>
                <small>
                  {bloc.entries.length} séance{bloc.entries.length > 1 ? "s" : ""} ·{" "}
                  {formatDuration(bloc.minutes)} · {bloc.homeworkCount} travail
                  {bloc.homeworkCount > 1 ? "aux" : ""}
                </small>
              </h2>

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colNum}>N°</th>
                    <th className={styles.colDate}>Date</th>
                    <th>Contenu de la séance</th>
                    <th className={styles.colWork}>Travail à effectuer</th>
                    <th className={styles.colState}>État</th>
                  </tr>
                </thead>
                <tbody>
                  {bloc.entries.map((entree, rang) => (
                    <tr key={entree.id}>
                      <td className={styles.colNum}>{rang + 1}</td>
                      <td className={styles.colDate}>
                        <b>{formatDayShort(fromISODate(entree.date))}</b>
                        {entree.startsAt && (
                          <small>
                            {entree.startsAt}
                            {entree.endsAt ? `–${entree.endsAt}` : ""}
                          </small>
                        )}
                      </td>
                      <td>
                        {entree.title && <b className={styles.title}>{entree.title}</b>}
                        {/*
                          Le contenu est déjà filtré à la lecture par le
                          magasin, sur la même liste blanche qu'à l'écriture.
                        */}
                        <div
                          className={styles.content}
                          dangerouslySetInnerHTML={{ __html: entree.contentHtml }}
                        />
                        <div className={styles.tags}>
                          {etiquettes(entree.category, entree.themes).map((mot) => (
                            <em key={mot}>{mot}</em>
                          ))}
                          {entree.programElements && <i>{entree.programElements}</i>}
                          {entree.attachmentCount > 0 && (
                            <span className={styles.pieces}>
                              <Paperclip /> {entree.attachmentCount}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={styles.colWork}>
                        {!entree.homework.length ? (
                          <span className={styles.none}>—</span>
                        ) : (
                          <ul className={styles.work}>
                            {entree.homework.map((devoir) => (
                              <li key={devoir.id}>
                                <span>{devoir.description}</span>
                                <small>
                                  {devoir.dueDate ? `pour le ${jourCourt(devoir.dueDate)}` : "sans échéance"}
                                  {devoir.mode !== "papier"
                                    ? ` · ${MODE_LABELS.get(devoir.mode) || devoir.mode}`
                                    : ""}
                                  {devoir.durationMinutes ? ` · ${devoir.durationMinutes} min` : ""}
                                </small>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className={styles.colState}>
                        <span className={entree.isPublished ? styles.done : styles.draft}>
                          {entree.isPublished ? "remis" : "brouillon"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
