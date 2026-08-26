"use client";

import { createClient } from "@/lib/supabase/client";
import { mergeMessage, isPhoneUsable, type MessageVariables } from "./whatsapp";
import { confirmWrite } from "@/lib/supabase/confirm-write";

/**
 * Écritures directes vers Supabase, sans file d'attente.
 *
 * Le module Communication ne passe volontairement pas par la file de
 * synchronisation : un message aux parents est soit parti, soit non — il ne
 * doit jamais rester en attente à l'insu de l'établissement. Chaque erreur est
 * remontée telle quelle à l'appelant.
 */

export type AudienceKind = "class" | "level" | "students";

export type CampaignTarget = {
  kind: AudienceKind;
  classId?: string;
  levelCode?: string;
  studentIds?: string[];
};

export type RecipientDraft = {
  guardianId: string;
  studentId: string;
  guardianName: string;
  studentName: string;
  className: string;
  phone: string;
  relationship: string;
  contactAllowed: boolean;
  phoneUsable: boolean;
};

export type MessageTemplate = {
  id: string;
  name: string;
  category: string;
  body: string;
};

/** Par quel canal le parent a réellement été joint. Vide tant qu'il ne l'est pas. */
export type SentChannel = "whatsapp" | "sms" | "manual" | "group" | "";

export type CampaignRecipient = RecipientDraft & {
  id: string;
  resolvedBody: string;
  status: "pending" | "sent" | "failed" | "skipped";
  failureReason: string;
  sentAt: string;
  sentChannel: SentChannel;
};

export type Campaign = {
  id: string;
  title: string;
  body: string;
  audienceKind: AudienceKind;
  className: string;
  levelCode: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  createdAt: string;
};

function describe(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [raw.message, raw.details]
      .map((value) => (typeof value === "string" ? value : ""))
      .filter(Boolean);
    const code = typeof raw.code === "string" ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "Erreur inattendue.";
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  father: "Père",
  mother: "Mère",
  guardian: "Tuteur",
  legal_guardian: "Tuteur légal",
  other: "Contact",
};

export function relationshipLabel(value: string) {
  return RELATIONSHIP_LABELS[value] || "Contact";
}

export async function listTemplates(schoolId: string): Promise<MessageTemplate[]> {
  const { data, error } = await createClient()
    .from("message_templates")
    .select("id,name,category,body")
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(describe(error));
  return (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    category: String(row.category || "general"),
    body: String(row.body || ""),
  }));
}

export async function saveTemplate(
  schoolId: string,
  input: { id?: string; name: string; category: string; body: string },
): Promise<void> {
  const { error } = await createClient()
    .from("message_templates")
    .upsert(
      {
        ...(input.id ? { id: input.id } : {}),
        school_id: schoolId,
        name: input.name.trim(),
        category: input.category,
        body: input.body,
        is_active: true,
      },
      { onConflict: "school_id,name" },
    );
  if (error) throw new Error(describe(error));
}

/**
 * Constitue la liste des parents à contacter.
 *
 * Un élève peut avoir plusieurs responsables ; chacun reçoit le message, sauf
 * si son contact a été explicitement refusé. Le tri place les contacts
 * principaux en tête.
 */
