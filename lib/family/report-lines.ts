/**
 * Le relevé de notes de la famille, sur les lignes du bulletin.
 *
 * Le relevé lisait jusqu'ici les évaluations de l'ancien cahier de notes.
 * Depuis que les enseignants saisissent sur les lignes du modèle, ces notes
 * n'arrivaient plus à personne : elles entraient en base et s'y arrêtaient.
 *
 * Ce module ferme le circuit. Il ne remplace rien : l'ancien relevé continue
 * de s'afficher à côté, le temps que toutes les classes soient passées au
 * nouveau modèle. Couper l'ancien d'un coup priverait de notes les familles
 * dont l'enseignant n'a pas encore basculé — exactement ce que nous voulions
 * éviter en construisant les deux chaînes en parallèle.
 */

import { createClient } from "@/lib/supabase/client";
import { loadReportModel, type ModelDomain } from "@/lib/report-model/store";
import { periodSortRank } from "@/lib/report-model/periods";
import { masteryLevel, totalsOf, type MasteryLevel } from "@/lib/report-model/scale";

export type FamilyLineRow = {
  label: string;
  maxScore: number;
  score: number | null;
};

export type FamilySkillRow = {
  code: string;
  average: number | null;
  mastery: MasteryLevel | null;
  lines: FamilyLineRow[];
};

export type FamilyDomainRow = {
  label: string;
  maxScore: number;
  obtained: number;
  average: number | null;
  mastery: MasteryLevel | null;
  skills: FamilySkillRow[];
};

export type FamilyPeriodStatement = {
  periodId: string;
  periodLabel: string;
  /** Nombre de lignes réellement notées, pour ne pas annoncer un relevé vide. */
  scoredCount: number;
  maxScore: number;
  obtained: number;
  average: number | null;
  mastery: MasteryLevel | null;
  domains: FamilyDomainRow[];
  /** Dernière note saisie, pour l'indicateur de nouveauté. */
  updatedAt: string;
};

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
  return "Relevé indisponible.";
}

/**
 * Construit le relevé période par période.
 *
 * Une période n'apparaît que si l'enfant y a au moins une note. Afficher les
 * six paliers dès la rentrée, tous vides, donnerait à la famille l'impression
 * d'un logiciel en panne plutôt que d'une année qui commence.
 */
export function buildLineStatements(
  domains: readonly ModelDomain[],
  periods: readonly { id: string; label: string; kind: string; sequenceNumber: number | null }[],
  scores: readonly { periodId: string; lineId: string; score: number | null; updatedAt: string }[],
): FamilyPeriodStatement[] {
  const byPeriod = new Map<string, Map<string, { score: number | null; updatedAt: string }>>();
  for (const row of scores) {
    if (!byPeriod.has(row.periodId)) byPeriod.set(row.periodId, new Map());
    byPeriod.get(row.periodId)!.set(row.lineId, {
      score: row.score,
      updatedAt: row.updatedAt,
    });
  }

  const statements: FamilyPeriodStatement[] = [];

  for (const period of periods) {
    const own = byPeriod.get(period.id);
    if (!own || !own.size) continue;

    let scoredCount = 0;
    let lastUpdate = "";

    const domainRows: FamilyDomainRow[] = domains.map((domain) => {
      const skills: FamilySkillRow[] = domain.skills.map((skill) => {
        const lines: FamilyLineRow[] = skill.lines.map((line) => {
          const cell = own.get(line.id);
          if (cell && cell.score !== null) {
            scoredCount += 1;
            if (cell.updatedAt > lastUpdate) lastUpdate = cell.updatedAt;
          }
          return {
            label: line.label,
            maxScore: line.maxScore,
            score: cell?.score ?? null,
          };
        });
        const totals = totalsOf(lines);
        return {
          code: skill.code,
          average: totals.average,
          mastery: masteryLevel(totals.average),
          lines,
        };
      });

      const domainLines = skills.flatMap((skill) => skill.lines);
      const totals = totalsOf(domainLines);
      return {
        label: domain.label,
        maxScore: domainLines.reduce((sum, line) => sum + line.maxScore, 0),
        obtained: totals.obtained,
        average: totals.average,
        mastery: masteryLevel(totals.average),
        skills,
      };
    });

    const allLines = domainRows.flatMap((domain) =>
      domain.skills.flatMap((skill) => skill.lines),
    );
    const totals = totalsOf(allLines);

    statements.push({
      periodId: period.id,
      periodLabel: period.label,
      scoredCount,
      maxScore: allLines.reduce((sum, line) => sum + line.maxScore, 0),
      obtained: totals.obtained,
      average: totals.average,
      mastery: masteryLevel(totals.average),
      domains: domainRows,
      updatedAt: lastUpdate,
    });
  }

  // La période la plus récente en tête : c'est celle que la famille consulte.
  return statements.sort((a, b) => {
    const pa = periods.find((item) => item.id === a.periodId);
    const pb = periods.find((item) => item.id === b.periodId);
    return (
      periodSortRank(pb?.kind || "", pb?.sequenceNumber ?? null) -
      periodSortRank(pa?.kind || "", pa?.sequenceNumber ?? null)
    );
  });
}

/** Lit les notes de l'enfant sur les lignes du bulletin, et les met en forme. */
export async function loadFamilyLineStatements(
  studentId: string,
): Promise<FamilyPeriodStatement[]> {
  if (!studentId) return [];
  const client = createClient();

  const scoreResult = await client
    .from("report_line_scores")
    .select("school_id,period_id,line_id,score,updated_at")
    .eq("student_id", studentId);
  if (scoreResult.error) throw new Error(describe(scoreResult.error));

  const rows = (scoreResult.data || []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];

  const schoolId = String(rows[0].school_id || "");
  const periodIds = Array.from(new Set(rows.map((row) => String(row.period_id))));

  const [domains, periodResult] = await Promise.all([
    loadReportModel(schoolId),
    client
      .from("school_periods")
      .select("id,label,period_kind,sequence_number")
      .in("id", periodIds),
  ]);
  if (periodResult.error) throw new Error(describe(periodResult.error));

  const periods = ((periodResult.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.label || "Période"),
    kind: String(row.period_kind || ""),
    sequenceNumber:
      row.sequence_number === null || row.sequence_number === undefined
        ? null
        : Number(row.sequence_number),
  }));

  return buildLineStatements(
    domains,
    periods,
    rows.map((row) => ({
      periodId: String(row.period_id),
      lineId: String(row.line_id),
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      updatedAt: String(row.updated_at || ""),
    })),
  );
}
