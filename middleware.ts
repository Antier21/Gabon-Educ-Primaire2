import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const protectedPrefixes = [
  "/gabon-educ/tableau-de-bord",
  "/gabon-educ/mes-fiches",
  "/gabon-educ/preparer-un-cours",
  "/gabon-educ/generateur-ia",
  "/gabon-educ/evaluations",
  "/gabon-educ/mes-classes",
  "/gabon-educ/programmes-apc",
  "/gabon-educ/parametres",
  "/gabon-educ/etablissement",
  "/gabon-educ/administration",
  "/gabon-educ/utilisateurs",
  "/gabon-educ/eleves",
  "/gabon-educ/parents",
  "/gabon-educ/matieres",
  "/gabon-educ/emplois-du-temps",
  "/gabon-educ/assiduite",
  "/gabon-educ/annonces",
  "/gabon-educ/documents",
  "/gabon-educ/espace-parent",
  "/gabon-educ/espace-eleve",
  "/gabon-educ/notes-bulletins",
  "/gabon-educ/synchronisation",
  "/gabon-educ/journal-audit",
  "/gabon-educ/notifications",
  "/gabon-educ/import-export",
  "/gabon-educ/diagnostic",
  "/gabon-educ/abonnement",
  "/gabon-educ/service-abonnements",
  "/gabon-educ-service",
  "/gabon-educ/classes",
];

// À chaque espace sa page de connexion. Sans cette table, toute page protégée
// renvoyait vers la connexion « Enseignants », y compris l'administration.
const loginByPrefix: Array<[string, string]> = [
  ["/gabon-educ/administration", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/utilisateurs", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/etablissement", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/journal-audit", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/import-export", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/synchronisation", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/abonnement", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/service-abonnements", "/gabon-educ/connexion-administration"],
  ["/gabon-educ-service", "/gabon-educ/connexion-administration"],
  ["/gabon-educ/espace-parent", "/gabon-educ/connexion-parents"],
  ["/gabon-educ/espace-eleve", "/gabon-educ/connexion-eleves"],
  ["/gabon-educ/classes", "/gabon-educ/connexion-administration"],
["/gabon-educ/mes-classes", "/gabon-educ/connexion"],
  
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
