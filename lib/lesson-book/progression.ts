"use client";

/**
 * La progression annuelle.
 *
 * L'écran de la semaine sert à écrire ; celui-ci sert à relire. Ce sont deux
 * besoins différents, et c'est pourquoi ils ne partagent pas la même page :
 * l'enseignant consigne au jour le jour, mais rend compte à l'année. Un
 * inspecteur qui ouvre le cahier ne demande pas « qu'avez-vous fait mercredi »,
 * il demande « où en êtes-vous du programme » — et cette question-là n'a de
 * réponse que sur toute l'année, d'un seul tenant.
 *
 * Le regroupement se fait par période et non par mois : c'est le découpage que
 * l'établissement a déclaré, celui des bulletins, et celui dans lequel le
 * conseil de classe raisonne.
 */

import { createClient } from "@/lib/supabase/client";
import { sanitizeRichText } from "./rich-text";
import { HOMEWORK_COLUMNS, homeworkFromRow, type Homework } from "./store";
import { shortTime } from "./week";

export type ProgressionEntry = {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  title: string;
  contentHtml: string;
  programElements: string;
  category: string;
  themes: string[];
  isPublished: boolean;
  homework: Homework[];
  /** Le nombre de pièces jointes, fichiers et fiches confondus. */
  attachmentCount: number;
};

export type ProgressionPeriod = {
  id: string;
  label: string;
  entries: ProgressionEntry[];
  /** Le temps effectivement consigné, en minutes. */
  minutes: number;
  homeworkCount: number;
};

/** Une période du découpage de l'école, réduite à ce qui sert ici. */
export type PeriodBounds = { id: string; label: string; startsOn: string; endsOn: string };

/* ===================================================================
 * Les calculs — sans base, donc vérifiables.
 * =================================================================== */

/**
 * La durée d'une séance, en minutes.
 *
 * Rend zéro plutôt qu'un nombre négatif quand la fin précède le début : une
 * telle séance est une faute de saisie, et la compter en négatif ferait
 * mentir le total de la période au lieu de signaler l'erreur.
 */
export function sessionMinutes(startsAt: string, endsAt: string): number {
  const lire = (valeur: string): number | null => {
    const trouve = /^(\d{1,2}):(\d{2})/.exec(String(valeur || ""));
    if (!trouve) return null;
    const heures = Number(trouve[1]);
    const minutes = Number(trouve[2]);
    if (heures > 23 || minutes > 59) return null;
    return heures * 60 + minutes;
  };
  const debut = lire(startsAt);
  const fin = lire(endsAt);
  if (debut === null || fin === null) return 0;
  return fin > debut ? fin - debut : 0;
}

/** « 18 h 30 », « 3 h », « 45 min » — ce qu'un relevé de service écrit. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const heures = Math.floor(total / 60);
  const reste = total % 60;
  return reste ? `${heures} h ${String(reste).padStart(2, "0")}` : `${heures} h`;
}

/**
 * Range les séances dans les périodes de l'établissement.
 *
 * Trois précautions, chacune pour une situation réelle :
 *
 * — Une période sans dates ne peut rien contenir ; elle est écartée plutôt que
 *   de recevoir arbitrairement des séances.
 * — Si aucune période n'est exploitable, tout tient dans un seul bloc plutôt
 *   que dans un « hors période » qui laisserait croire à une anomalie alors que
 *   c'est simplement l'école qui n'a pas encore saisi ses dates.
 * — Une séance qui ne tombe dans aucune période n'est pas perdue : elle va
 *   dans un bloc final. Une progression qui escamote des séances vaut moins
 *   que pas de progression du tout.
 */
export function groupByPeriod(
  entries: ProgressionEntry[],
  periods: PeriodBounds[],
): ProgressionPeriod[] {
  const utilisables = periods
    .filter((periode) => periode.startsOn && periode.endsOn)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn));

  const bloc = (id: string, label: string, liste: ProgressionEntry[]): ProgressionPeriod => ({
    id,
    label,
    entries: liste,
    minutes: liste.reduce((somme, item) => somme + sessionMinutes(item.startsAt, item.endsAt), 0),
    homeworkCount: liste.reduce((somme, item) => somme + item.homework.length, 0),
  });

  if (!utilisables.length) {
    return entries.length ? [bloc("", "Année scolaire", entries)] : [];
  }

  const restantes = new Set(entries.map((entree) => entree.id));
  const blocs: ProgressionPeriod[] = [];

  for (const periode of utilisables) {
    const dedans = entries.filter(
      (entree) =>
        restantes.has(entree.id) &&
        entree.date >= periode.startsOn &&
        entree.date <= periode.endsOn,
    );
    for (const entree of dedans) restantes.delete(entree.id);
    blocs.push(bloc(periode.id, periode.label, dedans));
  }

  const orphelines = entries.filter((entree) => restantes.has(entree.id));
  if (orphelines.length) blocs.push(bloc("hors", "Hors période déclarée", orphelines));

  return blocs.filter((item) => item.entries.length > 0);
}

