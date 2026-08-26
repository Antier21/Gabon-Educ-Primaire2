"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ChevronLeft, ChevronRight, Eye, EyeOff, Save, TriangleAlert } from "lucide-react";
import { Brand } from "@/components/Brand";
import { BackToSpace } from "@/components/BackToSpace";
import { RichTextEditor } from "@/components/RichTextEditor";
import { createClient } from "@/lib/supabase/client";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { isRichTextEmpty } from "@/lib/lesson-book/rich-text";
import {
  LESSON_CATEGORIES,
  loadTeacherSlots,
  loadWeekEntries,
  saveEntry,
  setEntryPublished,
  type LessonBookEntry,
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
 * La disposition suit le geste réel : la semaine à gauche, la séance choisie à
 * droite. On ne consigne pas un cahier de textes « en général » — on consigne
 * le cours de mercredi, à 9h30, en 5A3. Choisir la classe, puis la matière,
 * puis la date dans trois listes séparées ferait perdre à chaque fois ce que
 * l'emploi du temps sait déjà.
 */

type Selection = {
  slotId?: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectLabel: string;
  date: Date;
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

export function LessonBookManager() {
  const [schoolId, setSchoolId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [slots, setSlots] = useState<TeacherSlot[]>([]);
  const [entries, setEntries] = useState<LessonBookEntry[]>([]);
  const [monday, setMonday] = useState<Date>(() => weekStart(new Date()));
  const [selection, setSelection] = useState<Selection | null>(null);
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
        setSlots(await loadTeacherSlots(identifiant));
        await rafraichir(identifiant, monday);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      } finally {
        setLoading(false);
      }
    })();
    // Volontairement au premier rendu : le changement de semaine a son propre effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    void rafraichir(teacherId, monday).catch((caught) =>
      setError(caught instanceof Error ? caught.message : "Lecture de la semaine impossible."),
    );
  }, [teacherId, monday, rafraichir]);

  /** La séance déjà consignée pour un créneau donné, s'il y en a une. */
  const entryFor = useCallback(
    (date: Date, classId: string, subjectId: string) =>
      entries.find(
        (item) =>
          item.sessionDate === toISODate(date) &&
          item.classId === classId &&
          item.subjectId === subjectId,
      ),
    [entries],
  );

  function choisir(slot: TeacherSlot, date: Date) {
    const existante = entryFor(date, slot.classId, slot.subjectId);
    setSelection({
      slotId: slot.id,
      classId: slot.classId,
      className: slot.className,
      subjectId: slot.subjectId,
      subjectLabel: slot.subjectLabel,
      date,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    });
    setBrouillon(
      existante
        ? {
            id: existante.id,
            title: existante.title,
            contentHtml: existante.contentHtml,
            programElements: existante.programElements,
            category: existante.category,
            themes: existante.themes.join(", "),
            isPublished: existante.isPublished,
          }
        : BROUILLON_VIDE,
    );
    setMessage("");
    setError("");
  }

  async function enregistrer(publier?: boolean) {
    if (!selection) return;
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
        classId: selection.classId,
        subjectId: selection.subjectId,
        teacherId,
        timetableSlotId: selection.slotId,
        sessionDate: toISODate(selection.date),
        startsAt: selection.startsAt,
        endsAt: selection.endsAt,
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

  const officiel = selection
    ? `${formatDayLong(selection.date)} · ${selection.startsAt}–${selection.endsAt} · ${selection.className} · ${selection.subjectLabel}`
    : "";

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
          <button type="button" onClick={() => setMonday((m) => shiftWeek(m, -1))} aria-label="Semaine précédente">
            <ChevronLeft />
          </button>
          <span>{formatWeekRange(monday)}</span>
          <button type="button" onClick={() => setMonday((m) => shiftWeek(m, 1))} aria-label="Semaine suivante">
            <ChevronRight />
          </button>
          <button type="button" className={styles.today} onClick={() => setMonday(weekStart(new Date()))}>
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
        {/* La semaine : un jour par colonne, les créneaux de l'enseignant dedans. */}
        <div className={styles.grid}>
          {loading ? (
            <p className={styles.hint}>Chargement de votre emploi du temps…</p>
          ) : !slots.length ? (
            <p className={styles.hint}>
              Aucun créneau ne vous est affecté dans l’emploi du temps. Demandez à
              l’administration de le saisir : le cahier de textes s’appuie dessus pour savoir
              quand vous enseignez, et à qui.
            </p>
          ) : (
            jours.map((jour) => {
              const duJour = slots
                .filter((slot) => slot.weekday === weekdayOf(jour))
                .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
              return (
                <div className={styles.day} key={toISODate(jour)}>
                  <h2>{formatDayShort(jour)}</h2>
                  {!duJour.length && <span className={styles.free}>—</span>}
                  {duJour.map((slot) => {
                    const consignee = entryFor(jour, slot.classId, slot.subjectId);
                    const choisie =
                      selection?.slotId === slot.id &&
                      toISODate(selection.date) === toISODate(jour);
                    return (
                      <button
                        type="button"
                        key={slot.id}
                        onClick={() => choisir(slot, jour)}
                        className={`${styles.slot} ${choisie ? styles.slotActive : ""} ${
                          consignee ? (consignee.isPublished ? styles.slotDone : styles.slotDraft) : ""
                        }`}
                      >
                        <b>{slot.className}</b>
                        <small>
                          {slot.startsAt}–{slot.endsAt}
                        </small>
                        <em>{slot.subjectLabel}</em>
                        {/*
                          Trois états lisibles d'un coup d'œil : rien de
                          consigné, consigné mais pas remis, remis aux
                          familles. C'est ce que l'enseignant vient vérifier en
                          fin de semaine.
                        */}
                        {consignee && (
                          <span className={styles.badge}>
                            {consignee.isPublished ? "remis" : "brouillon"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* La séance choisie. */}
        <div className={styles.form}>
          {!selection ? (
            <p className={styles.hint}>
              Choisissez un cours dans la semaine pour consigner ce qui y a été fait.
            </p>
          ) : (
            <>
              <div className={styles.formHead}>
                <BookOpenCheck />
                <div>
                  <b>{officiel}</b>
                  <small>
                    {brouillon.id
                      ? brouillon.isPublished
                        ? "Séance remise aux familles."
                        : "Séance enregistrée, pas encore remise aux familles."
                      : "Nouvelle séance."}
                  </small>
                </div>
              </div>

              <div className={styles.row}>
                <label>
                  Titre
                  <input
                    value={brouillon.title}
                    onChange={(event) =>
                      setBrouillon((b) => ({ ...b, title: event.target.value }))
                    }
                    placeholder="La phrase simple et ses constituants"
                  />
                </label>
                <label>
                  Catégorie
                  <input
                    list="lesson-categories"
                    value={brouillon.category}
                    onChange={(event) =>
                      setBrouillon((b) => ({ ...b, category: event.target.value }))
                    }
                    placeholder="Cours et activités orales"
                  />
                  {/* Une proposition, pas une contrainte : aucune liste ne
                      couvrira toutes les disciplines. */}
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
                    onChange={(event) =>
                      setBrouillon((b) => ({ ...b, themes: event.target.value }))
                    }
                    placeholder="Grammaire, Conjugaison"
                  />
                </label>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
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
                    disabled={busy}
                    onClick={() => void enregistrer(true)}
                  >
                    <Eye /> Enregistrer et remettre aux familles
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
