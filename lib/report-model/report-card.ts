/**
 * Le bulletin calculé, pour une classe et une période.
 *
 * Tout se déduit de trois choses : le modèle de l'établissement, les notes
 * saisies, et la règle de calcul de l'étape 1. Rien n'est saisi à la main, et
 * c'est ce qui garantit que deux enseignants qui posent les mêmes notes
 * obtiennent le même bulletin.
 *
 * Ce module ne connaît ni React ni Supabase : il prend des données, il rend
 * des données. C'est ce qui permet de vérifier les chiffres du bulletin
 * papier par des tests plutôt que de les relire à l'écran.
 */

import { masteryLevel, totalsOf, type MasteryLevel, type Totals } from "./scale";

export type ModelLineLike = { id: string; label: string; maxScore: number };
export type ModelSkillLike = { id: string; code: string; lines: readonly ModelLineLike[] };
export type ModelDomainLike = {
  id: string;
  label: string;
  shortLabel?: string;
  skills: readonly ModelSkillLike[];
};

export type PupilLike = { id: string; fullName: string };

/** Notes de toute la classe : « élève:ligne » → note, ou absente si non évaluée. */
export type ClassScores = Record<string, number | null>;

export type SkillResult = {
  skillId: string;
  code: string;
  totals: Totals;
  mastery: MasteryLevel | null;
};

export type DomainResult = {
  domainId: string;
  label: string;
  shortLabel: string;
  maxScore: number;
  skills: SkillResult[];
  totals: Totals;
  mastery: MasteryLevel | null;
};

export type PupilReport = {
  studentId: string;
  fullName: string;
  domains: DomainResult[];
  general: Totals;
  mastery: MasteryLevel | null;
  /**
   * Rang dans la classe. `null` pour un élève dont aucune ligne n'est évaluée :
   * le classer dernier lui imputerait une contre-performance qu'il n'a pas
   * eue, alors qu'il n'a simplement pas encore été noté.
   */
  rank: number | null;
};

export type ClassReport = {
  pupils: PupilReport[];
  /** Effectif retenu pour le classement — les élèves non évalués en sont exclus. */
  rankedCount: number;
  classAverage: number | null;
  bestAverage: number | null;
  maxScore: number;
};

function key(studentId: string, lineId: string) {
  return `${studentId}:${lineId}`;
}

function scoredLinesOf(
  studentId: string,
  lines: readonly ModelLineLike[],
  scores: ClassScores,
) {
  return lines.map((line) => ({
    score: scores[key(studentId, line.id)] ?? null,
    maxScore: line.maxScore,
  }));
}

/**
 * Construit le bulletin de chaque élève, puis les situe les uns par rapport
 * aux autres.
 *
 * Le classement suit l'usage scolaire : deux élèves à égalité portent le même
 * rang, et le rang suivant saute d'autant. Deux premiers ex æquo sont donc
 * suivis d'un troisième, jamais d'un deuxième — c'est ce qu'attend un parent
 * qui lit « 9e sur 36 ».
 */
export function buildClassReport(
  domains: readonly ModelDomainLike[],
  pupils: readonly PupilLike[],
  scores: ClassScores,
): ClassReport {
  const maxScore = domains.reduce(
    (total, domain) =>
      total +
      domain.skills.reduce(
        (sum, skill) => sum + skill.lines.reduce((n, line) => n + line.maxScore, 0),
        0,
      ),
    0,
  );

  const reports: PupilReport[] = pupils.map((pupil) => {
    const domainResults: DomainResult[] = domains.map((domain) => {
      const skills: SkillResult[] = domain.skills.map((skill) => {
        const totals = totalsOf(scoredLinesOf(pupil.id, skill.lines, scores));
        return {
          skillId: skill.id,
          code: skill.code,
          totals,
          mastery: masteryLevel(totals.average),
        };
      });
      const domainLines = domain.skills.flatMap((skill) => skill.lines);
      const totals = totalsOf(scoredLinesOf(pupil.id, domainLines, scores));
      return {
        domainId: domain.id,
        label: domain.label,
        shortLabel: domain.shortLabel || domain.label,
        maxScore: domainLines.reduce((sum, line) => sum + line.maxScore, 0),
        skills,
        totals,
        mastery: masteryLevel(totals.average),
      };
    });

    // La moyenne générale se calcule sur toutes les lignes d'un coup, jamais
    // en moyennant les moyennes de domaine : un domaine sur 20 ne pèse pas
    // autant qu'un domaine sur 60, et la moyenne des moyennes l'oublierait.
    const allLines = domains.flatMap((domain) =>
      domain.skills.flatMap((skill) => skill.lines),
    );
    const general = totalsOf(scoredLinesOf(pupil.id, allLines, scores));

    return {
      studentId: pupil.id,
      fullName: pupil.fullName,
      domains: domainResults,
      general,
      mastery: masteryLevel(general.average),
      rank: null,
    };
  });

  const evaluated = reports.filter((item) => item.general.average !== null);
  const sorted = [...evaluated].sort(
    (a, b) => (b.general.average as number) - (a.general.average as number),
  );

  let previousAverage: number | null = null;
  let previousRank = 0;
  sorted.forEach((report, index) => {
    const average = report.general.average as number;
    // L'égalité se juge au centième, comme sur le bulletin imprimé : deux
    // moyennes qui s'affichent « 8,50 » toutes les deux doivent porter le même
    // rang, même si elles diffèrent à la douzième décimale.
    const same = previousAverage !== null && Math.abs(average - previousAverage) < 0.005;
    const rank = same ? previousRank : index + 1;
    report.rank = rank;
    previousAverage = average;
    previousRank = rank;
  });

  const classAverage = evaluated.length
    ? evaluated.reduce((sum, item) => sum + (item.general.average as number), 0) /
      evaluated.length
    : null;
  const bestAverage = sorted.length ? (sorted[0].general.average as number) : null;

  return {
    pupils: reports,
    rankedCount: evaluated.length,
    classAverage,
    bestAverage,
    maxScore,
  };
}

/** Le bulletin d'un élève, extrait du bulletin de classe. */
export function pupilReportOf(report: ClassReport, studentId: string) {
  return report.pupils.find((item) => item.studentId === studentId) || null;
}

/** « 9e sur 36 », ou « — » tant que l'élève n'a aucune note. */
export function formatRank(rank: number | null, total: number): string {
  if (!rank || !total) return "—";
  return `${rank}${rank === 1 ? "er" : "e"} sur ${total}`;
}
