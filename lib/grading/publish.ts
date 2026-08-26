"use client";

import { createClient } from "@/lib/supabase/client";
import { readCachedActiveSchool } from "@/lib/active-school";
import type { GradingPeriod, ReportSnapshot, SchoolSettings } from "./types";
import { confirmDeletedByReadBack } from "@/lib/supabase/confirm-write";

/**
 * Publication d'un bulletin vers les tables de l'établissement.
 *
 * Jusqu'ici, un bulletin restait enfermé dans l'espace de son enseignant : un
 * unique bloc de données dans grading_workspaces, que lui seul pouvait lire.
 * L'espace famille interrogeait report_cards, qui n'était jamais alimentée.
 *
 * Publier consiste donc à recopier le bulletin figé — le snapshot — dans les
 * trois tables partagées que les familles peuvent lire : l'en-tête, les
 * matières, les appréciations. C'est une copie, et c'est voulu : les notes
 * continuent de vivre dans l'espace de l'enseignant, qui reste libre de les
 * reprendre tant qu'il n'a pas publié.
 *
 * Rien n'est mis dans la file de synchronisation. Une publication est un acte
 * de direction : elle réussit et la famille voit le bulletin, ou elle échoue
 * et on le dit. Laisser une publication en attente à l'insu du chef
 * d'établissement serait le pire des deux mondes.
 */

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicationResult = { published: boolean; message: string };

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as Record<string, unknown>;
    return String(raw.message || raw.details || raw.hint || JSON.stringify(raw));
  }
  return "Publication impossible.";
}

/** Les mentions acceptées par la contrainte de report_card_comments. */
const ALLOWED_MENTIONS = new Set([
  "Encouragements",
  "Tableau d’honneur",
  "Félicitations",
  "Avertissement travail",
  "Avertissement conduite",
]);

function numberOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * La période doit exister en base avant le bulletin, qui la référence par une
 * clé étrangère. Or les périodes ne vivent que dans l'espace de travail local,
 * et elles y portent des identifiants lisibles — « period-t1 », « period-t2 »
 * — et non des UUID. Vouloir réutiliser cet identifiant comme clé primaire
 * était une erreur : la colonne est de type uuid, et la publication échouait
 * avant même d'essayer d'écrire. Le relevé de notes, lui, référence sa période
 * par un texte libre : c'est pourquoi il fonctionnait quand le bulletin non.
 *
 * On retrouve donc la période par sa clé métier — enseignant, année, libellé —
 * et on la crée en laissant la base attribuer son identifiant.
 */
