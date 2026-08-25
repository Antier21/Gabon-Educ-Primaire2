/**
 * Le découpage de l'année scolaire.
 *
 * Deux découpages coexistent au primaire gabonais, et aucun ne remplace
 * l'autre. Beaucoup d'établissements s'en tiennent aux trois trimestres.
 * D'autres évaluent par paliers — deux par trimestre, soit six paliers, plus
 * un bilan de fin d'année. Le bulletin photographié porte d'ailleurs la
 * mention « BULLETIN D'ÉVALUATION DU PALIER 3 ».
 *
 * Le palier ne remplace pas le trimestre : il se loge dedans. C'est ce qui
 * permet à un bulletin trimestriel d'agréger ses deux paliers sans que rien
 * ne soit ressaisi — et c'est pourquoi chaque palier porte le trimestre dont
 * il relève.
 */

export type PeriodScheme = "trimester" | "palier";

export type PlannedPeriod = {
  label: string;
  kind: "trimester" | "palier" | "annual";
  /** Numéro du trimestre de rattachement, 1 à 3. Absent pour le bilan annuel. */
  termNumber?: number;
  /** Rang du palier dans l'année, 1 à 6. Absent pour les autres. */
  palierNumber?: number;
};

export const TERM_LABELS = ["1er trimestre", "2e trimestre", "3e trimestre"];

/**
 * Les périodes à créer pour une année, selon le découpage choisi.
 *
 * La numérotation des paliers est continue sur l'année — palier 1 à palier 6 —
 * et non remise à zéro à chaque trimestre. C'est ainsi que le bulletin les
 * nomme : « palier 3 » désigne le premier palier du deuxième trimestre, et un
 * parent qui lit « palier 3 » doit retrouver le même mot d'un établissement à
 * l'autre.
 */
export function planPeriods(
  scheme: PeriodScheme,
  paliersPerTerm = 2,
  termCount = 3,
): PlannedPeriod[] {
  const terms = Math.max(1, Math.min(termCount, 3));
  const periods: PlannedPeriod[] = [];

  for (let term = 1; term <= terms; term += 1) {
    periods.push({
      label: TERM_LABELS[term - 1] || `${term}e trimestre`,
      kind: "trimester",
      termNumber: term,
    });
  }

  if (scheme === "palier") {
    const perTerm = Math.max(1, Math.min(paliersPerTerm, 4));
    let numero = 0;
    for (let term = 1; term <= terms; term += 1) {
      for (let index = 0; index < perTerm; index += 1) {
        numero += 1;
        periods.push({
          label: `Palier ${numero}`,
          kind: "palier",
          termNumber: term,
          palierNumber: numero,
        });
      }
    }
    // Le bilan annuel n'existe que dans le découpage par paliers : il agrège
    // les six paliers et porte l'évaluation de fin d'année, avec la décision
    // du conseil de classe. Un établissement en trimestres délivre son
    // troisième bulletin trimestriel à la place.
    periods.push({ label: "Bilan annuel", kind: "annual" });
  }

  return periods;
}

/**
 * Les paliers d'un trimestre donné.
 *
 * Sert au bulletin trimestriel : ses notes sont celles de ses paliers, jamais
 * une seconde saisie.
 */
export function paliersOfTerm(periods: readonly PlannedPeriod[], termNumber: number) {
  return periods.filter((item) => item.kind === "palier" && item.termNumber === termNumber);
}

/** Formulation courte pour l'en-tête du bulletin : « PALIER 3 », « 2E TRIMESTRE ». */
export function reportTitleFor(period: PlannedPeriod): string {
  if (period.kind === "annual") return "BILAN ANNUEL";
  return period.label.toLocaleUpperCase("fr");
}

/**
 * Clé canonique d'une période, pour reconnaître deux libellés qui désignent
 * la même chose.
 *
 * « Trimestre 1 », « 1er trimestre », « 1ER TRIMESTRE » sont le même
 * trimestre. Comparer les libellés caractère par caractère a conduit à créer
 * un second jeu de trimestres par-dessus celui posé à l'ouverture de
 * l'établissement — six trimestres au lieu de trois, et des enseignants qui
 * ne savent plus lequel choisir.
 */
export function periodKey(label: string): string {
  const brut = String(label || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!brut) return "";

  const chiffre = brut.match(/\d+/)?.[0] || "";

  if (brut.includes("palier")) return chiffre ? `palier-${Number(chiffre)}` : "palier";
  if (brut.includes("trimestre")) return chiffre ? `trimestre-${Number(chiffre)}` : "trimestre";
  if (brut.includes("semestre")) return chiffre ? `semestre-${Number(chiffre)}` : "semestre";
  // « Bilan annuel », « Bilan de fin d'année », « Annuel ».
  if (brut.includes("annuel") || brut.includes("annee") || brut.includes("bilan"))
    return "annuel";
  return brut.replace(/\s+/g, "-");
}

/**
 * Ordre d'affichage : les trimestres, puis les paliers, puis le bilan annuel.
 *
 * L'ordre alphabétique des types plaçait « annual » en tête, si bien que le
 * bilan de fin d'année ouvrait la liste des périodes.
 */
export function periodSortRank(kind: string, sequence: number | null): number {
  const base = kind === "trimester" || kind === "semester" ? 0 : kind === "palier" ? 100 : 200;
  return base + (sequence ?? 99);
}
