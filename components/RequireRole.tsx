"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { homeForRole, resolveMyRoles } from "@/lib/roles/current-role";
import { readLocal, STORAGE_KEYS } from "@/lib/storage-mode";
import type { SchoolRole } from "@/lib/platform/types";
import { deniedAccessReturnPath } from "@/lib/roles/route-access";

/**
 * Le portier des écrans sensibles.
 *
 * Le portier de l'application ne vérifie qu'une chose : qu'une session est
 * ouverte. Il ne regarde jamais le rôle — ce serait une requête en base à
 * chaque navigation, sur chaque page. Les données, elles, restent gardées par
 * les politiques du serveur.
 *
 * Entre les deux subsistait un espace : un enseignant ou un parent pouvait
 * ouvrir le journal d'audit ou le centre de pilotage. Ils n'y voyaient rien —
 * les politiques tenaient — mais ils voyaient « rien » sans explication, ce qui
 * ressemble à une panne.
 *
 * Deux règles gouvernent ce fichier, et chacune vient d'une erreur commise.
 *
 * **Le super-administrateur est un rôle de plateforme.** Il passe sur les
 * écrans qui lui sont réservés, mais pas implicitement dans les espaces métier
 * d'une école. Un accès partagé doit être déclaré explicitement.
 *
 * **Un refus doit dire ce qu'il a vu.** Un « Accès réservé » sans motif est
 * indiscernable d'une panne — c'est la leçon qui revient à chaque étape de ce
 * projet. Le refus nomme donc l'établissement actif et les rôles réellement
 * lus, de sorte qu'on sache s'il manque un droit ou simplement un
 * établissement sélectionné.
 */

type Etat = "verification" | "autorise" | "refuse";

export function RequireRole({
  allow,
  allowSuperAdmin = false,
  superAdminOnly = false,
  what,
  children,
}: {
  /** Rôles d'établissement admis. */
  allow?: SchoolRole[];
  /** Autorise explicitement l'éditeur sur un écran d'établissement. */
  allowSuperAdmin?: boolean;
  /** Réservé à l'éditeur de la plateforme. */
  superAdminOnly?: boolean;
  /** Ce que l'écran est, pour l'annoncer dans le refus. */
  what: string;
  children: ReactNode;
}) {
  const [etat, setEtat] = useState<Etat>("verification");
  const [monRole, setMonRole] = useState<SchoolRole | null>(null);
  const [raison, setRaison] = useState("");
  /** Ce que le portier a réellement lu, montré dans le refus. */
  const [constat, setConstat] = useState("");
  const [sansEtablissement, setSansEtablissement] = useState(false);

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

        // Le verdict est demandé, jamais déduit d'un tableau vide : une
        // politique qui écarte des lignes ne lève aucune erreur.
        const { data: estSuper } = await client.rpc("is_super_admin");
        const superAdmin = estSuper === true;

        if (superAdminOnly) {
          setEtat(superAdmin ? "autorise" : "refuse");
          if (!superAdmin) {
            setRaison("Cet écran appartient à l’éditeur de la plateforme.");
            setConstat("Votre compte ne porte pas le rôle « super_admin ».");
          }
          const idEcole = readLocal<string>(STORAGE_KEYS.activeSchool, "");
          if (idEcole) setMonRole((await resolveMyRoles(idEcole))?.primary || null);
          return;
        }

        // Le rôle de plateforme n'accorde pas implicitement l'accès aux
        // espaces métier d'une école (enseignant, parent, élève…). Les rares
        // écrans partagés doivent l'autoriser explicitement.
        if (superAdmin && allowSuperAdmin) {
          setEtat("autorise");
          return;
        }

        const idEcole = readLocal<string>(STORAGE_KEYS.activeSchool, "");
        if (!idEcole) {
          setSansEtablissement(true);
          setRaison("Aucun établissement actif n’est sélectionné sur cet appareil.");
          setConstat("Le portier ne peut pas lire vos rôles sans savoir de quelle école il s’agit.");
          setEtat("refuse");
          return;
        }

        const contexte = await resolveMyRoles(idEcole);
        setMonRole(contexte?.primary || null);
        const admis = admisCle ? (admisCle.split(",") as SchoolRole[]) : [];
        const autorise = (contexte?.roles || []).some((role) => admis.includes(role));
        setEtat(autorise ? "autorise" : "refuse");
        if (!autorise) {
          setRaison("Votre rôle dans cet établissement ne donne pas accès à cet écran.");
          setConstat(
            contexte?.roles.length
              ? `Rôles lus : ${contexte.roles.join(", ")}. Rôles attendus : ${admis.join(", ")}.`
              : "Aucun rôle actif n’a été trouvé pour votre compte dans cet établissement.",
          );
        }
      } catch (caught) {
        setRaison(caught instanceof Error ? caught.message : "Vérification impossible.");
        setEtat("refuse");
      }
    })();
  }, [admisCle, allowSuperAdmin, superAdminOnly]);

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
    const returnPath = deniedAccessReturnPath(
      sansEtablissement,
      homeForRole(monRole || "teacher"),
    );
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
          {constat && <p className="demo-note">{constat}</p>}
          <Link href={returnPath}>
            {sansEtablissement ? "Retour à l’accueil" : "Retourner à mon espace"}
          </Link>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
