"use client";

import { createClient } from "@/lib/supabase/client";
import { readLocal, writeLocal } from "@/lib/storage-mode";
import type { SchoolRole } from "@/lib/platform/types";

/**
 * Rôle du compte connecté dans l'établissement actif.
 *
 * Jusqu'ici l'application ne s'en préoccupait qu'à un seul endroit — pour
 * savoir si l'utilisateur voyait la gestion des classes ou seulement les
 * siennes. Partout ailleurs, direction et secrétariat recevaient exactement le
 * même écran : le même menu de six rubriques, salaires et abonnement compris,
 * et le même tableau de bord de pilotage. Les règles Supabase faisaient seules
 * barrage, ce qui produisait le pire des enchaînements — une porte visible,
 * ouverte, puis un refus.
 *
 * Ce module donne à l'interface le moyen de savoir à qui elle parle.
 */

const ROLE_CACHE_KEY = "gabon-educ-plus:v1:my-school-roles";

/**
 * Ordre de préséance. Un compte peut cumuler plusieurs rôles — un chef
 * d'établissement qui enseigne également, par exemple. C'est le rôle le plus
 * étendu qui décide de l'écran d'accueil : il serait absurde d'envoyer un
 * directeur sur l'espace enseignant parce qu'il assure quelques heures de
 * cours.
 */
const rolePrecedence: SchoolRole[] = [
  "super_admin",
  "school_admin",
  "headmaster",
  "academic_director",
  "secretary",
  "supervisor",
  "head_teacher",
  "teacher",
  "guardian",
  "student",
];

const knownRoles = new Set<string>(rolePrecedence);

/** Le SQL historique nomme le rôle familial `parent`; l'interface dit `guardian`. */
export function normalizeSchoolRole(value: unknown): SchoolRole | null {
  const role = String(value || "");
  const normalized = role === "parent" ? "guardian" : role;
  return knownRoles.has(normalized) ? (normalized as SchoolRole) : null;
}

export type RoleContext = {
  roles: SchoolRole[];
  /** Rôle le plus étendu, celui qui décide de l'accueil et du menu. */
  primary: SchoolRole;
  schoolId: string;
  userId: string;
  /** Vrai lorsque la valeur vient du cache local faute de réponse du serveur. */
  fromCache: boolean;
};

type CachedRoles = { userId: string; schoolId: string; roles: SchoolRole[] };

function pickPrimary(roles: SchoolRole[]): SchoolRole {
  for (const role of rolePrecedence) if (roles.includes(role)) return role;
  return "teacher";
}

function readCache(userId: string, schoolId: string): SchoolRole[] | null {
  const cached = readLocal<CachedRoles | null>(ROLE_CACHE_KEY, null);
  if (!cached || cached.userId !== userId || cached.schoolId !== schoolId)
    return null;
  if (!Array.isArray(cached.roles)) return null;
  return cached.roles
    .map(normalizeSchoolRole)
    .filter((role): role is SchoolRole => role !== null);
}

/**
 * Lit les rôles du compte dans un établissement donné.
 *
 * Le cache local n'est pas une optimisation : il évite qu'une coupure réseau
 * fasse basculer un secrétaire ou un directeur vers l'espace enseignant au
 * milieu de sa journée. Il n'accorde aucun droit — les écritures restent
 * arbitrées par Supabase — il ne fait que maintenir l'écran stable.
 */
export async function resolveMyRoles(
  schoolId: string,
): Promise<RoleContext | null> {
  if (!schoolId) return null;
  const client = createClient();
  /*
   * « getUser » plutôt que « getSession ».
   *
   * getSession se contente de relire le jeton stocké, sans vérifier qu'il est
   * encore valide. Un jeton expiré passait donc pour une session valide, la
   * requête partait, et Supabase répondait 401 — que l'appelant traduisait en
   * « aucun rôle », c'est-à-dire en refus de droit. Un directeur s'est ainsi vu
   * refuser la publication de ses bulletins parce que sa session avait expiré.
   *
   * getUser interroge le serveur et renouvelle le jeton au besoin.
   */
  const { data: auth, error: authError } = await client.auth.getUser();
  const userId = auth.user?.id || "";
  if (authError || !userId) return null;

  const { data, error } = await client
    .from("school_memberships")
    .select("role")
    .eq("school_id", schoolId)
    .eq("user_id", userId)
    .eq("status", "active");

  if (error || !data) {
    const cached = readCache(userId, schoolId);
    if (!cached) return null;
    return {
      roles: cached,
      primary: pickPrimary(cached),
      schoolId,
      userId,
      fromCache: true,
    };
  }

  const roles = Array.from(
    new Set(
      data
        .map((row) => normalizeSchoolRole((row as { role?: unknown }).role))
        .filter((role): role is SchoolRole => role !== null),
    ),
  ) as SchoolRole[];

  // Une réponse vide est une information, pas une panne : le compte n'a plus
  // d'appartenance active. On efface alors le cache plutôt que de laisser
  // survivre un rôle révoqué.
  writeLocal<CachedRoles>(ROLE_CACHE_KEY, { userId, schoolId, roles });
  if (!roles.length) return null;

  return {
    roles,
    primary: pickPrimary(roles),
    schoolId,
    userId,
    fromCache: false,
  };
}

/**
 * Le rôle le plus étendu connu localement, sans aucun appel réseau.
 *
 * Sert à orienter un lien de retour dès le premier rendu. Il n'accorde rien :
 * un rôle lu ici ne fait qu'indiquer quel accueil proposer, et toute écriture
 * reste soumise aux politiques du serveur.
 */
export function readCachedPrimaryRole(): SchoolRole | null {
  const cached = readLocal<CachedRoles | null>(ROLE_CACHE_KEY, null);
  const roles = Array.isArray(cached?.roles)
    ? cached.roles
        .map(normalizeSchoolRole)
        .filter((role): role is SchoolRole => role !== null)
    : [];
  if (!roles.length) return null;
  return pickPrimary(roles);
}

/** Rôles autorisés à ouvrir l'espace d'administration. */
export const MANAGEMENT_ROLES: SchoolRole[] = [
  "super_admin",
  "school_admin",
  "headmaster",
  "academic_director",
  "secretary",
];

export function isManagementRole(role: SchoolRole) {
  return MANAGEMENT_ROLES.includes(role);
}

/** Page d'accueil correspondant à un rôle. */
export function homeForRole(role: SchoolRole) {
  if (role === "super_admin") return "/gabon-educ/service-abonnements";
  if (role === "secretary") return "/gabon-educ/secretariat";
  if (isManagementRole(role)) return "/gabon-educ/administration";
  if (role === "supervisor") return "/gabon-educ/assiduite";
  if (role === "guardian") return "/gabon-educ/espace-parent";
  if (role === "student") return "/gabon-educ/espace-eleve";
  return "/gabon-educ/tableau-de-bord";
}
