"use client";

import { LockKeyhole, ShieldAlert } from "lucide-react";

export function SubscriptionReadOnlyPanel({ message }: { message?: string }) {
  const suspended = !message || message.startsWith("Votre établissement est suspendu.");
  return (
    <section className="subscription-readonly-panel" role="alert" aria-live="assertive">
      <div className="subscription-readonly-icon" aria-hidden="true"><ShieldAlert /></div>
      <h2>{suspended ? "Votre établissement est suspendu." : "Modifications temporairement indisponibles."}</h2>
      <p>{message || "Les données restent consultables, mais les créations, modifications et suppressions sont désactivées jusqu’à la régularisation de l’abonnement."}</p>
      <span><LockKeyhole aria-hidden="true" /> Accès en lecture seule</span>
    </section>
  );
}
