"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  hasAnyAllowedRole,
  homeForRole,
  readDemoRole,
  resolveMyRoles,
} from "@/lib/roles/current-role";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import type { SchoolRole } from "@/lib/platform/types";

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
 * **Le super-administrateur passe partout.** La première version ne comparait
 * que les rôles tenus dans un établissement — directeur, secrétaire. Or le
 * super-administrateur n'en tient pas nécessairement : il est au-dessus d'eux.
 * Il se voyait donc refuser les écrans techniques de sa propre plateforme. Son
 * cas se tranche avant tout le reste.
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
  superAdminOnly = false,
  what,
  children,
}: {
  /** Rôles d'établissement admis. Le super-administrateur passe de toute façon. */
  allow?: SchoolRole[];
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
      try {
        const admis = admisCle ? (admisCle.split(",") as SchoolRole[]) : [];
        const demoRole = readDemoRole();
        const terminerEnDemo = () => {
          if (!demoRole || superAdminOnly) return false;
          const autorise = hasAnyAllowedRole([demoRole], admis);
          setMonRole(demoRole);
          setEtat(autorise ? "autorise" : "refuse");
          if (!autorise) {
            setRaison("Votre rôle de démonstration ne donne pas accès à cet écran.");
            setConstat(`Rôle lu : ${demoRole}. Rôles attendus : ${admis.join(", ")}.`);
          }
          return true;
        };

        let client: ReturnType<typeof createClient>;
        try {
          client = createClient();
        } catch (clientError) {
          if (terminerEnDemo()) return;
          throw clientError;
        }
        const { data: auth, error: authError } = await client.auth.getUser();
        if (authError || !auth.user) {
          if (terminerEnDemo()) return;
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
          try {
            const contexteEcole = await resolveActiveSchoolContext();
            setMonRole((await resolveMyRoles(contexteEcole.school.id))?.primary || null);
          } catch {
            // Le rôle de retour est facultatif sur un écran réservé à l'éditeur.
          }
          return;
        }

        // Le super-administrateur précède les rôles d'établissement : il n'a
        // pas à en tenir un pour ouvrir un écran technique.
        if (superAdmin) {
          setEtat("autorise");
          return;
        }

        let idEcole = "";
        try {
          idEcole = (await resolveActiveSchoolContext()).school.id;
        } catch (schoolError) {
          setSansEtablissement(true);
          setRaison(
            schoolError instanceof Error
              ? schoolError.message
              : "Aucun établissement actif n’est disponible.",
          );
          setConstat("Les rôles ne peuvent pas être lus sans établissement actif validé.");
          setEtat("refuse");
          return;
        }

        const contexte = await resolveMyRoles(idEcole);
        setMonRole(contexte?.primary || null);
        const autorise = hasAnyAllowedRole(contexte?.roles || [], admis);
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
          {sansEtablissement ? (
            <Link href="/gabon-educ/service-abonnements">Choisir un établissement</Link>
          ) : (
            <Link href={homeForRole(monRole || "teacher")}>Retourner à mon espace</Link>
          )}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
