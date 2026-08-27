/**
 * À quelle porte renvoyer quelqu'un selon l'écran qu'il tentait d'ouvrir.
 *
 * Cette table vivait uniquement dans le portier de l'application. Le bandeau
 * de connexion en a besoin lui aussi — proposer « Se reconnecter » sans savoir
 * vers quelle porte enverrait un directeur sur la page des enseignants, où son
 * compte serait refusé, ce qui ferait croire à un compte invalide.
 *
 * Une seule table, deux lecteurs : le jour où une porte change, elle change
 * pour les deux.
 *
 * **L'ordre compte.** La comparaison retient le premier préfixe qui
 * correspond : « /notes-bulletins » doit précéder « /notes », sans quoi les
 * bulletins de l'administration renverraient vers la connexion des
 * enseignants. Cette erreur a déjà été commise.
 */
export const LOGIN_BY_PREFIX: ReadonlyArray<readonly [string, string]> = [
  // Direction, secrétariat et service
  ["/gabon-educ/administration", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/secretariat", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/etablissement", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/utilisateurs", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/personnel", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/creer-enseignant", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/eleves", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/parents", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/inscription", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/classes", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/matieres", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/emplois-du-temps", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/annonces", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/communication", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/documents", "/gabon-educ/connexion-administration"],
  // Avant « /notes » : sans cet ordre, les bulletins de l'administration
  // renverraient vers la connexion des enseignants.
  ["/gabon-educ/notes-bulletins", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/modele-bulletin", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/bulletins-publication", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/journal-audit", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/import-export", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/synchronisation", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/diagnostic", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/modules-a-venir", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/abonnement", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/service-abonnements", "/gabon-educ/connexion-administration"],
  ["/gabon-educ-service", "/gabon-educ/connexion-administration"],
  // Vie scolaire
  ["/gabon-educ/assiduite", "/gabon-educ/connexion-vie-scolaire"],
  // Familles
  ["/gabon-educ/espace-parent", "/gabon-educ/connexion-parents"],
  ["/gabon-educ/espace-eleve", "/gabon-educ/connexion-eleves"],
  // Espace enseignant
  ["/gabon-educ/tableau-de-bord", "/gabon-educ/connexion"],
  ["/gabon-educ/mes-classes", "/gabon-educ/connexion"],
  ["/gabon-educ/mes-fiches", "/gabon-educ/connexion"],
  ["/gabon-educ/cahier-de-textes", "/gabon-educ/connexion"],
  ["/gabon-educ/notes", "/gabon-educ/connexion"],
  ["/gabon-educ/saisie-bulletin", "/gabon-educ/connexion"],
  ["/gabon-educ/impression-bulletins", "/gabon-educ/connexion"],
  ["/gabon-educ/bulletins", "/gabon-educ/connexion"],
];

export function loginPathFor(pathname: string): string {
  const match = LOGIN_BY_PREFIX.find(([prefix]) => matchesRoutePath(pathname, prefix));
  return match ? match[1] : "/gabon-educ/connexion";
}

/**
 * Pages où personne n'est censé être connecté.
 *
 * Y annoncer une session expirée serait absurde : on est sur la page de
 * connexion, précisément parce qu'on ne l'est pas encore.
 */
const PUBLIC_PREFIXES = [
  "/gabon-educ/connexion",
  "/gabon-educ/connexion-administration",
  "/gabon-educ/connexion-eleves",
  "/gabon-educ/connexion-parents",
  "/gabon-educ/connexion-vie-scolaire",
  "/gabon-educ/ouvrir-compte",
  "/gabon-educ/enregistrer-etablissement",
  "/gabon-educ/espaces",
  "/gabon-educ/mot-de-passe-oublie",
  "/gabon-educ/erreur",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/gabon-educ" || pathname === "/gabon-educ/") return true;
  return PUBLIC_PREFIXES.some((prefix) => matchesRoutePath(pathname, prefix));
}
import { matchesRoutePath } from "@/lib/auth/path-matching";
