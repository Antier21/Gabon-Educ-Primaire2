import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function ErrorPage() {
  return (
    <main style={{ maxWidth: 720, margin: "48px auto", padding: 24 }}>
      <Brand />
      <h1>Une erreur est survenue</h1>
      <p>L’opération n’a pas pu aboutir. Vos données locales restent conservées. Réessayez ou consultez le diagnostic si vous êtes administrateur.</p>
      <p><Link href="/gabon-educ/tableau-de-bord">Retour au tableau de bord</Link> · <Link href="/gabon-educ/diagnostic">Diagnostic</Link></p>
    </main>
  );
}
