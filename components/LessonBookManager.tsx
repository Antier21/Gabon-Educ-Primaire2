"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Save,
  TriangleAlert,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { BackToSpace } from "@/components/BackToSpace";
import { RichTextEditor } from "@/components/RichTextEditor";
import { createClient } from "@/lib/supabase/client";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { isRichTextEmpty } from "@/lib/lesson-book/rich-text";
import {
  LESSON_CATEGORIES,
  loadTeacherAssignments,
  loadTeacherSlots,
  loadWeekEntries,
  saveEntry,
  setEntryPublished,
  type LessonBookEntry,
  type TeacherAssignment,
  type TeacherSlot,
} from "@/lib/lesson-book/store";
import {
  formatDayLong,
  formatDayShort,
  formatWeekRange,
  fromISODate,
  shiftWeek,
  toISODate,
  weekDays,
  weekStart,
  weekdayOf,
} from "@/lib/lesson-book/week";
import styles from "./LessonBookManager.module.css";

/**
 * Le cahier de textes de l'enseignant.
 *
 * Une trace, et non une préparation : ce qui s'écrit ici dit ce qui a eu lieu,
 * et fait foi. La fiche pédagogique reste l'outil privé de l'enseignant.
 *
 * **L'éditeur est toujours à l'écran.** Les premières versions le cachaient
 * derrière le choix d'un cours dans l'emploi du temps ; un établissement qui
 * n'avait pas saisi ses horaires voyait donc une page vide et un message, sans
 * aucun moyen d'écrire. La leçon vaut au-delà de cet écran : une fonction
 * placée derrière une condition que l'utilisateur ne peut pas remplir est une
 * fonction absente.
 *
 * L'identité de la séance — date, classe, matière, horaire — est donc une
 * rangée de champs en tête du formulaire, toujours modifiable. L'emploi du
 * temps, à gauche, ne fait que la pré-remplir d'un clic. Il aide ; il ne
 * commande pas.
 */

/** Ce qui identifie la séance en cours d'écriture. */
type Seance = {
  slotId?: string;
  classId: string;
  subjectId: string;
  date: string;
  startsAt: string;
  endsAt: string;
};

type Brouillon = {
  id?: string;
  title: string;
  contentHtml: string;
  programElements: string;
  category: string;
  themes: string;
  isPublished: boolean;
};

const BROUILLON_VIDE: Brouillon = {
  title: "",
  contentHtml: "",
  programElements: "",
  category: "",
  themes: "",
  isPublished: false,
};

function brouillonDe(entree: LessonBookEntry | undefined): Brouillon {
  if (!entree) return BROUILLON_VIDE;
  return {
    id: entree.id,
    title: entree.title,
    contentHtml: entree.contentHtml,
    programElements: entree.programElements,
    category: entree.category,
    themes: entree.themes.join(", "),
    isPublished: entree.isPublished,
  };
}

