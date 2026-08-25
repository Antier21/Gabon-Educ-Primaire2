/**
 * La structure officielle du bulletin de primaire, telle qu'elle est imprimée.
 *
 * Relevée sur un bulletin de palier et un bilan annuel de l'établissement
 * « Le Guide de Nos Enfants Plus », Libreville-Est, année 2025-2026, classe de
 * 4e année : quatre domaines, dix-neuf lignes de notes, deux cents points.
 *
 * Elle est livrée comme point de départ, jamais comme contrainte. Trois choses
 * appartiennent à l'établissement et doivent rester modifiables :
 *
 *   — les matières, car le privé enseigne les matières officielles et y ajoute
 *     les siennes ;
 *   — les barèmes, car « Résolution de problèmes » sur 20 est le choix de cet
 *     établissement et non une règle nationale ;
 *   — le découpage de l'année, traité à l'étape suivante.
 *
 * D'où cette structure en données plutôt qu'en dur dans les écrans : elle sert
 * à amorcer le modèle d'un établissement, qui le remanie ensuite à sa guise.
 */

export type OfficialLine = {
  /** Compétence de rattachement : « C1 », « C2 », « C3 ». */
  skill: string;
  label: string;
  maxScore: number;
};

export type OfficialDomain = {
  label: string;
  /** Nom abrégé porté par le bulletin papier, quand il diffère. */
  shortLabel: string;
  lines: OfficialLine[];
};

export const OFFICIAL_REPORT_MODEL: OfficialDomain[] = [
  {
    label: "Français",
    shortLabel: "Français",
    lines: [
      { skill: "C1", label: "Lecture expressive", maxScore: 10 },
      { skill: "C1", label: "Expression orale — Récitation", maxScore: 10 },
      { skill: "C2", label: "Compréhension du texte", maxScore: 10 },
      {
        skill: "C2",
        label: "Maniement de la langue (vocabulaire, grammaire, conjugaison, orthographe)",
        maxScore: 10,
      },
      { skill: "C2", label: "Production écrite", maxScore: 10 },
      { skill: "C2", label: "Dictée", maxScore: 10 },
    ],
  },
  {
    label: "Anglais",
    shortLabel: "Anglais",
    lines: [
      { skill: "C1", label: "Expression orale", maxScore: 10 },
      { skill: "C2", label: "Expression écrite", maxScore: 10 },
    ],
  },
  {
    label: "Mathématiques",
    shortLabel: "Mathématiques",
    lines: [
      { skill: "C1", label: "Nombres & Opérations", maxScore: 10 },
      { skill: "C1", label: "Calcul mental", maxScore: 10 },
      // Sur 20 : le choix de cet établissement, pas une règle nationale.
      { skill: "C1", label: "Résolution de problèmes", maxScore: 20 },
      { skill: "C2", label: "Géométrie", maxScore: 10 },
      { skill: "C2", label: "Mesure", maxScore: 10 },
    ],
  },
  {
    label: "Éveil (EDM / EAS)",
    shortLabel: "Éveil",
    lines: [
      { skill: "C1", label: "Histoire — Géographie", maxScore: 10 },
      {
        skill: "C1",
        label: "Éducation à la citoyenneté, à l’environnement & à la santé",
        maxScore: 10,
      },
      { skill: "C2", label: "Biologie — Sciences physiques — Technologie", maxScore: 10 },
      { skill: "C2", label: "Informatique / TIC", maxScore: 10 },
      { skill: "C3", label: "Dessin", maxScore: 10 },
      { skill: "C3", label: "EPS", maxScore: 10 },
    ],
  },
];

/** Barème total d'un domaine : la somme de ses lignes, jamais une valeur saisie. */
export function domainMaxScore(domain: { lines: readonly { maxScore: number }[] }): number {
  return domain.lines.reduce((total, line) => total + Number(line.maxScore || 0), 0);
}

/** Barème total du bulletin. */
export function modelMaxScore(
  domains: readonly { lines: readonly { maxScore: number }[] }[],
): number {
  return domains.reduce((total, domain) => total + domainMaxScore(domain), 0);
}

/** Les compétences d'un domaine, dans l'ordre où elles apparaissent. */
export function skillsOf(domain: { lines: readonly { skill: string }[] }): string[] {
  const seen: string[] = [];
  for (const line of domain.lines) {
    if (!seen.includes(line.skill)) seen.push(line.skill);
  }
  return seen;
}
