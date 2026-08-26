"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { homeForRole, resolveMyRoles } from "@/lib/roles/current-role";
import { readLocal, STORAGE_KEYS } from "@/lib/storage-mode";
import type { SchoolRole } from "@/lib/platform/types";

/**
 * Le portier des écrans sensibles.
 *
 * Le portier de l'application ne vérifie qu'une chose : qu'une session est
 * ouverte. Il ne regarde jamais le rôle — ce serait une requête en base à
 * chaque navigation, sur chaque page. Les données, elles, restent gardées par
 * les politiques du serveur.
 *
 * Mais entre les deux subsiste un espace, et c'est là que se logeait le
 * défaut : un enseignant, un parent, pouvaient ouvrir le journal d'audit ou le
 * centre de pilotage. Ils n'y voyaient rien — les politiques tenaient — mais
 * ils y voyaient « rien » sans explication, ce qui ressemble à une panne. Et un
 * chef d'établissement ouvrant le centre de pilotage de l'éditeur y trouvait sa
 * propre école, présentée dans le vocabulaire commercial de l'éditeur.
 *
 * Le piège était le même qu'ailleurs, sous un autre habit : **l'absence de
 * lignes n'est pas un refus**. Le centre de pilotage déduisait le refus d'une
 * erreur de requête ; or une politique qui écarte des lignes ne lève aucune
 * erreur, elle en rend moins. Le refus doit donc être demandé, jamais déduit.
 */

type Etat = "verification" | "autorise" | "refuse";

export function RequireRole({
  allow,
  superAdminOnly = false,
  what,
  children,
}: {
  /** Rôles admis. Ignoré lorsque « superAdminOnly » est vrai. */
  allow?: SchoolRole[];
  /** Réservé au super-administrateur de la plateforme. */
  superAdminOnly?: boolean;
  /** Ce que l'écran est, pour l'annoncer dans le refus. */
  what: string;
  children: ReactNode;
}) {
  const [etat, setEtat] = useState<Etat>("verification");
  const [monRole, setMonRole] = useState<SchoolRole | null>(null);
  const [raison, setRaison] = useState("");

  /*
   * La liste des rôles est comparée par son contenu, pas par son identité.
   * Passée en littéral depuis une page, elle change d'identité à chaque rendu
   * et relancerait la vérification sans fin.
   */
  const admisCle = (allow || []).join(",");

  useEffect(() => {
    void (async () => {
      const client = createClient();
      try {
        const { data: auth, error: authError } = await client.auth.getUser();
        if (authError || !auth.user) {
          setRaison("Votre session a expiré. Reconnectez-vous pour continuer.");
          setEtat("refuse");
          return;
        }

        if (superAdminOnly) {
          // On demande le verdict, on ne le déduit pas d'un tableau vide.
          const { data, error } = await client.rpc("is_super_admin");
          if (error) {
            setRaison(`Vérification impossible : ${error.message}`);
            setEtat("refuse");
            return;
          }
          setEtat(data === true ? "autorise" : "refuse");
          if (data !== true) setRaison("Cet écran appartient à l’éditeur de la plateforme.");
        }

        const schoolId = readLocal<string>(STORAGE_KEYS.activeSchool, "");
        const contexte = schoolId ? await resolveMyRoles(schoolId) : null;
        setMonRole(contexte?.primary || null);

        if (superAdminOnly) return;

        const admis = admisCle ? (admisCle.split(",") as SchoolRole[]) : [];
        const autorise = (contexte?.roles || []).some((role) => admis.includes(role));
        setEtat(autorise ? "autorise" : "refuse");
        if (!autorise) {
          setRaison(
            contexte
              ? "Votre rôle dans cet établissement ne donne pas accès à cet écran."
              : "Aucun rôle actif n’a été trouvé pour votre compte dans cet établissement.",
          );
        }
      } catch (caught) {
        setRaison(caught instanceof Error ? caught.message : "Vérification impossible.");
        setEtat("refuse");
      }
    })();
  }, [admisCle, superAdminOnly]);

  if (etat === "verification") {
    return (
      <main className="center-page">
        <div className="simple-card">
          <p>Vérification de vos droits…</p>
        </div>
      </main>
    );
  }

  if (etat === "refuse") {
    /*
     * Un refus qui explique et qui raccompagne.
     *
     * Une page blanche laisserait croire à une panne, et un renvoi silencieux
     * vers un autre écran laisserait croire à un bogue de navigation. On
     * nomme donc l'écran, la raison, et la porte de sortie.
     */
    return (
      <main className="center-page">
        <div className="simple-card">
          <h2>
            <ShieldAlert aria-hidden="true" style={{ verticalAlign: "-4px", marginRight: 8 }} />
            Accès réservé
          </h2>
          <p>
            {what} n’est pas ouvert à votre compte. {raison}
          </p>
          <Link href={homeForRole(monRole || "teacher")}>Retourner à mon espace</Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