export function LessonBookManager() {
  const [schoolId, setSchoolId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [slots, setSlots] = useState<TeacherSlot[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [entries, setEntries] = useState<LessonBookEntry[]>([]);
  const [monday, setMonday] = useState<Date>(() => weekStart(new Date()));
  const [seance, setSeance] = useState<Seance>(() => ({
    classId: "",
    subjectId: "",
    date: toISODate(new Date()),
    startsAt: "08:00",
    endsAt: "09:00",
  }));
  const [brouillon, setBrouillon] = useState<Brouillon>(BROUILLON_VIDE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const jours = useMemo(() => weekDays(monday), [monday]);

  const rafraichir = useCallback(async (identifiant: string, lundi: Date) => {
    setEntries(await loadWeekEntries(identifiant, lundi));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const { data: auth } = await createClient().auth.getUser();
        const identifiant = auth.user?.id || "";
        setTeacherId(identifiant);
        const contexte = await resolveActiveSchoolContext();
        setSchoolId(contexte.school.id);
        setAcademicYearId(contexte.school.activeAcademicYearId || "");
        const [creneaux, affectations] = await Promise.all([
          loadTeacherSlots(identifiant),
          loadTeacherAssignments(identifiant),
        ]);
        setSlots(creneaux);
        setAssignments(affectations);
        // La première classe est proposée d'office : l'enseignant qui n'en a
        // qu'une — le cas du primaire — n'a alors rien à choisir du tout.
        if (affectations[0]) {
          setSeance((actuelle) => ({
            ...actuelle,
            classId: actuelle.classId || affectations[0].classId,
            subjectId: actuelle.subjectId || affectations[0].subjectId,
          }));
        }
        await rafraichir(identifiant, monday);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    void rafraichir(teacherId, monday).catch((caught) =>
      setError(caught instanceof Error ? caught.message : "Lecture de la semaine impossible."),
    );
  }, [teacherId, monday, rafraichir]);

  const entryFor = useCallback(
    (date: string, classId: string, subjectId: string) =>
      entries.find(
        (item) =>
          item.sessionDate === date && item.classId === classId && item.subjectId === subjectId,
      ),
    [entries],
  );

  /**
   * Change de séance et charge ce qui a déjà été écrit pour elle.
   *
   * Un seul chemin, qu'on vienne d'un clic dans l'emploi du temps ou d'un
   * champ modifié à la main : la séance produite est la même, et le brouillon
   * suit toujours la séance affichée.
   */
  const ouvrir = useCallback(
    (suivante: Seance) => {
      setSeance(suivante);
      setBrouillon(brouillonDe(entryFor(suivante.date, suivante.classId, suivante.subjectId)));
      setMessage("");
      setError("");
    },
    [entryFor],
  );

  async function enregistrer(publier?: boolean) {
    if (!seance.classId) {
      setError("Choisissez d’abord la classe et la matière de cette séance.");
      return;
    }
    if (isRichTextEmpty(brouillon.contentHtml) && !brouillon.title.trim()) {
      setError("Une séance vide ne s’enregistre pas : indiquez au moins un titre ou un contenu.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const id = await saveEntry({
        id: brouillon.id,
        schoolId,
        academicYearId,
        classId: seance.classId,
        subjectId: seance.subjectId,
        teacherId,
        timetableSlotId: seance.slotId,
        sessionDate: seance.date,
        startsAt: seance.startsAt,
        endsAt: seance.endsAt,
        title: brouillon.title,
        contentHtml: brouillon.contentHtml,
        programElements: brouillon.programElements,
        category: brouillon.category,
        themes: brouillon.themes.split(",").map((theme) => theme.trim()).filter(Boolean),
      });
      if (publier !== undefined) await setEntryPublished(id, publier);
      setBrouillon((actuel) => ({
        ...actuel,
        id,
        isPublished: publier === undefined ? actuel.isPublished : publier,
      }));
      await rafraichir(teacherId, monday);
      setMessage(
        publier === true
          ? "Séance enregistrée et remise aux familles."
          : publier === false
            ? "Séance enregistrée, retirée aux familles."
            : "Séance enregistrée. Elle n’est pas encore visible des familles.",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  const cleAffectation = `${seance.classId}|${seance.subjectId}`;
  const affectationCourante = assignments.find(
    (item) => `${item.classId}|${item.subjectId}` === cleAffectation,
  );

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topLeft}>
          <BackToSpace />
          <Brand />
          <div>
            <b>Cahier de textes</b>
            <small>Ce qui a été fait, séance après séance</small>
          </div>
        </div>
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
            className={styles.today}
            onClick={() => setMonday(weekStart(new Date()))}
          >
            Cette semaine
          </button>
        </div>
      </header>

      {error && (
        <p className={styles.error}>
          <TriangleAlert /> {error}
        </p>
      )}
      {message && <p className={styles.ok}>{message}</p>}

      <section className={styles.shell}>
        {/*
          La semaine : un repère, jamais un péage. Cliquer sur un cours
          pré-remplit les champs de la séance ; ne pas cliquer n'empêche rien.
        */}
        <div className={styles.grid}>
          {loading ? (
            <p className={styles.hint}>Chargement…</p>
          ) : (
            jours.map((jour) => {
              const iso = toISODate(jour);
              const duJour = slots
                .filter((slot) => slot.weekday === weekdayOf(jour))
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              const horsCreneau = entries
                .filter(
                  (entree) =>
                    entree.sessionDate === iso &&
                    !duJour.some(
                      (slot) =>
                        slot.classId === entree.classId && slot.subjectId === entree.subjectId,
                    ),
                )
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

              return (
                <div className={styles.day} key={iso}>
                  <h2>{formatDayShort(jour)}</h2>

                  {duJour.map((slot) => {
                    const consignee = entryFor(iso, slot.classId, slot.subjectId);
                    const choisie = seance.date === iso && seance.slotId === slot.id;
                    return (
                      <button
                        type="button"
                        key={slot.id}
                        onClick={() =>
                          ouvrir({
                            slotId: slot.id,
                            classId: slot.classId,
                            subjectId: slot.subjectId,
                            date: iso,
                            startsAt: slot.startsAt,
                            endsAt: slot.endsAt,
                          })
                        }
                        className={`${styles.slot} ${choisie ? styles.slotActive : ""} ${
                          consignee
                            ? consignee.isPublished
                              ? styles.slotDone
                              : styles.slotDraft
                            : ""
                        }`}
                      >
                        <small>{slot.startsAt}</small>
                        <b>{slot.className}</b>
                        <em>{slot.subjectLabel}</em>
                        {consignee && (
                          <span className={styles.badge}>
                            {consignee.isPublished ? "remis" : "brouillon"}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {horsCreneau.map((entree) => {
                    const affectation = assignments.find(
                      (item) =>
                        item.classId === entree.classId && item.subjectId === entree.subjectId,
                    );
                    const choisie =
                      seance.date === iso &&
                      !seance.slotId &&
                      seance.classId === entree.classId &&
                      seance.subjectId === entree.subjectId;
                    return (
                      <button
                        type="button"
                        key={entree.id}
                        onClick={() =>
                          ouvrir({
                            classId: entree.classId,
                            subjectId: entree.subjectId,
                            date: iso,
                            startsAt: entree.startsAt || "08:00",
                            endsAt: entree.endsAt || "09:00",
                          })
                        }
                        className={`${styles.slot} ${choisie ? styles.slotActive : ""} ${
                          entree.isPublished ? styles.slotDone : styles.slotDraft
                        }`}
                      >
                        <small>{entree.startsAt || "—"}</small>
                        <b>{affectation?.className || "Séance"}</b>
                        <em>{affectation?.subjectLabel || entree.title || "Cours"}</em>
                        <span className={styles.badge}>
                          {entree.isPublished ? "remis" : "brouillon"}
                        </span>
                      </button>
                    );
                  })}

                  {!duJour.length && !horsCreneau.length && (
                    <button
                      type="button"
                      className={styles.emptyDay}
                      onClick={() => ouvrir({ ...seance, slotId: undefined, date: iso })}
                      title={`Écrire la séance du ${formatDayLong(jour)}`}
                    >
                      Écrire ce jour
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* La séance : toujours ouverte, toujours modifiable. */}
        <div className={styles.form}>
          <div className={styles.formHead}>
            <BookOpenCheck />
            <div>
              <b>{formatDayLong(fromISODate(seance.date))}</b>
              <small>
                {brouillon.id
                  ? brouillon.isPublished
                    ? "Séance remise aux familles."
                    : "Séance enregistrée, pas encore remise aux familles."
                  : "Nouvelle séance."}
              </small>
            </div>
          </div>

          {!loading && !assignments.length && (
            <p className={styles.warn}>
              <TriangleAlert /> Aucune classe ne vous est affectée. Vous pouvez écrire, mais
              l’enregistrement restera impossible tant que l’administration n’aura pas posé vos
              affectations dans « Matières et affectations ».
            </p>
          )}

          {/* L'identité de la séance, en clair et modifiable. */}
          <div className={styles.identity}>
            <label>
              Date
              <input
                type="date"
                value={seance.date}
                onChange={(event) =>
                  ouvrir({ ...seance, slotId: undefined, date: event.target.value })
                }
              />
            </label>
            <label className={styles.wide}>
              Classe et matière
              <select
                value={cleAffectation}
                onChange={(event) => {
                  const [classId, subjectId] = event.target.value.split("|");
                  ouvrir({ ...seance, slotId: undefined, classId, subjectId });
                }}
              >
                {!affectationCourante && <option value={cleAffectation}>Choisir…</option>}
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
            <label>
              Début
              <input
                type="time"
                value={seance.startsAt}
                onChange={(event) => setSeance((s) => ({ ...s, startsAt: event.target.value }))}
              />
            </label>
            <label>
              Fin
              <input
                type="time"
                value={seance.endsAt}
                onChange={(event) => setSeance((s) => ({ ...s, endsAt: event.target.value }))}
              />
            </label>
          </div>

          <div className={styles.row}>
            <label>
              Titre
              <input
                value={brouillon.title}
                onChange={(event) => setBrouillon((b) => ({ ...b, title: event.target.value }))}
                placeholder="La phrase simple et ses constituants"
              />
            </label>
            <label>
              Catégorie
              <input
                list="lesson-categories"
                value={brouillon.category}
                onChange={(event) => setBrouillon((b) => ({ ...b, category: event.target.value }))}
                placeholder="Cours et activités orales"
              />
              <datalist id="lesson-categories">
                {LESSON_CATEGORIES.map((categorie) => (
                  <option value={categorie} key={categorie} />
                ))}
              </datalist>
            </label>
          </div>

          <label className={styles.full}>
            Contenu de la séance
            <RichTextEditor
              value={brouillon.contentHtml}
              onChange={(html) => setBrouillon((b) => ({ ...b, contentHtml: html }))}
            />
          </label>

          <div className={styles.row}>
            <label>
              Éléments du programme
              <input
                value={brouillon.programElements}
                onChange={(event) =>
                  setBrouillon((b) => ({ ...b, programElements: event.target.value }))
                }
                placeholder="Compétence 2 — Maniement de la langue"
              />
            </label>
            <label>
              Thèmes
              <input
                value={brouillon.themes}
                onChange={(event) => setBrouillon((b) => ({ ...b, themes: event.target.value }))}
                placeholder="Grammaire, Conjugaison"
              />
            </label>
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={busy || !assignments.length}
              onClick={() => void enregistrer()}
            >
              <Save /> Enregistrer
            </button>
            {brouillon.isPublished ? (
              <button
                type="button"
                className={styles.ghost}
                disabled={busy}
                onClick={() => void enregistrer(false)}
              >
                <EyeOff /> Retirer aux familles
              </button>
            ) : (
              <button
                type="button"
                className={styles.ghost}
                disabled={busy || !assignments.length}
                onClick={() => void enregistrer(true)}
              >
                <Eye /> Enregistrer et remettre aux familles
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
