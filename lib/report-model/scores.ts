/**
 * Les notes posées sur les lignes du bulletin.
 *
 * Une note appartient à trois choses à la fois : un élève, une période, une
 * ligne du modèle. C'est ce triplet qui permet au bulletin de se calculer
 * seul, là où le cahier de notes actuel ne connaît que des noms de matières
 * saisis au clavier.
 */

import { createClient } from "@/lib/supabase/client";
import { confirmDeletedByReadBack } from "@/lib/supabase/confirm-write";

/** Clé de la grille : « élève:ligne ». */
export function cellKey(studentId: string, lineId: string) {
  return `${studentId}:${lineId}`;
}

export type ScoreGrid = Record<string, number | null>;

export type ClassPupil = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
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
  return "Notes indisponibles.";
}

/** Les élèves actifs d'une classe, dans l'ordre alphabétique du cahier d'appel. */
export async function loadClassPupils(classId: string): Promise<ClassPupil[]> {
  if (!classId) return [];
  const { data, error } = await createClient()
    .from("student_records")
    .select("id,first_name,last_name,status")
    .eq("class_group_id", classId)
    .neq("status", "archived")
    .order("last_name")
    .order("first_name");
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    firstName: String(row.first_name || ""),
    lastName: String(row.last_name || ""),
    fullName: `${row.last_name || ""} ${row.first_name || ""}`.trim(),
  }));
}

/** Toutes les notes déjà saisies pour cette classe et cette période. */
export async function loadScoreGrid(
  studentIds: readonly string[],
  periodId: string,
): Promise<ScoreGrid> {
  if (!studentIds.length || !periodId) return {};
  const { data, error } = await createClient()
    .from("report_line_scores")
    .select("student_id,line_id,score")
    .in("student_id", [...studentIds])
    .eq("period_id", periodId);
  if (error) throw new Error(describe(error));
  const grid: ScoreGrid = {};
  for (const row of (data || []) as Array<Record<string, unknown>>) {
    grid[cellKey(String(row.student_id), String(row.line_id))] =
      row.score === null || row.score === undefined ? null : Number(row.score);
  }
  return grid;
}

/**
 * Enregistre une note, ou l'efface.
 *
 * Effacer supprime la ligne plutôt que d'y écrire zéro : c'est la seule façon
 * de rendre la case à l'état « non évaluée », et donc de la sortir du calcul.
 * Un enseignant qui corrige une saisie erronée doit pouvoir revenir en arrière
 * sans que l'élève garde un zéro qu'il n'a jamais eu.
 */
export async function saveScore(args: {
  schoolId: string;
  studentId: string;
  periodId: string;
  lineId: string;
  score: number | null;
}): Promise<void> {
  const client = createClient();
  if (args.score === null) {
    /*
     * Ici, « zéro ligne supprimée » est un cas normal : effacer une case déjà
     * vide ne touche rien. Compter les lignes produirait donc une fausse
     * alerte à chaque case vide — et une fausse alerte est pire qu'un silence,
     * car on cesse de croire les messages.
     *
     * On relit donc après coup. Si la note est toujours là, la suppression a
     * été refusée, et c'est certain.
     */
    const { error } = await client
      .from("report_line_scores")
      .delete()
      .eq("student_id", args.studentId)
      .eq("period_id", args.periodId)
      .eq("line_id", args.lineId);
    if (error) throw new Error(describe(error));
    await confirmDeletedByReadBack(
      () =>
        client
          .from("report_line_scores")
          .select("student_id")
          .eq("student_id", args.studentId)
          .eq("period_id", args.periodId)
          .eq("line_id", args.lineId),
      "l’effacement de cette note",
    );
    return;
  }
  const { data: auth } = await client.auth.getUser();
  const { error } = await client.from("report_line_scores").upsert(
    {
      school_id: args.schoolId,
      student_id: args.studentId,
      period_id: args.periodId,
      line_id: args.lineId,
      score: args.score,
      entered_by: auth.user?.id || null,
    },
    { onConflict: "student_id,period_id,line_id" },
  );
  if (error) throw new Error(describe(error));
}

/**
 * Interprète ce que l'enseignant a tapé.
 *
 * Une case vide veut dire « non évaluée », pas « zéro ». La virgule décimale
 * est acceptée : on écrit 8,5 au Gabon, pas 8.5, et refuser cette saisie
 * ferait perdre du temps à chaque note.
 */
export function parseScoreInput(raw: string): { value: number | null; error: string } {
  const texte = String(raw || "").trim();
  if (!texte) return { value: null, error: "" };
  const nombre = Number(texte.replace(",", "."));
  if (!Number.isFinite(nombre)) return { value: null, error: "Note illisible." };
  if (nombre < 0) return { value: null, error: "Une note ne peut pas être négative." };
  return { value: nombre, error: "" };
}