export async function resolveRecipients(
  schoolId: string,
  target: CampaignTarget,
): Promise<RecipientDraft[]> {
  const client = createClient();

  let studentQuery = client
    .from("student_records")
    .select("id,first_name,last_name,class_group_id,status,class_groups(name,grade_levels(code))")
    .eq("school_id", schoolId)
    .eq("status", "active");

  if (target.kind === "class") {
    if (!target.classId) return [];
    studentQuery = studentQuery.eq("class_group_id", target.classId);
  } else if (target.kind === "students") {
    if (!target.studentIds?.length) return [];
    studentQuery = studentQuery.in("id", target.studentIds);
  }

  const students = await studentQuery;
  if (students.error) throw new Error(describe(students.error));

  type StudentRow = {
    id: string;
    first_name: string;
    last_name: string;
    class_groups?: { name?: string; grade_levels?: { code?: string } | null } | null;
  };
  let rows = (students.data || []) as unknown as StudentRow[];

  // Le niveau n'est pas porté par l'élève mais par sa classe : on filtre après lecture.
  if (target.kind === "level") {
    const wanted = String(target.levelCode || "").toLocaleLowerCase("fr");
    if (!wanted) return [];
    rows = rows.filter(
      (row) => String(row.class_groups?.grade_levels?.code || "").toLocaleLowerCase("fr") === wanted,
    );
  }
  if (!rows.length) return [];

  const byStudent = new Map(rows.map((row) => [String(row.id), row]));
  const links = await client
    .from("guardian_student_links")
    .select("student_id,relationship,is_primary,guardians(id,first_name,last_name,phone,contact_allowed,status)")
    .eq("school_id", schoolId)
    .in("student_id", [...byStudent.keys()]);
  if (links.error) throw new Error(describe(links.error));

  type LinkRow = {
    student_id: string;
    relationship: string;
    is_primary: boolean;
    guardians?: {
      id?: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      contact_allowed?: boolean;
      status?: string;
    } | null;
  };

  const drafts: RecipientDraft[] = [];
  for (const link of (links.data || []) as unknown as LinkRow[]) {
    const guardian = link.guardians;
    if (!guardian?.id || guardian.status === "archived") continue;
    const student = byStudent.get(String(link.student_id));
    if (!student) continue;
    const phone = String(guardian.phone || "");
    drafts.push({
      guardianId: String(guardian.id),
      studentId: String(student.id),
      guardianName: `${guardian.last_name || ""} ${guardian.first_name || ""}`.trim() || "Responsable",
      studentName: `${student.last_name || ""} ${student.first_name || ""}`.trim(),
      className: String(student.class_groups?.name || ""),
      phone,
      relationship: String(link.relationship || "other"),
      contactAllowed: guardian.contact_allowed !== false,
      phoneUsable: isPhoneUsable(phone),
    });
  }

  return drafts.sort((a, b) =>
    `${a.className}${a.studentName}${a.guardianName}`.localeCompare(
      `${b.className}${b.studentName}${b.guardianName}`,
      "fr",
    ),
  );
}

/** Message tel que ce parent le recevra, variables remplacées. */
export function resolveBodyFor(
  body: string,
  recipient: RecipientDraft,
  schoolName: string,
): string {
  const variables: MessageVariables = {
    parent: recipient.guardianName,
    eleve: recipient.studentName,
    classe: recipient.className,
    etablissement: schoolName,
  };
  return mergeMessage(body, variables);
}

export async function createCampaign(input: {
  schoolId: string;
  schoolName: string;
  title: string;
  body: string;
  target: CampaignTarget;
  recipients: RecipientDraft[];
  publishToParentSpace: boolean;
}): Promise<string> {
  const client = createClient();
  const { data: auth } = await client.auth.getUser();

  const campaign = await client
    .from("message_campaigns")
    .insert({
      school_id: input.schoolId,
      title: input.title.trim(),
      body: input.body,
      channel: "whatsapp",
      audience_kind: input.target.kind,
      class_group_id: input.target.kind === "class" ? input.target.classId || null : null,
      level_code: input.target.kind === "level" ? input.target.levelCode || null : null,
      status: "sending",
      publish_to_parent_space: input.publishToParentSpace,
      recipient_count: input.recipients.length,
      sent_count: 0,
      created_by: auth.user?.id || null,
    })
    .select("id")
    .single();
  if (campaign.error) throw new Error(describe(campaign.error));

  const campaignId = String(campaign.data.id);
  const rows = input.recipients.map((recipient) => ({
    campaign_id: campaignId,
    school_id: input.schoolId,
    guardian_id: recipient.guardianId,
    student_id: recipient.studentId,
    guardian_name: recipient.guardianName,
    student_name: recipient.studentName,
    class_name: recipient.className,
    phone: recipient.phone,
    resolved_body: resolveBodyFor(input.body, recipient, input.schoolName),
    status: recipient.phoneUsable && recipient.contactAllowed ? "pending" : "skipped",
    failure_reason: !recipient.contactAllowed
      ? "Ce responsable a refusé d'être contacté."
      : !recipient.phoneUsable
        ? "Numéro de téléphone inutilisable."
        : null,
  }));

  const inserted = await client.from("message_recipients").insert(rows);
  if (inserted.error) {
    // La campagne sans destinataires n'a aucun sens : on ne laisse pas de trace
    // partielle qui laisserait croire à un envoi en cours.
    await client.from("message_campaigns").delete().eq("id", campaignId);
    // Si le nettoyage échoue lui aussi, la campagne reste en base sans
    // destinataires : on le dit dans le même message plutôt que de le taire,
    // sans masquer l'erreur d'origine qui reste la cause.
    const leftover = await client
      .from("message_campaigns")
      .select("id")
      .eq("id", campaignId);
    const orpheline = !leftover.error && (leftover.data || []).length > 0;
    throw new Error(
      describe(inserted.error) +
        (orpheline
          ? " — la campagne vide n’a pas pu être retirée du serveur ; signalez-la à la direction."
          : ""),
    );
  }
  return campaignId;
}

