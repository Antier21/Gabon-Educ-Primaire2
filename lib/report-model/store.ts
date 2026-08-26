/**
 * Lecture et écriture du modèle de bulletin d'un établissement.
 *
 * Le modèle est lu depuis Supabase, jamais depuis une copie locale. C'est un
 * choix délibéré, et il tranche avec le reste de la plateforme : ce que
 * l'établissement compose ici décide de la forme du bulletin de tous ses
 * élèves, et deux personnes qui le modifieraient chacune sur sa copie
 * produiraient deux bulletins différents dans la même école. La leçon avait
 * déjà été payée sur le fichier des responsables.
 */

import { createClient } from "@/lib/supabase/client";
import { OFFICIAL_REPORT_MODEL } from "./official-model";
import { confirmWrite } from "@/lib/supabase/confirm-write";

export type ModelLine = {
  id: string;
  skillId: string;
  label: string;
  maxScore: number;
  position: number;
  active: boolean;
};

export type ModelSkill = {
  id: string;
  domainId: string;
  code: string;
  label: string;
  position: number;
  lines: ModelLine[];
};

export type ModelDomain = {
  id: string;
  label: string;
  shortLabel: string;
  position: number;
  active: boolean;
  skills: ModelSkill[];
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
  return "Modèle de bulletin indisponible.";
}

/** Le modèle complet, domaines → compétences → lignes, dans l'ordre du bulletin. */
export async function loadReportModel(schoolId: string): Promise<ModelDomain[]> {
  if (!schoolId || schoolId === "local") return [];
  const client = createClient();
  const [domains, skills, lines] = await Promise.all([
    client
      .from("report_model_domains")
      .select("id,label,short_label,position,is_active")
      .eq("school_id", schoolId)
      .order("position"),
    client
      .from("report_model_skills")
      .select("id,domain_id,code,label,position")
      .eq("school_id", schoolId)
      .order("position"),
    client
      .from("report_model_lines")
      .select("id,skill_id,label,max_score,position,is_active")
      .eq("school_id", schoolId)
      .order("position"),
  ]);
  for (const result of [domains, skills, lines]) {
    if (result.error) throw new Error(describe(result.error));
  }

  const lineRows = ((lines.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    skillId: String(row.skill_id || ""),
    label: String(row.label || ""),
    maxScore: Number(row.max_score || 0),
    position: Number(row.position || 0),
    active: row.is_active !== false,
  }));

  const skillRows = ((skills.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    domainId: String(row.domain_id || ""),
    code: String(row.code || ""),
    label: String(row.label || ""),
    position: Number(row.position || 0),
    lines: lineRows
      .filter((line) => line.skillId === String(row.id))
      .sort((a, b) => a.position - b.position),
  }));

  return ((domains.data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.label || ""),
    shortLabel: String(row.short_label || ""),
    position: Number(row.position || 0),
    active: row.is_active !== false,
    skills: skillRows
      .filter((skill) => skill.domainId === String(row.id))
      .sort((a, b) => a.position - b.position),
  }));
}

/**
 * Installe la structure officielle dans un établissement qui n'en a pas.
 *
 * Refuse d'écrire si un modèle existe déjà : réamorcer par mégarde
 * remplacerait le découpage qu'un établissement a mis une heure à composer, et
 * les notes déjà saisies pointeraient sur des lignes disparues.
 */
export async function seedOfficialModel(schoolId: string): Promise<ModelDomain[]> {
  if (!schoolId || schoolId === "local")
    throw new Error(
      "Aucun établissement actif. Ouvrez Service abonnements, sélectionnez l’établissement, puis revenez.",
    );
  const client = createClient();
  const existing = await loadReportModel(schoolId);
  if (existing.length)
    throw new Error(
      "Ce modèle contient déjà des domaines. Supprimez-les avant de réinstaller la structure officielle.",
    );

  for (const [domainIndex, domain] of OFFICIAL_REPORT_MODEL.entries()) {
    const created = await client
      .from("report_model_domains")
      .insert({
        school_id: schoolId,
        label: domain.label,
        short_label: domain.shortLabel,
        position: domainIndex,
      })
      .select("id")
      .single();
    if (created.error) throw new Error(describe(created.error));
    const domainId = String(created.data.id);

    // Les compétences sont déduites des lignes : elles n'existent que parce
    // que des lignes s'y rattachent, et l'ordre suit la première apparition
    // sur le bulletin papier.
    const codes: string[] = [];
    for (const line of domain.lines) if (!codes.includes(line.skill)) codes.push(line.skill);

    for (const [skillIndex, code] of codes.entries()) {
      const skill = await client
        .from("report_model_skills")
        .insert({ school_id: schoolId, domain_id: domainId, code, position: skillIndex })
        .select("id")
        .single();
      if (skill.error) throw new Error(describe(skill.error));
      const skillId = String(skill.data.id);

      const rows = domain.lines
        .filter((line) => line.skill === code)
        .map((line, index) => ({
          school_id: schoolId,
          skill_id: skillId,
          label: line.label,
          max_score: line.maxScore,
          position: index,
        }));
      const inserted = await client.from("report_model_lines").insert(rows);
      if (inserted.error) throw new Error(describe(inserted.error));
    }
  }

  return loadReportModel(schoolId);
}

export async function saveLine(
  line: { id: string; label: string; maxScore: number },
): Promise<void> {
  const result = await createClient()
    .from("report_model_lines")
    .update({ label: line.label, max_score: line.maxScore })
    .eq("id", line.id)
    .select("id");
  confirmWrite(result, "la modification de cette ligne du bulletin");
}

export async function addLine(
  schoolId: string,
  skillId: string,
  label: string,
  maxScore: number,
  position: number,
): Promise<void> {
  const { error } = await createClient().from("report_model_lines").insert({
    school_id: schoolId,
    skill_id: skillId,
    label,
    max_score: maxScore,
    position,
  });
  if (error) throw new Error(describe(error));
}

export async function removeLine(id: string): Promise<void> {
  const result = await createClient()
    .from("report_model_lines")
    .delete()
    .eq("id", id)
    .select("id");
  confirmWrite(result, "la suppression de cette ligne du bulletin");
}

export async function addDomain(
  schoolId: string,
  label: string,
  shortLabel: string,
  position: number,
): Promise<string> {
  const { data, error } = await createClient()
    .from("report_model_domains")
    .insert({ school_id: schoolId, label, short_label: shortLabel || label, position })
    .select("id")
    .single();
  if (error) throw new Error(describe(error));
  return String(data.id);
}

export async function addSkill(
  schoolId: string,
  domainId: string,
  code: string,
  position: number,
): Promise<void> {
  const { error } = await createClient()
    .from("report_model_skills")
    .insert({ school_id: schoolId, domain_id: domainId, code, position });
  if (error) throw new Error(describe(error));
}

/**
 * Supprime un domaine entier.
 *
 * Les compétences et les lignes tombent avec lui, par cascade. C'est
 * irréversible et cela peut effacer beaucoup de travail : l'écran demande
 * confirmation en nommant le domaine.
 */
export async function removeDomain(id: string): Promise<void> {
  const result = await createClient()
    .from("report_model_domains")
    .delete()
    .eq("id", id)
    .select("id");
  confirmWrite(result, "la suppression de ce domaine du bulletin");
}
