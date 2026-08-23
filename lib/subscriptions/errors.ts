const SUBSCRIPTION_MARKER = "ABONNEMENT_REQUIS";

/**
 * Supabase ne renvoie pas des instances d'Error mais des objets simples
 * { message, code, details, hint }. Les traiter comme « inattendus » revenait à
 * jeter le seul diagnostic exploitable. On restitue ici le message d'origine.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    const parts = [raw.message, raw.details, raw.hint]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    const code = typeof raw.code === "string" && raw.code ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
    if (code) return `Erreur Supabase${code}`;
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  return "Une erreur inattendue est survenue.";
}

export function isSubscriptionWriteError(error: unknown): boolean {
  const message = describeError(error);
  return message.includes(SUBSCRIPTION_MARKER) || message.includes("écriture suspendue");
}

export function subscriptionFriendlyMessage(error: unknown): string {
  if (isSubscriptionWriteError(error)) {
    return "Votre établissement est suspendu. Les données restent consultables, mais les créations, modifications et suppressions sont désactivées jusqu’à la régularisation de l’abonnement.";
  }
  return describeError(error);
}
