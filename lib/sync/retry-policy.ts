/**
 * Politique de reprise et d'abandon de la file de synchronisation.
 *
 * La file retentait toute opération jusqu'à cinq fois, aussitôt, sans
 * distinguer les échecs. Deux conséquences opposées, aussi mauvaises l'une que
 * l'autre :
 *
 *   — un refus définitif — droit manquant, référence détruite, doublon — était
 *     retenté cinq fois pour rien, puis restait « en erreur » à jamais dans la
 *     file, jamais repris et jamais signalé ;
 *
 *   — une coupure réseau brûlait ses cinq tentatives en quelques secondes,
 *     alors qu'une seule reprise deux minutes plus tard aurait suffi.
 *
 * Ce module sépare les deux cas. Il ne contient que des fonctions pures, sans
 * accès au stockage ni au réseau : c'est ce qui permet de l'éprouver
 * entièrement par des tests.
 */

/** Nature d'un échec, telle qu'elle décide de la suite. */
export type FailureKind = "permanent" | "transient";

/**
 * Un refus que le temps ne réparera pas.
 *
 * Ces motifs viennent des codes PostgreSQL et des messages de nos propres
 * résolveurs. Retenter une écriture refusée pour défaut de droit ne fera pas
 * apparaître le droit ; retenter une référence absente ne la fera pas naître.
 */
const PERMANENT_PATTERNS: Array<{ motif: RegExp; raison: string }> = [
  { motif: /\b42501\b|row-level security|violates row-level security/i,
    raison: "Droits insuffisants pour cette écriture." },
  { motif: /\b23503\b|foreign key constraint/i,
    raison: "Une donnée liée est absente ou a été supprimée." },
  { motif: /\b23505\b|duplicate key|already exists/i,
    raison: "Cet enregistrement existe déjà." },
  { motif: /\b22P02\b|invalid input syntax/i,
    raison: "Une valeur transmise n’a pas le format attendu." },
  { motif: /\b23502\b|not-null constraint/i,
    raison: "Une information obligatoire manque." },
  { motif: /\b42703\b|does not exist/i,
    raison: "La structure de la base ne correspond pas à cette écriture." },
  { motif: /introuvable|n’a pas encore|ne possède pas d’identifiant/i,
    raison: "Une référence nécessaire n’existe pas encore côté établissement." },
  { motif: /suspendu|abonnement/i,
    raison: "L’abonnement de l’établissement ne permet pas cette écriture." },
];

export function classifyFailure(message: string): { kind: FailureKind; reason: string } {
  const texte = String(message || "");
  for (const { motif, raison } of PERMANENT_PATTERNS) {
    if (motif.test(texte)) return { kind: "permanent", reason: raison };
  }
  return { kind: "transient", reason: "" };
}

/**
 * Délai avant la prochaine tentative, en millisecondes.
 *
 * Une minute, cinq, quinze, une heure, trois heures. L'attente croît parce
 * qu'une panne qui dure une heure ne se répare pas en la sollicitant toutes
 * les secondes — et parce que l'établissement travaille pendant ce temps :
 * la file ne doit pas monopoliser la connexion.
 */
const BACKOFF_MINUTES = [1, 5, 15, 60, 180];

export function backoffDelayMs(attempt: number) {
  const index = Math.min(Math.max(attempt, 1), BACKOFF_MINUTES.length) - 1;
  return BACKOFF_MINUTES[index] * 60_000;
}

/** Nombre de tentatives au-delà duquel une opération passagère est abandonnée. */
export const MAX_ATTEMPTS = 5;

/**
 * Âge au-delà duquel une opération est abandonnée quoi qu'il arrive.
 *
 * Une écriture vieille de sept jours ne décrit plus l'état voulu par
 * l'établissement : entre-temps la donnée a été corrigée, supprimée, ou
 * ressaisie ailleurs. La rejouer ferait plus de dégâts que de bien.
 */
export const MAX_AGE_DAYS = 7;

export type NextStep =
  | { action: "retry"; nextAttemptAt: string; lastError: string }
  | { action: "abandon"; reason: string; lastError: string };

/**
 * Décide du sort d'une opération qui vient d'échouer.
 *
 * `now` est passé en paramètre plutôt que lu de l'horloge : une décision qui
 * dépend du temps ne se teste pas autrement.
 */
export function decideNextStep(args: {
  message: string;
  attempt: number;
  createdAt: string;
  now: Date;
}): NextStep {
  const { message, attempt, createdAt, now } = args;
  const { kind, reason } = classifyFailure(message);

  if (kind === "permanent")
    return { action: "abandon", reason, lastError: message };

  const age = now.getTime() - new Date(createdAt).getTime();
  if (Number.isFinite(age) && age > MAX_AGE_DAYS * 24 * 3_600_000)
    return {
      action: "abandon",
      reason: `Opération trop ancienne (plus de ${MAX_AGE_DAYS} jours) : elle ne décrit plus l’état voulu.`,
      lastError: message,
    };

  if (attempt >= MAX_ATTEMPTS)
    return {
      action: "abandon",
      reason: `Échec après ${MAX_ATTEMPTS} tentatives réparties sur plusieurs heures.`,
      lastError: message,
    };

  return {
    action: "retry",
    nextAttemptAt: new Date(now.getTime() + backoffDelayMs(attempt)).toISOString(),
    lastError: message,
  };
}

/** Vrai si l'opération peut être tentée maintenant. */
export function isDue(nextAttemptAt: string | null | undefined, now: Date) {
  if (!nextAttemptAt) return true;
  const due = new Date(nextAttemptAt).getTime();
  return !Number.isFinite(due) || due <= now.getTime();
}
