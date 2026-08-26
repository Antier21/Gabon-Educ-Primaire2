"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Paperclip,
  Save,
  TriangleAlert,
  X,
} from "lucide-react";
import { Brand } from "@/components/Brand";
import { BackToSpace } from "@/components/BackToSpace";
import { RichTextEditor } from "@/components/RichTextEditor";
import { createClient } from "@/lib/supabase/client";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { isRichTextEmpty } from "@/lib/lesson-book/rich-text";
import {
  LESSON_CATEGORIES,
  attachPlan,
  deleteLessonFile,
  detachPlan,
  formatFileSize,
  lessonFileUrl,
  loadAttachments,
  loadLessonFiles,
  loadTeacherAssignments,
  loadTeacherPlans,
  loadTeacherSlots,
  loadWeekEntries,
  saveEntry,
  setEntryPublished,
  uploadLessonFile,
  type Attachment,
  type LessonFile,
  type LessonBookEntry,
  type TeacherPlan,
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
  /**
   * Les pièces jointes : des fiches pédagogiques désignées, jamais téléversées.
   *
   * La fiche existe déjà en base ; la rattacher, c'est la nommer. L'école n'a
   * donc besoin d'aucun espace de stockage, et la famille ouvre la fiche telle
   * que l'enseignant l'a écrite.
   */
  const [plans, setPlans] = useState<TeacherPlan[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [choixFiche, setChoixFiche] = useState(false);
  /** Les fichiers déposés depuis l'ordinateur, et leur champ caché. */
  const [files, setFiles] = useState<LessonFile[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

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
        setPlans(await loadTeacherPlans(identifiant));
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
      const existante = entryFor(suivante.date, suivante.classId, suivante.subjectId);
      setSeance(suivante);
      setBrouillon(brouillonDe(existante));
      setChoixFiche(false);
      setMessage("");
      setError("");
      // Les pièces jointes suivent la séance affichée, jamais l'inverse.
      setAttachments([]);
      setFiles([]);
      if (existante?.id) {
        void loadAttachments(existante.id).then(setAttachments).catch(() => undefined);
        void loadLessonFiles(existante.id).then(setFiles).catch(() => undefined);
      }
    },
    [entryFor],
  );

  /**
   * Rattache une fiche à la séance.
   *
   * Une pièce jointe se rattache à une séance qui existe : si la séance n'a pas
   * encore été enregistrée, on l'enregistre d'abord, sans le demander. Exiger
   * « enregistrez puis joignez » ferait perdre le geste à tous ceux qui
   * cliquent sur le trombone en premier — c'est-à-dire à peu près tout le
   * monde.
   */
  async function joindre(planId: string) {
    setBusy(true);
    setError("");
    try {
      let id = brouillon.id;
      if (!id) {
        id = await enregistrerSeance();
        setBrouillon((b) => ({ ...b, id }));
      }
      await attachPlan(id, planId);
      setAttachments(await loadAttachments(id));
      setChoixFiche(false);
      setMessage("Fiche jointe à la séance.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rattachement impossible.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Dépose les fichiers choisis dans l'explorateur.
   *
   * Comme pour les fiches, la séance est enregistrée d'abord si elle ne l'est
   * pas encore : un fichier doit se rattacher à quelque chose qui existe, et
   * l'enseignant qui clique sur le trombone en premier ne doit pas être
   * renvoyé à un enregistrement préalable.
   */
  async function deposer(liste: FileList | null) {
    if (!liste || !liste.length) return;
    setBusy(true);
    setError("");
    try {
      let id = brouillon.id;
      if (!id) {
        id = await enregistrerSeance();
        setBrouillon((b) => ({ ...b, id }));
      }
      // Un par un, et non tous ensemble : un fichier trop lourd ne doit pas
      // faire échouer le dépôt des autres.
      const refus: string[] = [];
      for (const fichier of Array.from(liste)) {
        try {
          await uploadLessonFile(id, schoolId, fichier);
        } catch (caught) {
          refus.push(caught instanceof Error ? caught.message : fichier.name);
        }
      }
      setFiles(await loadLessonFiles(id));
      if (refus.length) setError(refus.join(" "));
      else setMessage("Pièce(s) jointe(s) déposée(s).");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dépôt impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function ouvrirFichier(fichier: LessonFile) {
    try {
      const url = await lessonFileUrl(fichier.path);
      window.open(url, "_blank", "noopener");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ouverture impossible.");
    }
  }

  async function retirerFichier(fichier: LessonFile) {
    if (!window.confirm(`Retirer « ${fichier.name} » de cette séance ?`)) return;
    setBusy(true);
    try {
      await deleteLessonFile(fichier);
      if (brouillon.id) setFiles(await loadLessonFiles(brouillon.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retrait impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function retirerFiche(planId: string) {
    if (!brouillon.id) return;
    setBusy(true);
    try {
      await detachPlan(brouillon.id, planId);
      setAttachments(await loadAttachments(brouillon.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Retrait impossible.");
    } finally {
      setBusy(false);
    }
  }

  /** L'écriture nue, partagée par l'enregistrement et le rattachement. */
  async function enregistrerSeance(): Promise<string> {
    if (!seance.classId) throw new Error("Choisissez d’abord la classe et la matière.");
    return saveEntry({
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
  }

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
      const id = await enregistrerSeance();
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
              onAttach={() => fileRef.current?.click()}
              attachCount={attachments.length + files.length}
            />
          </label>

          {/*
            Le champ de fichiers, invisible : c'est le trombone de la barre qui
            le déclenche, là où la main le cherche.
          */}
          <input
            ref={fileRef}
            type="file"
            multiple
            className={styles.hiddenFile}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.txt"
            onChange={(event) => {
              void deposer(event.target.files);
              // Remis à zéro pour que redéposer le même fichier déclenche bien
              // un nouvel événement.
              event.target.value = "";
            }}
          />

          {/* Les fichiers déposés. */}
          {files.length > 0 && (
            <div className={styles.attached}>
              {files.map((fichier) => (
                <span key={fichier.id}>
                  <Paperclip />
                  <button
                    type="button"
                    className={styles.fileName}
                    onClick={() => void ouvrirFichier(fichier)}
                    title="Ouvrir le fichier"
                  >
                    {fichier.name}
                  </button>
                  <i>{formatFileSize(fichier.sizeBytes)}</i>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void retirerFichier(fichier)}
                    aria-label={`Retirer ${fichier.name}`}
                    title="Retirer ce fichier"
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/*
            La fiche de préparation, second type de pièce jointe : elle vit
            déjà en base, on la désigne au lieu de la téléverser.
          */}
          {/*
            Deux chemins vers la même chose.

            Le trombone de la barre est là où la main le cherche, mais il est
            petit et se confond avec vingt autres icônes. Ce bouton nommé dit
            ce qu'il fait — et si l'un des deux venait à ne pas répondre, il
            reste l'autre. Une fonction qui n'a qu'une porte n'en a aucune le
            jour où elle se bloque.
          */}
          <div className={styles.attachActions}>
            <button
              type="button"
              className={styles.ghost}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip /> Joindre un fichier
            </button>
            <button
              type="button"
              className={styles.linkPlan}
              onClick={() => setChoixFiche((ouvert) => !ouvert)}
            >
              {choixFiche ? "Fermer" : "ou joindre une fiche de préparation"}
            </button>
          </div>

          {choixFiche && (
            <div className={styles.plans}>
              <b>Joindre une fiche de préparation</b>
              {!plans.length ? (
                <small>
                  Vous n’avez encore aucune fiche. Écrivez-en une dans « Fiches de préparation »,
                  elle sera proposée ici.
                </small>
              ) : (
                <ul>
                  {plans.map((fiche) => (
                    <li key={fiche.id}>
                      <button
                        type="button"
                        disabled={busy || attachments.some((item) => item.planId === fiche.id)}
                        onClick={() => void joindre(fiche.id)}
                      >
                        <Paperclip />
                        <span>{fiche.title}</span>
                        {fiche.status !== "published" && <em>brouillon</em>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {attachments.length > 0 && (
            <div className={styles.attached}>
              {attachments.map((piece) => (
                <span key={piece.planId}>
                  <Paperclip />
                  {piece.title}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void retirerFiche(piece.planId)}
                    aria-label={`Retirer ${piece.title}`}
                    title="Retirer cette fiche"
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
          )}

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
