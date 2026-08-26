"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudOff, WifiOff, KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isPublicPath, loginPathFor } from "@/lib/auth/login-paths";

/**
 * Ce que l'écran ne disait pas.
 *
 * La plateforme travaille d'abord sur des copies locales, puis synchronise.
 * C'est ce qui la rend utilisable à Libreville, où la connexion tombe. Mais
 * cela produit un mensonge redoutable : classes, élèves et notes continuent de
 * s'afficher, tirés du navigateur, pendant que le serveur refuse tout. L'écran
 * paraît normal, on saisit, on enregistre — et rien ne part.
 *
 * Cela a déjà coûté deux heures : un directeur s'est vu refuser la publication
 * de ses bulletins et nous avons cherché un défaut de droit, alors que sa
 * session avait simplement expiré.
 *
 * Ce bandeau ne fait qu'une chose, et il la fait partout : dire quand ce qu'on
 * voit ne vient plus du serveur.
 *
 * Trois états, et les distinguer est tout l'enjeu — ils appellent trois gestes
 * opposés :
 *
 *   — **hors connexion** : l'appareil n'a plus de réseau. Attendre.
 *   — **serveur injoignable** : le réseau est là, le serveur ne répond pas.
 *     Attendre aussi, mais ce n'est pas la même panne, et ce n'est pas au
 *     même endroit qu'on la répare.
 *   — **session expirée** : tout fonctionne, mais le compte n'est plus
 *     reconnu. Se reconnecter — et rien d'autre ne débloquera la situation.
 *
 * Les confondre envoie l'utilisateur dans la mauvaise direction, ce qui est
 * exactement ce qui s'était produit.
 */

type Etat = "ok" | "hors-ligne" | "serveur" | "session";

/** Vérification périodique, seulement quand l'onglet est visible. */
const INTERVALLE_MS = 60_000;

export function ConnectionBanner() {
  const pathname = usePathname() || "";
  const [etat, setEtat] = useState<Etat>("ok");

  const verifier = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setEtat("hors-ligne");
      return;
    }
    try {
      /*
       * « getUser » et non « getSession » : le second relit le jeton stocké
       * sans le valider, et un jeton expiré passerait pour une session
       * ouverte — ce qui est précisément la panne qu'on cherche à révéler.
       */
      const { data, error } = await createClient().auth.getUser();
      if (error) {
        // Une panne de réseau et un refus d'authentification remontent tous
        // deux comme une erreur : c'est le message qui les sépare.
        const texte = String(error.message || "").toLowerCase();
        const reseau =
          texte.includes("fetch") || texte.includes("network") || texte.includes("timeout");
        setEtat(reseau ? "serveur" : "session");
        return;
      }
      setEtat(data.user ? "ok" : "session");
    } catch {
      // Une exception jetée hors du protocole est toujours un défaut de
      // transport : le serveur n'a rien répondu du tout.
      setEtat("serveur");
    }
  }, []);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      setEtat("ok");
      return;
    }
    void verifier();

    const auRetour = () => void verifier();
    const surVisibilite = () => {
      if (document.visibilityState === "visible") void verifier();
    };
    window.addEventListener("online", auRetour);
    window.addEventListener("offline", auRetour);
    window.addEventListener("focus", auRetour);
    document.addEventListener("visibilitychange", surVisibilite);

    // On ne sonde pas un onglet caché : ce serait du trafic pour personne, et
    // les connexions mesurées se paient au Gabon.
    const minuterie = window.setInterval(() => {
      if (document.visibilityState === "visible") void verifier();
    }, INTERVALLE_MS);

    return () => {
      window.removeEventListener("online", auRetour);
      window.removeEventListener("offline", auRetour);
      window.removeEventListener("focus", auRetour);
      document.removeEventListener("visibilitychange", surVisibilite);
      window.clearInterval(minuterie);
    };
  }, [pathname, verifier]);

  if (etat === "ok" || isPublicPath(pathname)) return null;

  if (etat === "session") {
    return (
      <div className="connection-banner connection-banner-session" role="status" aria-live="polite">
        <KeyRound aria-hidden="true" />
        <span>
          <b>Votre session a expiré.</b> Ce que vous voyez vient de cet appareil : vos
          enregistrements ne partiront pas tant que vous ne serez pas reconnecté.
        </span>
        <Link href={loginPathFor(pathname)}>Se reconnecter</Link>
      </div>
    );
  }

  const horsLigne = etat === "hors-ligne";
  return (
    <div className="connection-banner" role="status" aria-live="polite">
      {horsLigne ? <WifiOff aria-hidden="true" /> : <CloudOff aria-hidden="true" />}
      <span>
        <b>{horsLigne ? "Appareil hors connexion." : "Serveur injoignable."}</b> Ce que vous
        voyez vient de cet appareil et peut avoir vieilli. Vos modifications seront envoyées au
        retour de la connexion.
      </span>
      <button type="button" onClick={() => void verifier()}>
        Réessayer
      </button>
    </div>
  );
}
