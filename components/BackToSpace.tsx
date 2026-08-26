"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { homeForRole, readCachedPrimaryRole, resolveMyRoles } from "@/lib/roles/current-role";
import { readLocal, STORAGE_KEYS } from "@/lib/storage-mode";

/**
 * La flèche de retour, qui ramène chacun chez lui.
 *
 * Plusieurs écrans servent trois espaces à la fois — les messages aux parents,
 * les inscriptions, les classes, le journal. Leur flèche de retour était écrite
 * en dur vers le tableau de bord de l'enseignant : un secrétaire ou un chef
 * d'établissement qui l'utilisait se retrouvait dans un espace qui n'est pas le
 * sien, avec ses propres écrans hors de portée.
 *
 * C'est la même faute que le bouton « Publier » posé jadis dans l'espace
 * enseignant : un écran partagé qui suppose un seul public. La destination doit
 * se déduire de la personne, pas du fichier.
 *
 * Deux lectures se succèdent, et cet ordre importe. Le rôle mis en cache oriente
 * la flèche dès le premier rendu, sans attendre le réseau ; le serveur confirme
 * ensuite. Une coupure de connexion ne renvoie donc personne dans le mauvais
 * espace — ce que ferait une résolution purement distante.
 */
export function BackToSpace({
  className = "icon-btn",
  label = "Retour à mon espace",
  children,
}: {
  className?: string;
  label?: string;
  children?: ReactNode;
}) {
  /*
   * L'état de départ est le même côté serveur et côté navigateur : lire le
   * cache dès le rendu initial produirait une discordance d'hydratation. La
   * correction arrive à l'effet, bien avant qu'une main n'atteigne la flèche.
   */
  const [href, setHref] = useState("/gabon-educ/tableau-de-bord");

  useEffect(() => {
    const cached = readCachedPrimaryRole();
    if (cached) setHref(homeForRole(cached));

    void (async () => {
      try {
        const schoolId = readLocal<string>(STORAGE_KEYS.activeSchool, "");
        if (!schoolId) return;
        const context = await resolveMyRoles(schoolId);
        if (context?.primary) setHref(homeForRole(context.primary));
      } catch {
        // Le cache a déjà répondu ; une panne réseau ne doit pas déplacer la
        // flèche vers un espace que la personne n'occupe pas.
      }
    })();
  }, []);

  return (
    <Link href={href} className={className} aria-label={label} title={label}>
      {children ?? <ArrowLeft />}
    </Link>
  );
}
