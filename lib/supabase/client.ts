import { createBrowserClient } from "@supabase/ssr";

// Valeurs de repli utilisées uniquement pendant le prérendu des pages, au moment
// de la compilation. Elles ne servent jamais à joindre une base réelle.
const URL_REPLI = "https://compilation.supabase.co";
const CLE_REPLI = "configuration-absente-a-la-compilation";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    // Next.js rend une première fois les pages côté serveur pendant la
    // compilation. Si les variables ne sont pas encore définies, on renvoie un
    // client inerte plutôt que d'interrompre le déploiement : la page se
    // construit dans son état de chargement, et le vrai client sera créé dans le
    // navigateur. Là, en revanche, une configuration manquante reste une erreur
    // franche, signalée à l'utilisateur.
    if (typeof window === "undefined") {
      return createBrowserClient(URL_REPLI, CLE_REPLI);
    }
    throw new Error("Configuration Supabase absente");
  }
  return createBrowserClient(url, key);
}
