"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  ListTodo,
  TriangleAlert,
} from "lucide-react";
import { HOMEWORK_MODES, formatFileSize, lessonFileUrl } from "@/lib/lesson-book/store";
import {
  formatDayLong,
  formatWeekRange,
  fromISODate,
  shiftWeek,
  toISODate,
  weekDays,
  weekStart,
} from "@/lib/lesson-book/week";
import {
  groupHomeworkByDue,
  loadFamilyHomework,
  loadFamilySessions,
  type FamilyAttachment,
  type FamilyHomework,
  type FamilySession,
} from "@/lib/family/lesson-book";
import styles from "./FamilyLessonBook.module.css";

/**
 * Le cahier de textes, tel que la famille le lit.
 *
 * Cet écran répond à deux questions qui n'ont pas la même urgence, et il les
 * sépare pour cette raison :
 *
 * — « Qu'est-ce que tu dois faire pour demain ? » C'est la question du soir.
 *   Elle porte sur les échéances, toutes matières mêlées, et c'est donc l'onglet
 *   ouvert par défaut. Une liste de séances classées par matière obligerait le
 *   parent à ouvrir six rubriques pour reconstituer la soirée de son enfant.
 *
 * — « Qu'avez-vous fait en classe ? » C'est celle de l'élève qui a manqué le
 *   cours. Elle porte sur une semaine, et se lit dans l'autre onglet.
 *
 * Ce qui n'a pas été REMIS par l'enseignant n'apparaît nulle part ici, et le
 * serveur y veille indépendamment de cet écran.
 */

const MODE_LABELS = new Map(HOMEWORK_MODES.map((mode) => [mode.value, mode.label]));

type Vue = "travail" | "seances";

type FamilyLessonBookProps = {
  classId: string;
  /** Vue imposée par le module qui accueille le composant. */
  initialView?: Vue;
  /**
   * Conservé pour les anciens écrans qui réunissent encore les deux lectures.
   * Les espaces famille les présentent désormais comme deux modules séparés.
   */
  showSwitch?: boolean;
};

function detailDevoir(devoir: FamilyHomework): string {
  const morceaux: string[] = [];
  if (devoir.mode !== "papier") morceaux.push(MODE_LABELS.get(devoir.mode) || devoir.mode);
  if (devoir.durationMinutes) morceaux.push(`environ ${devoir.durationMinutes} min`);
  return morceaux.join(" · ");
}

