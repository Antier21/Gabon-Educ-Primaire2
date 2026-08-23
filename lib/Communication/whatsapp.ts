/**
 * Couche d'envoi des messages aux parents.
 *
 * Deux transporteurs coexistent derrière la même interface :
 *   - « wa.me » : aucun coût, aucune démarche auprès de Meta. L'application
 *     prépare le message et ouvre WhatsApp ; le secrétariat valide l'envoi.
 *   - « cloud-api » : envoi automatique via l'API WhatsApp Business officielle,
 *     branché plus tard sans toucher au reste du module.
 */

/** Indicatif du Gabon. Les numéros saisis localement en sont dépourvus. */
const GABON_COUNTRY_CODE = "241";

/**
 * Ramène un numéro saisi à la main au format international attendu par WhatsApp,
 * sans « + » ni séparateur. Les parents notent leur numéro de façons très
 * variées : 077 12 34 56, +241 77 123 456, 0024177123456…
 */
export function normalizePhone(raw: string, countryCode = GABON_COUNTRY_CODE): string {
  let digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  // Préfixe international composé (00241…)
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Déjà au format international
  if (digits.startsWith(countryCode)) return digits;
  // Numéro national précédé d'un zéro de service
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  return `${countryCode}${digits}`;
}

/** Un numéro gabonais complet compte 11 chiffres : 241 + 8 chiffres. */
export function isPhoneUsable(raw: string, countryCode = GABON_COUNTRY_CODE): boolean {
  const normalized = normalizePhone(raw, countryCode);
  return normalized.length >= countryCode.length + 6 && normalized.length <= 15;
}

export type MessageVariables = {
  parent?: string;
  eleve?: string;
  classe?: string;
  etablissement?: string;
  [key: string]: string | undefined;
};

/** Variables reconnues dans les modèles, présentées à l'utilisateur. */
export const MESSAGE_VARIABLES = [
  { token: "{parent}", label: "Nom du parent" },
  { token: "{eleve}", label: "Nom de l'élève" },
  { token: "{classe}", label: "Classe de l'élève" },
  { token: "{etablissement}", label: "Nom de l'établissement" },
] as const;

/**
 * Remplace les variables d'un modèle. Une variable inconnue est laissée telle
 * quelle plutôt que vidée : mieux vaut un message visiblement incomplet qu'un
 * message amputé sans que personne ne s'en aperçoive.
 */
export function mergeMessage(template: string, variables: MessageVariables): string {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined || value === "" ? match : value;
  });
}

/** Lien d'ouverture de WhatsApp avec le message pré-rempli. */
export function buildWhatsAppLink(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/** Lien SMS, replié pour les parents sans WhatsApp. */
export function buildSmsLink(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  return `sms:+${normalized}?body=${encodeURIComponent(message)}`;
}

export type SendOutcome = {
  status: "sent" | "failed" | "manual";
  reason?: string;
};

export type MessageTransport = {
  id: "wa.me" | "cloud-api";
  label: string;
  /** true lorsque l'envoi exige une action humaine (ouverture de WhatsApp). */
  requiresHumanStep: boolean;
  send: (phone: string, message: string) => Promise<SendOutcome>;
};

/**
 * Transporteur manuel : ouvre WhatsApp dans un nouvel onglet. Il ne peut pas
 * confirmer la réception — c'est l'opérateur qui marque l'envoi comme effectué,
 * d'où le statut « manual ».
 */
export const waMeTransport: MessageTransport = {
  id: "wa.me",
  label: "WhatsApp (validation manuelle)",
  requiresHumanStep: true,
  async send(phone, message) {
    if (!isPhoneUsable(phone))
      return { status: "failed", reason: "Numéro de téléphone inutilisable." };
    if (typeof window === "undefined")
      return { status: "failed", reason: "Ouverture impossible hors navigateur." };
    const opened = window.open(buildWhatsAppLink(phone, message), "_blank", "noopener");
    if (!opened)
      return {
        status: "failed",
        reason: "Le navigateur a bloqué l'ouverture de WhatsApp. Autorisez les fenêtres surgissantes.",
      };
    return { status: "manual" };
  },
};

/**
 * Emplacement réservé à l'API WhatsApp Business. Le jour où l'établissement
 * disposera d'un compte Meta vérifié et de modèles approuvés, seule cette
 * fonction sera à écrire : l'interface et le suivi restent inchangés.
 */
export const cloudApiTransport: MessageTransport = {
  id: "cloud-api",
  label: "WhatsApp Business API",
  requiresHumanStep: false,
  async send() {
    return {
      status: "failed",
      reason: "L'API WhatsApp Business n'est pas encore configurée pour cet établissement.",
    };
  },
};

export function resolveTransport(id?: string): MessageTransport {
  return id === "cloud-api" ? cloudApiTransport : waMeTransport;
}