export async function listCampaignRecipients(campaignId: string): Promise<CampaignRecipient[]> {
  const { data, error } = await createClient()
    .from("message_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("class_name")
    .order("student_name");
  if (error) throw new Error(describe(error));
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    guardianId: String(row.guardian_id || ""),
    studentId: String(row.student_id || ""),
    guardianName: String(row.guardian_name || ""),
    studentName: String(row.student_name || ""),
    className: String(row.class_name || ""),
    phone: String(row.phone || ""),
    relationship: "other",
    contactAllowed: true,
    phoneUsable: isPhoneUsable(String(row.phone || "")),
    resolvedBody: String(row.resolved_body || ""),
    status: String(row.status || "pending") as CampaignRecipient["status"],
    failureReason: String(row.failure_reason || ""),
    sentAt: String(row.sent_at || ""),
    sentChannel: String(row.sent_channel || "") as SentChannel,
  }));
}

/**
 * Le canal à inscrire en base pour un état donné.
 *
 * Deux règles, et chacune répare une confusion possible : un envoi dont le
 * canal n'est pas déclaré est un envoi fait à la main, et non un envoi sans
 * canal ; une ligne remise en attente doit oublier par quoi on avait cru la
 * joindre, sans quoi elle garderait la trace d'un envoi qui n'a pas eu lieu.
 */
export function channelToStore(
  status: "sent" | "failed" | "pending" | "skipped",
  channel: SentChannel,
): SentChannel | null {
  if (status !== "sent") return null;
  return channel || "manual";
}

export async function markRecipient(
  recipientId: string,
  status: "sent" | "failed" | "pending" | "skipped",
  failureReason = "",
  channel: SentChannel = "",
): Promise<void> {
  const result = await createClient()
    .from("message_recipients")
    .update({
      status,
      failure_reason: failureReason || null,
      sent_at: status === "sent" ? new Date().toISOString() : null,
      sent_channel: channelToStore(status, channel),
    })
    .eq("id", recipientId)
    .select("id");
  confirmWrite(result, "la mise à jour de ce destinataire");
}

/**
 * Marque d'un coup tous les parents encore en attente.
 *
 * Employé pour l'envoi au groupe de la classe : le message part une fois, et
 * il atteint toutes les familles à la fois. Les laisser « en attente »
 * ligne par ligne laisserait croire à un travail inachevé, et le secrétariat
 * les relancerait une seconde fois par WhatsApp.
 */
export async function markAllPending(
  campaignId: string,
  channel: SentChannel,
  failureReason = "",
): Promise<number> {
  const result = await createClient()
    .from("message_recipients")
    .update({
      status: "sent",
      failure_reason: failureReason || null,
      sent_at: new Date().toISOString(),
      sent_channel: channelToStore("sent", channel),
    })
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .select("id");
  return confirmWrite(result, "l’enregistrement de l’envoi au groupe de la classe").length;
}

/** Recalcule l'avancement d'une campagne à partir de l'état réel de ses lignes. */
export async function refreshCampaignProgress(campaignId: string): Promise<void> {
  const client = createClient();
  const { data, error } = await client
    .from("message_recipients")
    .select("status")
    .eq("campaign_id", campaignId);
  if (error) throw new Error(describe(error));
  const statuses = (data || []).map((row) => String(row.status));
  const sent = statuses.filter((value) => value === "sent").length;
  const remaining = statuses.filter((value) => value === "pending").length;
  const progress = await client
    .from("message_campaigns")
    .update({ sent_count: sent, status: remaining ? "sending" : "sent" })
    .eq("id", campaignId)
    .select("id");
  confirmWrite(progress, "la mise à jour de l’avancement de cette campagne");
}

export async function listCampaigns(schoolId: string): Promise<Campaign[]> {
  const { data, error } = await createClient()
    .from("message_campaigns")
    .select("id,title,body,audience_kind,level_code,status,recipient_count,sent_count,created_at,class_groups(name)")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(describe(error));
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    title: String(row.title || ""),
    body: String(row.body || ""),
    audienceKind: String(row.audience_kind || "class") as AudienceKind,
    className: String((row.class_groups as { name?: string } | null)?.name || ""),
    levelCode: String(row.level_code || ""),
    status: String(row.status || "draft"),
    recipientCount: Number(row.recipient_count || 0),
    sentCount: Number(row.sent_count || 0),
    createdAt: String(row.created_at || ""),
  }));
}
