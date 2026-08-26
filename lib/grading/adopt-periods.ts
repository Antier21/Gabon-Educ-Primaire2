/**
 * Adoption du découpage de l'établissement par le cahier de notes.
 *
 * Les périodes du cahier de notes étaient écrites en dur dans le navigateur :
 * « Trimestre 1, 2, 3 », les mêmes pour tout le monde, quelle que soit la
 * décision de l'établissement. Un établissement qui évalue par paliers n'en
 * voyait aucun, et l'enseignant n'avait aucun moyen de saisir au bon endroit.
 *
 * La fusion tient en une phrase : l'établissement décide de la liste, le
 * cahier de notes garde ses données.
 */

import { periodKey, periodSortRank } from "@/lib/report-model/periods";
import type { GradingPeriod } from "./types";

export type SchoolPeriodLike = {
  id: string;
  label: string;
  kind: string;
  sequenceNumber: number | null;
};

/**
 * Fusionne les périodes locales et celles de l'établissement.
 *
 * Trois règles, chacune payée d'une leçon :
 *
 *   — l'appariement se fait sur la clé canonique, pas sur le libellé. « 1er
 *     trimestre » et « Trimestre 1 » sont la même période, et les confondre a
 *     déjà produit six trimestres dans une base réelle ;
 *
 *   — une période appariée garde son identifiant local. Les évaluations déjà
 *     saisies y renvoient : lui substituer l'identifiant du nuage les rendrait
 *     orphelines, et l'enseignant verrait ses notes disparaître ;
 *
 *   — une période locale absente du découpage n'est supprimée que si elle ne
 *     porte rien. Un établissement qui passe des trimestres aux paliers en
 *     cours d'année ne doit pas perdre le trimestre déjà évalué.
 */
export function adoptSchoolPeriods(
  local: readonly GradingPeriod[],
  school: readonly SchoolPeriodLike[],
  carriesData: (periodId: string) => boolean,
): GradingPeriod[] {
  if (!school.length) return [...local];

  const byKey = new Map<string, GradingPeriod>();
  for (const period of local) {
    const key = periodKey(period.label);
    if (key && !byKey.has(key)) byKey.set(key, period);
  }

  const ordered = [...school].sort(
    (a, b) => periodSortRank(a.kind, a.sequenceNumber) - periodSortRank(b.kind, b.sequenceNumber),
  );

  const adopted: GradingPeriod[] = [];
  const usedKeys = new Set<string>();

  for (const period of ordered) {
    const key = periodKey(period.label);
    usedKeys.add(key);
    const existing = byKey.get(key);
    adopted.push(
      existing
        ? { ...existing, label: period.label }
        : {
            id: period.id,
            label: period.label,
            startsOn: "",
            endsOn: "",
            active: false,
            locked: false,
          },
    );
  }

  // Ce que l'établissement ne déclare plus, mais que l'enseignant a rempli.
  for (const period of local) {
    const key = periodKey(period.label);
    if (usedKeys.has(key)) continue;
    if (carriesData(period.id)) adopted.push({ ...period });
  }

  // Une période active, et une seule. Celle qui l'était le reste si elle a
  // survécu : basculer l'enseignant sur une autre période au moment où il
  // saisit lui ferait perdre le fil.
  const previouslyActive = local.find((item) => item.active);
  const stillThere =
    previouslyActive &&
    adopted.find((item) => periodKey(item.label) === periodKey(previouslyActive.label));
  const activeId = stillThere ? stillThere.id : adopted[0]?.id;

  return adopted.map((item) => ({ ...item, active: item.id === activeId }));
}
