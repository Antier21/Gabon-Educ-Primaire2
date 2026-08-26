/**
 * La semaine scolaire, telle qu'on la lit dans un cahier de textes.
 *
 * Tout est calculé sur des dates locales et rendu en « AAAA-MM-JJ ». C'est
 * délibéré : « toISOString » convertit en temps universel, et une séance du
 * lundi 24 à 7h30 à Libreville — UTC+1 — y devient le dimanche 23 à 6h30. Le
 * cahier de textes aurait alors rangé la séance dans la semaine précédente.
 */

/** Lundi à samedi : la semaine ouvrée des établissements gabonais. */
export const SCHOOL_DAYS = 6;

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** « AAAA-MM-JJ » sans passer par le temps universel. */
export function toISODate(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${jour}`;
}

/** L'inverse, en date locale à midi — à l'abri des changements d'heure. */
export function fromISODate(value: string): Date {
  const [annee, mois, jour] = String(value || "")
    .split("-")
    .map((part) => Number(part));
  return new Date(annee || 1970, (mois || 1) - 1, jour || 1, 12, 0, 0, 0);
}

/**
 * Le lundi de la semaine d'une date.
 *
 * Le dimanche appartient à la semaine qui s'achève, et non à celle qui
 * s'ouvre : un enseignant qui prépare son cahier le dimanche soir pense encore
 * à la semaine écoulée.
 */
export function weekStart(date: Date): Date {
  const jour = date.getDay();
  const recul = jour === 0 ? 6 : jour - 1;
  const lundi = new Date(date.getFullYear(), date.getMonth(), date.getDate() - recul, 12, 0, 0, 0);
  return lundi;
}

/** Les six jours ouvrés à partir d'un lundi. */
export function weekDays(monday: Date): Date[] {
  return Array.from(
    { length: SCHOOL_DAYS },
    (_, index) =>
      new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index, 12, 0, 0, 0),
  );
}

export function shiftWeek(monday: Date, weeks: number): Date {
  return new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + weeks * 7,
    12,
    0,
    0,
    0,
  );
}

/** « lundi 24 août » — le jour en toutes lettres, comme sur un cahier. */
export function formatDayLong(date: Date): string {
  const mois = date.toLocaleDateString("fr-FR", { month: "long" });
  return `${JOURS[date.getDay()]} ${date.getDate()} ${mois}`;
}

/** « lun. 24/08 » — la version courte, pour l'en-tête d'une colonne. */
export function formatDayShort(date: Date): string {
  const jour = JOURS[date.getDay()].slice(0, 3);
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  return `${jour}. ${String(date.getDate()).padStart(2, "0")}/${mois}`;
}

/** « du 24 au 29 août 2026 », en évitant de répéter un mois identique. */
export function formatWeekRange(monday: Date): string {
  const jours = weekDays(monday);
  const debut = jours[0];
  const fin = jours[jours.length - 1];
  const moisDebut = debut.toLocaleDateString("fr-FR", { month: "long" });
  const moisFin = fin.toLocaleDateString("fr-FR", { month: "long" });
  if (moisDebut === moisFin && debut.getFullYear() === fin.getFullYear()) {
    return `du ${debut.getDate()} au ${fin.getDate()} ${moisFin} ${fin.getFullYear()}`;
  }
  return `du ${debut.getDate()} ${moisDebut} au ${fin.getDate()} ${moisFin} ${fin.getFullYear()}`;
}

/**
 * Le jour de la semaine au format de la table des créneaux : 1 = lundi.
 *
 * « getDay » compte à partir du dimanche ; la base compte à partir du lundi.
 * Confondre les deux décalerait tout l'emploi du temps d'un jour.
 */
export function weekdayOf(date: Date): number {
  const jour = date.getDay();
  return jour === 0 ? 7 : jour;
}

/** « 09:30 » à partir d'un « 09:30:00 » venu de la base. */
export function shortTime(value: string | null | undefined): string {
  return String(value || "").slice(0, 5);
}
