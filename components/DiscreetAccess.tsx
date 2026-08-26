import Link from "next/link";

/**
 * Les portes de service, posées comme un motif.
 *
 * Sept carrés d'un centimètre au bas de la page d'accueil. Un visiteur y voit
 * une frise ; l'exploitant sait lesquels mènent au pilotage de la plateforme.
 * Ce sont les seuls écrans qui n'apparaissent dans aucun menu — le centre de
 * pilotage éditeur, le sélecteur d'établissement, et les cinq pages de
 * contrôle technique qu'on ouvre quand quelque chose se comporte étrangement.
 *
 * Une chose doit être dite clairement, parce qu'elle décide de ce sur quoi on
 * a le droit de s'appuyer : **cette discrétion ne protège rien**. Les adresses
 * restent lisibles dans le code de la page, et quiconque les tape arrive au
 * même endroit. Ce qui ferme réellement ces écrans, c'est la connexion exigée
 * par le portier de l'application et les politiques du serveur — et elles
 * tiennent, y compris pour une adresse devinée. Le carré fait gagner du temps
 * à celui qui sait ; il n'en fait pas perdre à celui qui cherche.
 *
 * Les carrés restent donc visibles plutôt qu'invisibles. Une zone cliquable
 * transparente piégerait le visiteur qui la heurte par hasard, sans rien
 * ajouter à la discrétion : un motif assumé se regarde et s'oublie.
 */

const DOORS = [
  { href: "/gabon-educ-service", label: "Centre de pilotage" },
  { href: "/gabon-educ/service-abonnements", label: "Abonnements et établissement actif" },
  { href: "/gabon-educ/diagnostic", label: "Diagnostic" },
  { href: "/gabon-educ/synchronisation", label: "Synchronisation" },
  { href: "/gabon-educ/journal-audit", label: "Journal d’audit" },
  { href: "/gabon-educ/notifications", label: "Notifications" },
  { href: "/gabon-educ/import-export", label: "Import et export" },
] as const;

export function DiscreetAccess() {
  return (
    <nav className="service-frieze" aria-label="Accès de service">
      {DOORS.map((door, index) => (
        <Link
          key={door.href}
          href={door.href}
          className="service-tile"
          aria-label={door.label}
          // Le rang aide à retrouver un carré de mémoire — « le troisième » —
          // sans avoir à survoler toute la frise.
          data-rank={index + 1}
        >
          <span className="service-tile-caption">
            {index + 1}. {door.label}
          </span>
        </Link>
      ))}
    </nav>
  );
}
