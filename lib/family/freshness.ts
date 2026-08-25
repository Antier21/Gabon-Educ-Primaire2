/**
 * Indicateur de nouveauté de l'espace famille.
 *
 * Un parent qui se connecte tombe sur sept onglets muets : rien ne lui dit
 * lequel a bougé depuis sa dernière visite. Il ouvre le relevé, les bulletins,
 * la vie scolaire, les messages — le plus souvent pour rien — et finit par ne
 * plus se connecter du tout. La note nouvelle qu'il devait voir dès la
 * première évaluation reste ainsi invisible faute d'avoir été signalée.
 *
 * Ce module retient, pour chaque enfant et chaque onglet, la date de la
 * dernière consultation, et compte ce qui est apparu depuis. Il ne connaît ni
 * React ni Supabase : les décisions qu'il porte se vérifient par des tests.
 */

/** Clé de stockage. Nommée en clair : elle sera lue dans l'inspecteur du navigateur. */
const STORAGE_KEY = "gabon-educ.famille.dernieres-consultations";

/** `${enfant}:${onglet}` → date ISO de la dernière consultation. */
export type SeenMarks = Record<string, string>;

export function seenKey(childId: string, tab: string) {
  return `${childId || "sans-enfant"}:${tab}`;
}

/**
 * Compte les éléments apparus depuis la dernière consultation.
 *
 * Sans repère enregistré — première connexion, ou navigateur nettoyé — le
 * compte est nul, délibérément. Tout marquer comme nouveau le jour où le
 * parent découvre son espace afficherait sept pastilles à la fois : un
 * signal qui crie partout ne signale plus rien, et le parent apprend en un
 * instant à ne plus les regarder.
 */
export function countFresh(
  dates: Iterable<string | null | undefined>,
  seenAt: string | null | undefined,
): number {
  if (!seenAt) return 0;
  const seen = new Date(seenAt).getTime();
  if (!Number.isFinite(seen)) return 0;
  let count = 0;
  for (const value of dates) {
    if (!value) continue;
    const at = new Date(value).getTime();
    if (Number.isFinite(at) && at > seen) count += 1;
  }
  return count;
}

/**
 * Ce qu'affiche la pastille.
 *
 * Au-delà de neuf, le nombre exact n'apprend plus rien au parent : « 34 » et
 * « 9+ » appellent la même action, ouvrir l'onglet. La forme courte tient en
 * revanche sur un téléphone, où la barre d'onglets est déjà à l'étroit.
 */
export function badgeLabel(count: number): string {
  if (count <= 0) return "";
  return count > 9 ? "9+" : String(count);
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readSeenMarks(): SeenMarks {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const marks: SeenMarks = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "string" && value) marks[key] = value;
    }
    return marks;
  } catch {
    // Un stockage illisible ne doit pas empêcher le parent de voir les notes
    // de son enfant : on repart d'un repère vide plutôt que de propager.
    return {};
  }
}

/**
 * Enregistre la consultation d'un onglet et renvoie la table mise à jour.
 *
 * `now` est passé en paramètre plutôt que lu de l'horloge, pour la même raison
 * que dans la politique de reprise : une décision qui dépend du temps ne se
 * teste pas autrement.
 */
export function markTabSeen(
  marks: SeenMarks,
  childId: string,
  tab: string,
  now: Date,
): SeenMarks {
  const next = { ...marks, [seenKey(childId, tab)]: now.toISOString() };
  if (isBrowser()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota saturé ou mode privé restreint : la pastille redeviendra visible
      // à la prochaine visite. Un désagrément, pas une panne.
    }
  }
  return next;
}
