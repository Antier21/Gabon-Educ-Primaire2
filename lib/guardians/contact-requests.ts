/**
 * Corrections de coordonnées proposées par les familles, côté établissement.
 *
 * Le responsable ne modifie pas sa fiche : il dépose une demande. Ce module
 * la présente au secrétariat, qui l'applique ou la refuse. L'application
 * elle-même n'a pas lieu ici : elle passe par le module Parents, avec ses
 * contrôles de droits et d'abonnement, pour que la fiche officielle n'ait
 * jamais qu'un seul auteur.
 */

import { createClient } from "@/lib/supabase/client";
import { confirmWrite } from "@/lib/supabase/confirm-write";

export type GuardianContactRequest = {
  id: string;
  guardianId: string;
  phone: string;
  email: string;
  address: string;
  previousPhone: string;
  previousEmail: string;
  previousAddress: string;
  createdAt: string;
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
  return "Lecture des demandes impossible.";
}

/**
 * Ce qui change réellement, en toutes lettres.
 *
 * Le secrétariat valide vite, souvent au guichet. Afficher deux numéros côte
 * à côte l'oblige à comparer chiffre par chiffre ; nommer le champ modifié
 * lui évite ce travail et lui évite surtout de valider une inversion de
 * chiffres sans la voir.
 */
export function describeChange(request: GuardianContactRequest): string[] {
  const lignes: string[] = [];
  if (request.phone !== request.previousPhone)
    lignes.push(
      `Téléphone : ${request.previousPhone || "aucun"} → ${request.phone}`,
    );
  if ((request.email || "") !== (request.previousEmail || ""))
    lignes.push(
      `Courriel : ${request.previousEmail || "aucun"} → ${request.email || "aucun"}`,
    );
  if ((request.address || "") !== (request.previousAddress || ""))
    lignes.push(
      `Adresse : ${request.previousAddress || "aucune"} → ${request.address || "aucune"}`,
    );
  return lignes;
}

/** Les demandes en attente pour cet établissement, la plus ancienne d'abord. */
export async function loadPendingContactRequests(
  schoolId: string,
): Promise<GuardianContactRequest[]> {
  if (!schoolId || schoolId === "local") return [];
  const { data, error } = await createClient()
    .from("guardian_contact_requests")
    .select(
      "id,guardian_id,phone,email,address,previous_phone,previous_email,previous_address,created_at",
    )
    .eq("school_id", schoolId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw new Error(describe(error));
  return ((data || []) as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    guardianId: String(row.guardian_id || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    address: String(row.address || ""),
    previousPhone: String(row.previous_phone || ""),
    previousEmail: String(row.previous_email || ""),
    previousAddress: String(row.previous_address || ""),
    createdAt: String(row.created_at || ""),
  }));
}

/**
 * Clôt une demande.
 *
 * À n'appeler qu'après que la fiche a réellement été enregistrée : marquer
 * « appliquée » une demande dont l'enregistrement a échoué ferait disparaître
 * de l'écran une correction qui n'a jamais eu lieu.
 */
export async function closeContactRequest(
  id: string,
  decision: "applied" | "rejected",
): Promise<void> {
  const client = createClient();
  const { data: auth } = await client.auth.getUser();
  const result = await client
    .from("guardian_contact_requests")
    .update({
      status: decision,
      reviewed_by: auth.user?.id || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id");
  confirmWrite(
    result,
    decision === "applied"
      ? "la validation de cette demande de coordonnées"
      : "le refus de cette demande de coordonnées",
  );
}
