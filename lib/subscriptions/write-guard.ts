"use client";

import { createClient } from "@/lib/supabase/client";
import { hasSupabaseEnvironment, readLocal, writeLocal } from "@/lib/storage-mode";
import { resolveActiveSchoolContext } from "@/lib/active-school";

const CACHE_KEY = "gabon-educ:subscription-write-cache";
const MAX_OFFLINE_AGE = 30 * 24 * 60 * 60 * 1000;

export class SubscriptionWriteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubscriptionWriteBlockedError";
  }
}

export async function assertSubscriptionWriteAllowed(explicitSchoolId?: string) {
  let schoolId = explicitSchoolId || "";

  if (hasSupabaseEnvironment()) {
    const context = await resolveActiveSchoolContext();
    if (schoolId && schoolId !== context.school.id) {
      throw new SubscriptionWriteBlockedError(
        "L’établissement demandé ne correspond pas à la session active. Rechargez la page puis réessayez.",
      );
    }
    schoolId = context.school.id;
  }

  if (!schoolId || schoolId === "local") {
    throw new SubscriptionWriteBlockedError(
      "Aucun établissement cloud n’est sélectionné. Ouvrez Service abonnements, choisissez « Gérer », puis réessayez.",
    );
  }

  // Dès que Supabase est configuré, la base est la source de vérité. On ne
  // s'appuie pas sur un ancien cache positif : une suspension doit être prise
  // en compte immédiatement dans tous les modules, même si la session réelle
  // appartient à un super administrateur.
  if (hasSupabaseEnvironment()) {
    const { data, error } = await createClient().rpc("school_can_write_strict", {
      target_school: schoolId,
    });
    if (error) {
      throw new SubscriptionWriteBlockedError(
        "Vérification de l’abonnement impossible. Par sécurité, aucune modification n’a été enregistrée.",
      );
    }
    const canWrite = data === true;
    writeLocal(CACHE_KEY, {
      schoolId,
      canWrite,
      checkedAt: new Date().toISOString(),
    });
    if (!canWrite) {
      throw new SubscriptionWriteBlockedError(
        "Votre établissement est suspendu. Les données restent consultables, mais les créations, modifications et suppressions sont désactivées jusqu’à la régularisation de l’abonnement.",
      );
    }
    return;
  }

  // Mode réellement hors ligne : une licence locale récente est nécessaire.
  const cached = readLocal<{ schoolId: string; canWrite: boolean; checkedAt: string } | null>(CACHE_KEY, null);
  const age = cached?.checkedAt
    ? Date.now() - new Date(cached.checkedAt).getTime()
    : Number.POSITIVE_INFINITY;
  if (cached?.schoolId !== schoolId || !cached.canWrite || age > MAX_OFFLINE_AGE) {
    throw new SubscriptionWriteBlockedError(
      "Licence hors ligne expirée ou absente. Reconnectez-vous à Internet pour vérifier l’abonnement avant toute modification.",
    );
  }
}
