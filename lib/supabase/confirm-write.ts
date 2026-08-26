/**
 * La preuve qu'une écriture a bien eu lieu.
 *
 * Le 26 août, la fiche d'un établissement est restée figée trois jours pendant
 * que l'écran affichait « enregistré » à chaque tentative. La table n'ouvrait
 * la modification qu'au super-administrateur ; le chef d'établissement n'en
 * était pas un.
 *
 * Ce qui rend cette panne redoutable, c'est le silence. Sous PostgreSQL, une
 * ligne écartée par la clause « using » d'une politique n'est pas refusée :
 * elle est invisible. Le serveur modifie zéro ligne et répond que tout s'est
 * bien passé. Aucune erreur ne remonte — pas même dans la console.
 *
 * La dissymétrie compte : un « insert » refusé viole une clause « with check »
 * et lève bien une erreur (42501). Seuls « update » et « delete » se taisent.
 * Ce sont eux, et eux seuls, que ce module protège.
 *
 * Le remède tient en une phrase : redemander les lignes touchées, et traiter
 * un résultat vide comme un échec. Une écriture qui ne peut pas prouver
 * qu'elle a eu lieu n'a pas eu lieu.
 */

/** Distinguée d'une panne réseau : ici le serveur a répondu, et il a dit non. */
export class WriteRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteRefusedError";
  }
}

export function describeWriteError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const raw = error as { message?: unknown; details?: unknown; code?: unknown };
    const parts = [raw.message, raw.details]
      .map((value) => (typeof value === "string" ? value : ""))
      .filter(Boolean);
    const code = typeof raw.code === "string" && raw.code ? ` (code ${raw.code})` : "";
    if (parts.length) return `${parts.join(" — ")}${code}`;
  }
  return "Opération impossible.";
}

/**
 * Vérifie qu'une modification ou une suppression a bien porté.
 *
 * À n'appeler que sur une requête terminée par « .select(...) » : sans elle,
 * « data » vaut null même en cas de réussite, et tout deviendrait un échec.
 *
 * « operation » se lit à la suite de « Le serveur a refusé » : écrire
 * « la suppression de cette classe », pas « supprimer la classe ».
 */
export function confirmWrite<T>(
  result: { data: T[] | null; error: unknown },
  operation: string,
): T[] {
  if (result.error) throw new Error(describeWriteError(result.error));
  const rows = result.data || [];
  if (!rows.length) {
    throw new WriteRefusedError(
      `Le serveur a refusé ${operation} : votre compte n’a pas ce droit, ou l’élément a déjà été retiré. ` +
        "Rien n’a été modifié.",
    );
  }
  return rows;
}

/**
 * Le cas de la file de synchronisation, où la table n'est connue qu'à
 * l'exécution.
 *
 * Impossible d'y garantir que celui qui peut supprimer une ligne peut aussi la
 * relire : selon la table, le « select » de contrôle rendrait un tableau vide
 * sur une suppression pourtant réussie, et nous crierions à l'échec sans
 * raison. Une fausse alerte est pire qu'un silence : on cesse de croire les
 * messages.
 *
 * On procède donc à l'envers — on relit la ligne après coup. Si elle est
 * toujours là, la suppression n'a pas eu lieu, et c'est certain. Si la lecture
 * ne rend rien, on se tait : soit la ligne est partie, soit nous n'avons pas
 * le droit de la voir, et rien ne permet de trancher. Cette dissymétrie est
 * assumée : ce contrôle ne produit jamais de fausse alerte, au prix de laisser
 * passer les cas indécidables.
 */
export async function confirmDeletedByReadBack(
  // « PromiseLike » et non « Promise » : une requête Supabase non exécutée est
  // un constructeur « thenable », qu'on attend sans jamais l'avoir promue.
  probe: () => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  operation: string,
): Promise<void> {
  const check = await probe();
  // Une erreur de relecture ne prouve rien : on ne bloque pas là-dessus.
  if (check.error) return;
  if ((check.data || []).length > 0) {
    throw new WriteRefusedError(
      `Le serveur a refusé ${operation} : la ligne est toujours présente après la suppression. ` +
        "Votre compte n’a probablement pas ce droit.",
    );
  }
}
