/**
 * Publication des bulletins aux familles.
 *
 * Le relevé de notes arrive en continu ; le bulletin, lui, n'apparaît qu'une
 * fois publié. C'est un acte de l'établissement, décidé par la direction, et
 * non une conséquence de la saisie.
 *
 * La publication porte sur une classe et une période entières : remettre son
 * bulletin à un enfant et pas à son voisin ne se fait pas.
 */

import { createClient } from "@/lib/supabase/client";
import { confirmWrite } from "@/lib/supabase/confirm-write";

export type ReportPublication = {
  classId: string;
  periodId: string;
  publishedAt: string;
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
  return "Publication indisponible.";
}

/** Vrai si le bulletin de cette classe et de cette période est déjà remis. */
export function isPublished(
  publications: readonly ReportPublication[],
  classId: string,
  periodId: string,
): boolean {
  return publications.some(
    (item) => item.classId === classId && item.periodId === periodId,
  );
}

export async function loadPublications(schoolId: string): Promise<ReportPublication[]> {
  if (!schoolId || schoolId === "local") return [];
  const { data, error } = await createClient()
    .from("report_publications")
    .select("class_group_id,period_id,published_at")
    .eq("school_id", schoolId);
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    classId: String(row.class_group_id || ""),
    periodId: String(row.period_id || ""),
    publishedAt: String(row.published_at || ""),
  }));
}

/** Les périodes dont le bulletin est publié pour la classe d'un élève. */
export async function loadPublishedPeriodsForStudent(
  classId: string,
): Promise<string[]> {
  if (!classId) return [];
  const { data, error } = await createClient()
    .from("report_publications")
    .select("period_id")
    .eq("class_group_id", classId);
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map((row) =>
    String(row.period_id || ""),
  );
}

export async function publishReports(
  schoolId: string,
  classId: string,
  periodId: string,
): Promise<void> {
  const client = createClient();
  const { data: auth } = await client.auth.getUser();
  const { error } = await client.from("report_publications").upsert(
    {
      school_id: schoolId,
      class_group_id: classId,
      period_id: periodId,
      published_by: auth.user?.id || null,
      published_at: new Date().toISOString(),
    },
    { onConflict: "class_group_id,period_id" },
  );
  if (error) throw new Error(describe(error));
}

/**
 * Retire le bulletin de l'espace des familles.
 *
 * Sert à corriger une publication faite trop tôt. La suppression de la ligne
 * suffit : aucune note n'est touchée, seul l'affichage du document change.
 */
export async function unpublishReports(classId: string, periodId: string): Promise<void> {
  /*
   * C'est ici que le silence coûterait le plus cher.
   *
   * Une direction qui retire un bulletin publié par erreur, voit « c'est
   * fait », et laisse le document visible aux familles : la panne serait
   * invisible des deux côtés jusqu'à ce qu'un parent en parle. La ligne
   * supprimée est donc redemandée, et son absence vaut refus.
   */
  const result = await createClient()
    .from("report_publications")
    .delete()
    .eq("class_group_id", classId)
    .eq("period_id", periodId)
    .select("id");
  confirmWrite(result, "le retrait de cette publication");
}