/* ===================================================================
 * La lecture.
 * =================================================================== */

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [raw.message, raw.details]
      .map((value) => (typeof value === "string" ? value : ""))
      .filter(Boolean);
    const code = typeof raw.code === "string" && raw.code ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "Progression indisponible.";
}

/** Les périodes de l'année, bornées, sans les paliers. */
export async function loadPeriodBounds(
  schoolId: string,
  academicYearId: string,
): Promise<PeriodBounds[]> {
  if (!schoolId || !academicYearId) return [];
  const { data, error } = await createClient()
    .from("school_periods")
    .select("id,label,period_kind,starts_on,ends_on")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .order("starts_on");
  if (error) throw new Error(describe(error));

  type Row = {
    id: string;
    label?: string;
    period_kind?: string;
    starts_on?: string | null;
    ends_on?: string | null;
  };
  const lignes = (data || []) as unknown as Row[];

  /*
   * Trimestres et semestres seulement.
   *
   * Une école qui a déclaré des paliers EN PLUS de ses trimestres ferait
   * apparaître chaque séance deux fois — une fois dans son trimestre, une fois
   * dans son palier — et le total des heures serait doublé. On garde donc le
   * découpage principal, celui du bulletin.
   */
  const principales = lignes.filter(
    (row) => row.period_kind === "trimester" || row.period_kind === "semester",
  );
  const retenues = principales.length ? principales : lignes;

  return retenues.map((row) => ({
    id: String(row.id),
    label: String(row.label || "Période"),
    startsOn: String(row.starts_on || ""),
    endsOn: String(row.ends_on || ""),
  }));
}

/**
 * Toutes les séances d'une classe dans une matière, sur l'année.
 *
 * Les devoirs et les pièces jointes sont relus en deux requêtes d'ensemble, et
 * non séance par séance : une année compte cent cinquante séances, et cent
 * cinquante allers-retours rendraient l'écran inutilisable sur la connexion
 * d'un établissement.
 */
export async function loadProgression(
  teacherId: string,
  classId: string,
  subjectId: string,
): Promise<ProgressionEntry[]> {
  if (!teacherId || !classId) return [];
  const client = createClient();

  let requete = client
    .from("lesson_book_entries")
    .select(
      "id,session_date,starts_at,ends_at,title,content_html,program_elements,category,themes,is_published",
    )
    .eq("teacher_id", teacherId)
    .eq("class_group_id", classId)
    .order("session_date")
    .order("starts_at");
  if (subjectId) requete = requete.eq("school_subject_id", subjectId);

  const { data, error } = await requete;
  if (error) throw new Error(describe(error));

  const lignes = (data || []) as Array<Record<string, unknown>>;
  const identifiants = lignes.map((row) => String(row.id));
  if (!identifiants.length) return [];

  const [devoirs, fichiers, fiches] = await Promise.all([
    client
      .from("lesson_book_homework")
      .select(HOMEWORK_COLUMNS)
      .in("entry_id", identifiants)
      .order("position"),
    client.from("lesson_book_files").select("id,entry_id").in("entry_id", identifiants),
    client.from("lesson_book_attachments").select("id,entry_id").in("entry_id", identifiants),
  ]);

  /*
   * Un refus de lecture sur les annexes ne doit pas emporter la progression.
   *
   * Le tableau garde tout son sens sans le décompte des pièces jointes ; il
   * n'en a aucun sans les séances. On préfère donc un comptage à zéro à un
   * écran vide.
   */
  const parEntree = new Map<string, Homework[]>();
  if (!devoirs.error) {
    for (const row of (devoirs.data || []) as unknown as Array<Record<string, unknown>>) {
      const cle = String(row.entry_id);
      const liste = parEntree.get(cle) || [];
      liste.push(homeworkFromRow(row));
      parEntree.set(cle, liste);
    }
  }

  const pieces = new Map<string, number>();
  for (const source of [fichiers, fiches]) {
    if (source.error) continue;
    for (const row of (source.data || []) as Array<Record<string, unknown>>) {
      const cle = String(row.entry_id);
      pieces.set(cle, (pieces.get(cle) || 0) + 1);
    }
  }

  return lignes.map((row) => {
    const id = String(row.id);
    return {
      id,
      date: String(row.session_date || ""),
      startsAt: shortTime(row.starts_at as string),
      endsAt: shortTime(row.ends_at as string),
      title: String(row.title || ""),
      // Filtré à la lecture comme partout ailleurs : ce qui serait entré par un
      // autre chemin doit l'être aussi.
      contentHtml: sanitizeRichText(String(row.content_html || "")),
      programElements: String(row.program_elements || ""),
      category: String(row.category || ""),
      themes: Array.isArray(row.themes) ? (row.themes as string[]).map(String) : [],
      isPublished: row.is_published === true,
      homework: parEntree.get(id) || [],
      attachmentCount: pieces.get(id) || 0,
    };
  });
}
