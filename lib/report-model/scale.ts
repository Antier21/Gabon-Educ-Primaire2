/**
 * La règle de calcul du bulletin gabonais, et l'échelle de maîtrise.
 *
 * Ce n'est pas une moyenne de notes : c'est un rapport de totaux.
 *
 *     moyenne = (somme des notes ÷ somme des barèmes) × 10
 *
 * La distinction n'est pas théorique. Sur le bulletin de 4e année qui a servi
 * de modèle, la compétence C1 de mathématiques porte trois lignes notées 10, 1
 * et 13, sur des barèmes de 10, 10 et 20 :
 *
 *     (10 + 1 + 13) ÷ (10 + 10 + 20) × 10 = 6,00   ← ce qu'imprime le bulletin
 *
 * La moyenne arithmétique des trois notes ramenées sur 10 aurait donné 5,83,
 * et le bulletin aurait été faux. C'est le barème qui pondère : une ligne sur
 * 20 pèse deux fois une ligne sur 10.
 *
 * La même formule s'applique à l'identique à chaque étage — compétence,
 * domaine, moyenne générale — ce qui est précisément ce qui rend l'ensemble
 * cohérent : le total général n'est pas une moyenne de moyennes.
 */

export type ScoredLine = {
  /** Note obtenue. `null` lorsque la ligne n'a pas été évaluée. */
  score: number | null;
  /** Barème de la ligne : 10, 20, ce que l'établissement a décidé. */
  maxScore: number;
};

export type Totals = {
  /** Somme des notes des lignes évaluées. */
  obtained: number;
  /** Somme des barèmes de ces mêmes lignes. */
  total: number;
  /** Moyenne sur 10, ou `null` si rien n'a été évalué. */
  average: number | null;
};

/**
 * Additionne les lignes évaluées et en tire la moyenne sur 10.
 *
 * Les lignes non évaluées sont écartées des deux sommes, et non comptées
 * zéro : un enfant absent à la dictée ne doit pas voir sa moyenne de français
 * s'effondrer pour une épreuve qu'il n'a pas passée. C'est aussi ce qui permet
 * d'afficher un bulletin de palier avant que toutes les lignes soient
 * remplies.
 */
export function totalsOf(lines: readonly ScoredLine[]): Totals {
  let obtained = 0;
  let total = 0;
  for (const line of lines) {
    if (line.score === null || !Number.isFinite(line.score)) continue;
    const max = Number(line.maxScore);
    if (!Number.isFinite(max) || max <= 0) continue;
    obtained += Number(line.score);
    total += max;
  }
  if (total <= 0) return { obtained: 0, total: 0, average: null };
  return { obtained, total, average: (obtained / total) * 10 };
}

/**
 * Arrondi d'affichage : deux décimales, comme sur le document papier.
 *
 * L'arrondi n'intervient qu'à l'affichage, jamais dans les cumuls. Arrondir
 * une moyenne de compétence avant de la reporter dans le domaine ferait
 * dériver le total général de quelques centièmes — assez pour qu'un parent
 * attentif refasse l'addition et trouve un écart.
 */
export function formatAverage(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(2).replace(".", ",");
}

/** Les quatre niveaux de maîtrise du bulletin officiel. */
export type MasteryLevel = "A" | "B" | "C" | "D";

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  A: "Maîtrise maximale",
  B: "Maîtrise minimale",
  C: "Maîtrise partielle",
  D: "Non maîtrise",
};

/**
 * Le niveau se déduit de la moyenne, il ne se saisit pas.
 *
 * L'application proposait jusqu'ici une échelle déclarée par l'enseignant —
 * acquis, en cours d'acquisition, non acquis. Les deux ne se remplacent pas :
 * celle du bulletin se calcule, et deux enseignants qui saisissent les mêmes
 * notes doivent obtenir la même lettre.
 *
 * Seuils : A de 8,00 à 10,00 · B de 5,00 à 7,99 · C de 2,00 à 4,99 · D en
 * dessous.
 */
export function masteryLevel(average: number | null): MasteryLevel | null {
  if (average === null || !Number.isFinite(average)) return null;
  if (average >= 8) return "A";
  if (average >= 5) return "B";
  if (average >= 2) return "C";
  return "D";
}