export function FamilyLessonBook({
  classId,
  initialView = "travail",
  showSwitch = true,
}: FamilyLessonBookProps) {
  const [vue, setVue] = useState<Vue>(initialView);
  /*
   * La date du jour est figée à l'ouverture de l'écran.
   *
   * La relire à chaque rendu ferait basculer « pour demain » en « pour
   * aujourd'hui » au milieu d'une session ouverte depuis la veille au soir,
   * sans que rien à l'écran ne l'explique.
   */
  const [today] = useState(() => toISODate(new Date()));
  const [monday, setMonday] = useState<Date>(() => weekStart(new Date()));
  const [devoirs, setDevoirs] = useState<FamilyHomework[]>([]);
  const [seances, setSeances] = useState<FamilySession[]>([]);
  const [chargement, setChargement] = useState(true);
  const [lectureSemaine, setLectureSemaine] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (vue !== "travail") return;
    if (!classId) {
      setChargement(false);
      return;
    }
    void (async () => {
      setChargement(true);
      setError("");
      try {
        setDevoirs(await loadFamilyHomework(classId, today));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Lecture du travail impossible.");
      } finally {
        setChargement(false);
      }
    })();
  }, [classId, today, vue]);

  const lireSemaine = useCallback(
    async (lundi: Date) => {
      if (!classId) return;
      const jours = weekDays(lundi);
      setLectureSemaine(true);
      setError("");
      try {
        setSeances(
          await loadFamilySessions(
            classId,
            toISODate(jours[0]),
            toISODate(jours[jours.length - 1]),
          ),
        );
      } catch (caught) {
        setSeances([]);
        setError(caught instanceof Error ? caught.message : "Lecture de la semaine impossible.");
      } finally {
        setLectureSemaine(false);
      }
    },
    [classId],
  );

  /*
   * La semaine n'est lue que lorsqu'on ouvre l'onglet qui la montre.
   *
   * Les contenus de séance pèsent bien plus que les consignes de devoirs, et
   * la plupart des visites s'arrêtent au travail à faire. Les charger d'office
   * ferait payer à chaque famille un écran que peu ouvrent.
   */
  useEffect(() => {
    if (vue !== "seances") return;
    void lireSemaine(monday);
  }, [vue, monday, lireSemaine]);

  const blocs = useMemo(() => groupHomeworkByDue(devoirs, today), [devoirs, today]);
  const jours = useMemo(() => weekDays(monday), [monday]);

  async function ouvrirFichier(fichier: FamilyAttachment) {
    try {
      const url = await lessonFileUrl(fichier.path);
      window.open(url, "_blank", "noopener");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ouverture du document impossible.");
    }
  }

  // Sans classe, on ne peut rien lire — et il vaut mieux le dire que d'afficher
  // « aucun travail à faire », qui serait faux et rassurerait à tort.
  if (!classId) {
    return (
      <p className={styles.empty}>
        Aucune classe n’est rattachée à cet élève pour le moment. Le secrétariat de l’établissement
        la renseigne dans son dossier.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      {showSwitch && (
        <div className={styles.switch} role="tablist" aria-label="Cahier de textes">
          <button
            type="button"
            role="tab"
            aria-selected={vue === "travail"}
            className={vue === "travail" ? styles.on : ""}
            onClick={() => setVue("travail")}
          >
            <ListTodo /> Travail à faire
            {devoirs.length > 0 && <span>{devoirs.length}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={vue === "seances"}
            className={vue === "seances" ? styles.on : ""}
            onClick={() => setVue("seances")}
          >
            <BookOpenCheck /> Ce qui a été fait en classe
          </button>
        </div>
      )}

      {error && (
        <p className={styles.error}>
          <TriangleAlert /> {error}
        </p>
      )}

      {vue === "travail" ? (
        chargement ? (
          <p className={styles.empty}>Lecture du travail à faire…</p>
        ) : !blocs.length ? (
          <p className={styles.empty}>
            Aucun travail à faire n’est enregistré pour le moment. Les enseignants inscrivent ici les
            devoirs et leur date de remise ; ils apparaissent dès qu’une séance est remise aux
            familles.
          </p>
        ) : (
          blocs.map((bloc) => (
            <section className={styles.bucket} key={bloc.key}>
              <h3 className={bloc.late ? styles.lateHead : ""}>
                {bloc.late && <TriangleAlert />}
                {bloc.label}
                <small>
                  {bloc.items.length} travail{bloc.items.length > 1 ? "aux" : ""}
                </small>
              </h3>
              <ul className={styles.works}>
                {bloc.items.map((devoir) => {
                  const detail = detailDevoir(devoir);
                  return (
                    <li key={devoir.id}>
                      <b>{devoir.subject || "Matière non précisée"}</b>
                      <p>{devoir.description}</p>
                      <small>
                        {devoir.sessionDate && (
                          <>Donné le {formatDayLong(fromISODate(devoir.sessionDate))}</>
                        )}
                        {detail && <> · {detail}</>}
                      </small>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )
      ) : (
        <>
          <div className={styles.weekNav}>
            <button
              type="button"
              onClick={() => setMonday((m) => shiftWeek(m, -1))}
              aria-label="Semaine précédente"
            >
              <ChevronLeft />
            </button>
            <span>{formatWeekRange(monday)}</span>
            <button
              type="button"
              onClick={() => setMonday((m) => shiftWeek(m, 1))}
              aria-label="Semaine suivante"
            >
              <ChevronRight />
            </button>
            <button
              type="button"
              className={styles.thisWeek}
              onClick={() => setMonday(weekStart(new Date()))}
            >
              Cette semaine
            </button>
          </div>

          {lectureSemaine ? (
            <p className={styles.empty}>Lecture de la semaine…</p>
          ) : !seances.length ? (
            <p className={styles.empty}>
              Aucune séance remise pour cette semaine. Utilisez les flèches pour consulter une autre
              semaine.
            </p>
          ) : (
            jours
              .map((jour) => ({ jour, iso: toISODate(jour) }))
              .filter(({ iso }) => seances.some((seance) => seance.date === iso))
              .map(({ jour, iso }) => (
                <section className={styles.day} key={iso}>
                  <h3>{formatDayLong(jour)}</h3>
                  {seances
                    .filter((seance) => seance.date === iso)
                    .map((seance) => (
                      <article className={styles.session} key={seance.id}>
                        <header>
                          <b>{seance.subject || "Matière non précisée"}</b>
                          {seance.startsAt && (
                            <small>
                              <Clock /> {seance.startsAt}
                              {seance.endsAt ? `–${seance.endsAt}` : ""}
                            </small>
                          )}
                          {seance.category && <em>{seance.category}</em>}
                        </header>

                        {seance.title && <h4>{seance.title}</h4>}
                        {/* Le contenu est filtré à la lecture par le module qui
                            l'a chargé, sur la même liste blanche qu'à
                            l'écriture. */}
                        <div
                          className={styles.content}
                          dangerouslySetInnerHTML={{ __html: seance.contentHtml }}
                        />

                        {seance.homework.length > 0 && (
                          <div className={styles.sessionWork}>
                            <b>Travail à effectuer</b>
                            <ul>
                              {seance.homework.map((devoir) => (
                                <li key={devoir.id}>
                                  <span>{devoir.description}</span>
                                  <small>
                                    {devoir.dueDate
                                      ? `pour le ${formatDayLong(fromISODate(devoir.dueDate))}`
                                      : "sans échéance précisée"}
                                    {detailDevoir(devoir) ? ` · ${detailDevoir(devoir)}` : ""}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {(seance.files.length > 0 || seance.plans.length > 0) && (
                          <div className={styles.files}>
                            {seance.files.map((fichier) => (
                              <button
                                type="button"
                                key={fichier.id}
                                onClick={() => void ouvrirFichier(fichier)}
                                title={`Ouvrir ${fichier.name}`}
                              >
                                <Download />
                                <span>{fichier.name}</span>
                                <i>{formatFileSize(fichier.sizeBytes)}</i>
                              </button>
                            ))}
                            {/*
                              La fiche de préparation jointe est annoncée mais
                              n'est pas un fichier : elle vit en base, et rien
                              ici ne sait encore la mettre en page pour une
                              famille. L'annoncer sans pouvoir l'ouvrir vaut
                              mieux que de la taire — le parent sait qu'elle
                              existe et peut la demander.
                            */}
                            {seance.plans.map((fiche) => (
                              <span className={styles.plan} key={fiche.id}>
                                <FileText />
                                <span>{fiche.title}</span>
                                <i>fiche du cours</i>
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                </section>
              ))
          )}
        </>
      )}
    </div>
  );
}
