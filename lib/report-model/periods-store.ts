/**
 * Lecture et écriture du découpage de l'année, côté établissement.
 *
 * Comme le modèle de bulletin, ce réglage est lu depuis Supabase et non depuis
 * une copie locale : il décide de la forme des bulletins de toute l'école, et
 * deux personnes qui le modifieraient chacune de son côté produiraient deux
 * découpages incompatibles.
 */

import { createClient } from "@/lib/supabase/client";
import { planPeriods, type PeriodScheme } from "./periods";

export type ReportPeriodSettings = {
  scheme: PeriodScheme;
  paliersPerTerm: number;
};

export type SchoolPeriodRow = {
  id: string;
  label: string;
  kind: string;
  sequenceNumber: number | null;
  parentPeriodId: string | null;
  /** Verrou posé par la direction : la saisie des notes est alors fermée. */
  locked: boolean;
};

const DEFAULTS: ReportPeriodSettings = { scheme: "trimester", paliersPerTerm: 2 };

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
  return "Découpage de l’année indisponible.";
}

export async function loadPeriodSettings(schoolId: string): Promise<ReportPeriodSettings> {
  if (!schoolId || schoolId === "local") return DEFAULTS;
  const { data, error } = await createClient()
    .from("school_report_settings")
    .select("period_scheme,paliers_per_term")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw new Error(describe(error));
  if (!data) return DEFAULTS;
  const row = data as unknown as { period_scheme?: string; paliers_per_term?: number };
  return {
    scheme: row.period_scheme === "palier" ? "palier" : "trimester",
    paliersPerTerm: Number(row.paliers_per_term || 2),
  };
}

export async function savePeriodSettings(
  schoolId: string,
  settings: ReportPeriodSettings,
): Promise<void> {
  const { error } = await createClient()
    .from("school_report_settings")
    .upsert(
      {
        school_id: schoolId,
        period_scheme: settings.scheme,
        paliers_per_term: settings.paliersPerTerm,
      },
      { onConflict: "school_id" },
    );
  if (error) throw new Error(describe(error));
}

/** Les périodes déjà créées pour l'année active. */
export async function loadSchoolPeriods(
  schoolId: string,
  academicYearId: string,
): Promise<SchoolPeriodRow[]> {
  if (!schoolId || !academicYearId) return [];
  const { data, error } = await createClient()
    .from("school_periods")
    .select("id,label,period_kind,sequence_number,parent_period_id,is_locked")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .order("period_kind")
    .order("sequence_number", { nullsFirst: true });
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.label || ""),
    kind: String(row.period_kind || ""),
    sequenceNumber:
      row.sequence_number === null || row.sequence_number === undefined
        ? null
        : Number(row.sequence_number),
    parentPeriodId: row.parent_period_id ? String(row.parent_period_id) : null,
    locked: row.is_locked === true,
  }));
}

/**
 * Pose ou lève le verrou de saisie sur une période.
 *
 * Réservé à la direction par la politique d'écriture de « school_periods » :
 * la fonction n'ouvre aucun droit, elle horodate le geste et en garde
 * l'auteur, pour qu'un enseignant à qui l'on répond « c'est fermé » sache par
 * qui et depuis quand.
 */
export async function setPeriodLock(
  periodId: string,
  locked: boolean,
  reason = "",
): Promise<void> {
  const { error } = await createClient().rpc("set_period_lock", {
    target_period: periodId,
    locked,
    reason: reason || null,
  });
  if (error) throw new Error(describe(error));
}

/**
 * Crée les périodes manquantes pour l'année active.
 *
 * N'écrase rien : une période dont le libellé existe déjà est laissée telle
 * quelle, avec ses dates et ses notes. C'est ce qui permet de basculer en
 * paliers en cours d'année sans perdre les trimestres déjà évalués — les
 * paliers viennent s'ajouter, les trimestres restent.
 */
export async function ensurePeriods(
  schoolId: string,
  academicYearId: string,
  settings: ReportPeriodSettings,
): Promise<{ created: number; total: number }> {
  if (!schoolId || schoolId === "local")
    throw new Error(
      "Aucun établissement actif. Ouvrez Service abonnements, sélectionnez l’établissement, puis revenez.",
    );
  if (!academicYearId)
    throw new Error(
      "Aucune année scolaire active. Ouvrez Établissement pour en déclarer une, puis revenez.",
    );

  const client = createClient();
  const existing = await loadSchoolPeriods(schoolId, academicYearId);
  const known = new Map(existing.map((item) => [item.label, item]));
  const planned = planPeriods(settings.scheme, settings.paliersPerTerm);

  // Les trimestres d'abord : un palier ne peut se rattacher qu'à un trimestre
  // qui existe déjà, et son identifiant n'est connu qu'après l'insertion.
  for (const period of planned.filter((item) => item.kind === "trimester")) {
    if (known.has(period.label)) continue;
    const { data, error } = await client
      .from("school_periods")
      .insert({
        school_id: schoolId,
        academic_year_id: academicYearId,
        label: period.label,
        period_kind: "trimester",
        sequence_number: period.termNumber ?? null,
      })
      .select("id,label,period_kind,sequence_number,parent_period_id,is_locked")
      .single();
    if (error) throw new Error(describe(error));
    known.set(period.label, {
      id: String(data.id),
      label: period.label,
      kind: "trimester",
      sequenceNumber: period.termNumber ?? null,
      parentPeriodId: null,
      locked: false,
    });
  }

  let created = 0;
  for (const period of planned) {
    if (known.has(period.label)) continue;
    const parentLabel =
      period.kind === "palier" && period.termNumber
        ? planned.find(
            (item) => item.kind === "trimester" && item.termNumber === period.termNumber,
          )?.label
        : undefined;
    const parentId = parentLabel ? known.get(parentLabel)?.id || null : null;
    const { error } = await client.from("school_periods").insert({
      school_id: schoolId,
      academic_year_id: academicYearId,
      label: period.label,
      period_kind: period.kind,
      sequence_number: period.palierNumber ?? null,
      parent_period_id: parentId,
    });
    if (error) throw new Error(describe(error));
    known.set(period.label, {
      id: "",
      label: period.label,
      kind: period.kind,
      sequenceNumber: period.palierNumber ?? null,
      parentPeriodId: parentId,
      locked: false,
    });
    created += 1;
  }

  return { created, total: planned.length };
}

/**
 * L'année scolaire en cours pour cet établissement.
 *
 * L'année marquée « courante » fait foi ; à défaut, la plus récente. Le repli
 * évite qu'un établissement qui a oublié de cocher la case se retrouve dans
 * l'impossibilité de créer ses périodes — un oubli de saisie ne doit pas
 * bloquer l'évaluation.
 */
export async function resolveActiveAcademicYear(
  schoolId: string,
): Promise<{ id: string; label: string } | null> {
  if (!schoolId || schoolId === "local") return null;
  const { data, error } = await createClient()
    .from("academic_years")
    .select("id,label,is_current,starts_on")
    .eq("school_id", schoolId)
    .order("is_current", { ascending: false })
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(describe(error));
  if (!data) return null;
  const row = data as unknown as { id?: string; label?: string };
  return { id: String(row.id || ""), label: String(row.label || "") };
}