async function ensurePeriod(
  client: ReturnType<typeof createClient>,
  snapshot: ReportSnapshot,
  period: GradingPeriod | undefined,
  settings: SchoolSettings,
  userId: string,
  schoolId: string | null,
) {
  const label = (period?.label || snapshot.periodLabel || "Période").trim();
  const yearLabel = (settings.academicYear || snapshot.academicYear || "").trim() || "Année en cours";

  const existing = await client
    .from("grading_periods")
    .select("id")
    .eq("owner_teacher_id", userId)
    .eq("academic_year_label", yearLabel)
    .eq("label", label)
    .maybeSingle();
  if (existing.data?.id) return String(existing.data.id);

  const startsOn = period?.startsOn || `${new Date().getFullYear()}-01-01`;
  const endsOn = period?.endsOn || `${new Date().getFullYear()}-12-31`;
  const { data, error } = await client
    .from("grading_periods")
    .insert({
      owner_teacher_id: userId,
      school_id: schoolId,
      academic_year_label: yearLabel,
      label,
      period_kind: settings.periodKind === "semester" ? "semester" : "trimester",
      starts_on: startsOn,
      ends_on: endsOn,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !data?.id)
    throw new Error(`Période « ${label} » non enregistrée : ${describe(error)}`);
  return String(data.id);
}

export async function publishReportCard(
  snapshot: ReportSnapshot,
  period: GradingPeriod | undefined,
  settings: SchoolSettings,
  /** Client de remplacement, utilisé par les tests. */
  clientOverride?: ReturnType<typeof createClient>,
): Promise<PublicationResult> {
  const client = clientOverride || createClient();
  const { data: auth } = await client.auth.getUser();
  const userId = auth.user?.id || "";
  if (!userId)
    return { published: false, message: "Session expirée : reconnectez-vous avant de publier." };

  if (!uuidPattern.test(snapshot.studentId))
    return {
      published: false,
      message:
        "Cet élève n’a pas encore d’identifiant cloud : son dossier n’est pas synchronisé avec l’établissement.",
    };
  if (!uuidPattern.test(snapshot.classId))
    return {
      published: false,
      message: "Cette classe n’a pas encore d’identifiant cloud.",
    };

  const schoolId = readCachedActiveSchool()?.id || null;

  try {
    const periodId = await ensurePeriod(client, snapshot, period, settings, userId, schoolId);

    // La contrainte d'unicité porte sur (élève, période) : republier un
    // bulletin corrigé remplace le précédent au lieu d'en créer un second.
    const header = await client
      .from("report_cards")
      .upsert(
        {
          owner_teacher_id: userId,
          class_group_id: snapshot.classId,
          class_student_id: snapshot.studentId,
          grading_period_id: periodId,
          report_status: "published",
          general_average: numberOrNull(snapshot.generalAverage),
          general_rank: numberOrNull(snapshot.generalRank),
          class_average: numberOrNull(snapshot.classAverage),
          snapshot,
          validated_by: userId,
          validated_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
        },
        { onConflict: "class_student_id,grading_period_id" },
      )
      .select("id")
      .single();
    if (header.error) throw header.error;
    const reportId = String(header.data.id);

    // Les matières sont remplacées en bloc : une matière retirée du bulletin
    // ne doit pas survivre dans la copie remise à la famille.
    const removal = await client
      .from("report_card_subjects")
      .delete()
      .eq("report_card_id", reportId);
    if (removal.error) throw removal.error;
    // Un bulletin encore sans matières en supprime zéro : c'est normal. Seule
    // la relecture peut distinguer ce cas d'un refus silencieux.
    await confirmDeletedByReadBack(
      () => client.from("report_card_subjects").select("id").eq("report_card_id", reportId),
      "le remplacement des matières de ce bulletin",
    );

    const rows = snapshot.subjects
      .filter((subject) => subject.subject && subject.coefficient > 0)
      .map((subject) => ({
        report_card_id: reportId,
        subject_name: subject.subject,
        average_value: numberOrNull(subject.average),
        coefficient: subject.coefficient,
        weighted_value: numberOrNull(subject.weighted),
        class_average: numberOrNull(subject.classAverage),
        subject_rank: numberOrNull(subject.rank),
        assessment_count: subject.assessmentCount || 0,
        appreciation: subject.comment || null,
      }));
    if (rows.length) {
      const subjects = await client.from("report_card_subjects").insert(rows);
      if (subjects.error) throw subjects.error;
    }

    const mention = ALLOWED_MENTIONS.has(snapshot.comments.mention)
      ? snapshot.comments.mention
      : null;
    const comments = await client.from("report_card_comments").upsert(
      {
        report_card_id: reportId,
        general_comment: snapshot.comments.general || null,
        work_comment: snapshot.comments.work || null,
        conduct_comment: snapshot.comments.conduct || null,
        council_decision: snapshot.comments.decision || null,
        mention,
        absence_count: Math.max(0, snapshot.attendance.absences || 0),
        late_count: Math.max(0, snapshot.attendance.lateCount || 0),
        prepared_by: userId,
      },
      { onConflict: "report_card_id" },
    );
    if (comments.error) throw comments.error;

    return {
      published: true,
      message: `Bulletin publié : ${snapshot.studentName} peut le consulter dans l’espace famille.`,
    };
  } catch (error) {
    console.error("[Gabon Éduc+] Publication du bulletin refusée :", error, snapshot.studentId);
    return { published: false, message: `Publication impossible : ${describe(error)}` };
  }
}
