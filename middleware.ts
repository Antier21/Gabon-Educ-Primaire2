import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Pages exigeant une session ouverte.
 *
 * Plusieurs manquaient à cette liste et étaient donc atteignables sans être
 * connecté : le bureau du secrétariat, les inscriptions, les messages aux
 * parents, les dossiers du personnel, les notes et les bulletins. Les données
 * restaient protégées par les règles Supabase — un visiteur non identifié ne
 * voyait que des écrans vides — mais une page d'administration qui s'ouvre
 * sans mot de passe n'inspire pas confiance, et un écran vide ressemble à une
 * panne.
 */
const protectedPrefixes = [
  // Espace enseignant
  "/gabon-educ/tableau-de-bord",
  "/gabon-educ/mes-fiches",
  "/gabon-educ/mes-classes",
  "/gabon-educ/preparer-un-cours",
  "/gabon-educ/generateur-ia",
  "/gabon-educ/programmes-apc",
  "/gabon-educ/evaluations",
  "/gabon-educ/notes",
  "/gabon-educ/bulletins",
  "/gabon-educ/parametres",
  // Direction et secrétariat
  "/gabon-educ/administration",
  "/gabon-educ/secretariat",
  "/gabon-educ/etablissement",
  "/gabon-educ/utilisateurs",
  "/gabon-educ/personnel",
  "/gabon-educ/creer-enseignant",
  "/gabon-educ/eleves",
  "/gabon-educ/parents",
  "/gabon-educ/inscription",
  "/gabon-educ/classes",
  "/gabon-educ/matieres",
  "/gabon-educ/emplois-du-temps",
  "/gabon-educ/annonces",
  "/gabon-educ/communication",
  "/gabon-educ/documents",
  "/gabon-educ/notes-bulletins",
  "/gabon-educ/modele-bulletin",
  "/gabon-educ/saisie-bulletin",
  "/gabon-educ/impression-bulletins",
  "/gabon-educ/journal-audit",
  "/gabon-educ/import-export",
  "/gabon-educ/synchronisation",
  "/gabon-educ/diagnostic",
  "/gabon-educ/modules-a-venir",
  "/gabon-educ/abonnement",
  "/gabon-educ/service-abonnements",
  "/gabon-educ-service",
  "/gabon-educ/notifications",
  // Vie scolaire
  "/gabon-educ/assiduite",
  // Familles
  "/gabon-educ/espace-parent",
  "/gabon-educ/espace-eleve",
];

/**
 * À chaque espace sa page de connexion.
 *
 * La correspondance est cherchée dans l'ordre et la première qui convient
 * l'emporte : les préfixes les plus précis doivent donc précéder les plus
 * généraux — « /notes-bulletins » avant « /notes », faute de quoi le
 * secrétariat se verrait proposer la connexion des enseignants.
 *
 * C'est exactement ce qui arrivait à « Parents et responsables » : la page
 * ne figurait dans aucune ligne, et le repli renvoyait tout le monde vers
 * l'espace enseignants.
 */
const loginByPrefix: Array<[string, string]> = [
  // Direction et secrétariat
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
  // Espace enseignant — le repli, décrit ici pour mémoire
  ["/gabon-educ/tableau-de-bord", "/gabon-educ/connexion"],
  ["/gabon-educ/mes-classes", "/gabon-educ/connexion"],
  ["/gabon-educ/mes-fiches", "/gabon-educ/connexion"],
  ["/gabon-educ/notes", "/gabon-educ/connexion"],
  ["/gabon-educ/saisie-bulletin", "/gabon-educ/connexion"],
  ["/gabon-educ/impression-bulletins", "/gabon-educ/connexion"],
  ["/gabon-educ/bulletins", "/gabon-educ/connexion"],
];

function loginPathFor(pathname: string) {
  const match = loginByPrefix.find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : "/gabon-educ/connexion";
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!protectedPrefixes.some(prefix => pathname.startsWith(prefix))) return NextResponse.next();

  const response = NextResponse.next({ request });
  if (request.cookies.get("gabon-educ-demo-session")?.value === "1") return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const login = request.nextUrl.clone();
    login.pathname = loginPathFor(pathname);
    login.searchParams.set("retour", pathname);
    login.searchParams.set("erreur", "configuration");
    return NextResponse.redirect(login);
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user && !error) return response;
  } catch {
    const login = request.nextUrl.clone();
    login.pathname = loginPathFor(pathname);
    login.searchParams.set("retour", pathname);
    login.searchParams.set("erreur", "reseau");
    return NextResponse.redirect(login);
  }

  const login = request.nextUrl.clone();
  login.pathname = loginPathFor(pathname);
  login.searchParams.set("retour", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/gabon-educ/:path*", "/gabon-educ-service/:path*"],
};
