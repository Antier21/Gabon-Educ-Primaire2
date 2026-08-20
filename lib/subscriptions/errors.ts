const SUBSCRIPTION_MARKER = "ABONNEMENT_REQUIS";

export function isSubscriptionWriteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes(SUBSCRIPTION_MARKER) || message.includes("écriture suspendue");
}

export function subscriptionFriendlyMessage(error: unknown): string {
  if (isSubscriptionWriteError(error)) {
    return "Votre établissement est suspendu. Les données restent consultables, mais les créations, modifications et suppressions sont désactivées jusqu’à la régularisation de l’abonnement.";
  }
  return error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
}
