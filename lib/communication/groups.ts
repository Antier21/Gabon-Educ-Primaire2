/**
 * Les groupes WhatsApp de classe, et ce qu'on a le droit d'y écrire.
 *
 * Un groupe classe est une place publique : soixante parents y lisent tout.
 * C'est excellent pour une réunion, une rentrée, une fermeture exceptionnelle —
 * et c'est une fuite pour un bulletin, un impayé ou une absence, qui ne
 * regardent qu'une famille.
 *
 * Cette fuite ne relève pas de la négligence : elle arrive parce qu'on envoie
 * vite, depuis un téléphone, entre deux cours. Le logiciel peut la rendre
 * impossible, et c'est le seul endroit du module où il doit dire non.
 */

import { createClient } from "@/lib/supabase/client";
import { confirmWrite } from "@/lib/supabase/confirm-write";
import type { AudienceKind } from "./store";

export type ClassWhatsAppGroup = {
  classId: string;
  className: string;
  groupName: string;
  inviteLink: string;
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
  return "Groupes WhatsApp indisponibles.";
}

/**
 * Les variables qui rendent un message nominatif.
 *
 * « {classe} » et « {etablissement} » désignent un collectif : ils peuvent
 * partir dans un groupe. « {parent} » et « {eleve} » nomment une personne — un
 * message qui les contient s'adresse à une famille et à une seule.
 */
const NOMINATIVE_TOKENS = ["{parent}", "{eleve}"];

/**
 * Les catégories qui ne concernent jamais toute une classe.
 *
 * Une convocation, un impayé, une absence visent un élève. Même rédigés sans
 * variable, ces messages n'ont rien à faire sous les yeux des cinquante-neuf
 * autres familles.
 */
const PRIVATE_CATEGORIES = ["convocation", "paiement", "absence"];

export type GroupSendVerdict = { allowed: boolean; reason: string };

/**
 * Ce message peut-il partir dans le groupe de la classe ?
 *
 * Trois refus possibles, du plus certain au plus prudent : le message nomme
 * quelqu'un ; il relève d'une catégorie qui vise une famille ; il ne s'adresse
 * pas à une classe entière mais à des élèves choisis. Le premier est une
 * preuve, les deux autres sont des présomptions — mais toutes trois se
 * trompent du bon côté, celui qui n'expose personne.
 */
export function groupSendVerdict(input: {
  body: string;
  audienceKind: AudienceKind;
  category?: string;
}): GroupSendVerdict {
  const body = String(input.body || "");
  const nominative = NOMINATIVE_TOKENS.filter((token) => body.includes(token));
  if (nominative.length) {
    return {
      allowed: false,
      reason:
        `Ce message nomme une personne (${nominative.join(", ")}) : il s’adresse à une famille, ` +
        "pas à une classe. Il partira parent par parent.",
    };
  }

  const category = String(input.category || "").toLowerCase();
  if (PRIVATE_CATEGORIES.includes(category)) {
    return {
      allowed: false,
      reason:
        "Une convocation, un impayé ou une absence ne concernent qu’une famille. " +
        "Ce message partira parent par parent.",
    };
  }

  if (input.audienceKind !== "class") {
    return {
      allowed: false,
      reason:
        input.audienceKind === "students"
          ? "Vous avez choisi des élèves un par un : le groupe de la classe toucherait aussi les autres familles."
          : "Un niveau réunit plusieurs classes, donc plusieurs groupes. Choisissez une classe pour l’envoi groupé.",
    };
  }

  return { allowed: true, reason: "" };
}

/**
 * Le message prêt à déposer dans le groupe.
 *
 * Les variables collectives sont remplacées, les autres n'ont pas lieu d'être
 * ici — « groupSendVerdict » les a déjà écartées.
 */
export function groupBody(
  template: string,
  values: { className: string; schoolName: string },
): string {
  return String(template || "")
    .replace(/\{classe\}/g, values.className)
    .replace(/\{etablissement\}/g, values.schoolName);
}

/**
 * Lien d'ouverture de WhatsApp sans destinataire.
 *
 * Sans numéro, WhatsApp propose de choisir la conversation — un groupe compris.
 * Le comportement varie selon les postes et les versions : le message est donc
 * toujours copié dans le presse-papiers en même temps, de sorte que le
 * surveillant puisse le coller lui-même si aucun sélecteur n'apparaît. La
 * fonction ne promet pas plus qu'elle ne tient.
 */
export function buildGroupShareLink(message: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

export async function loadClassGroups(schoolId: string): Promise<ClassWhatsAppGroup[]> {
  if (!schoolId || schoolId === "local") return [];
  const { data, error } = await createClient()
    .from("class_whatsapp_groups")
    .select("class_group_id,group_name,invite_link")
    .eq("school_id", schoolId);
  if (error) throw new Error(describe(error));
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    classId: String(row.class_group_id || ""),
    className: "",
    groupName: String(row.group_name || ""),
    inviteLink: String(row.invite_link || ""),
  }));
}

export async function saveClassGroup(
  schoolId: string,
  classId: string,
  groupName: string,
  inviteLink: string,
): Promise<void> {
  const client = createClient();
  const { data: auth } = await client.auth.getUser();
  const result = await client
    .from("class_whatsapp_groups")
    .upsert(
      {
        school_id: schoolId,
        class_group_id: classId,
        group_name: groupName.trim(),
        invite_link: inviteLink.trim(),
        updated_by: auth.user?.id || null,
      },
      { onConflict: "class_group_id" },
    )
    .select("id");
  confirmWrite(result, "l’enregistrement du groupe WhatsApp de cette classe");
}

export async function removeClassGroup(classId: string): Promise<void> {
  const result = await createClient()
    .from("class_whatsapp_groups")
    .delete()
    .eq("class_group_id", classId)
    .select("id");
  confirmWrite(result, "le retrait du groupe WhatsApp de cette classe");
}
