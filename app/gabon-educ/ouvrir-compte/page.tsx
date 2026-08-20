import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, UserPlus } from "lucide-react";
import { getDefaultSchoolProfile, getSchoolProfileByKey } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";

type Props = { searchParams: Promise<{ profile?: string }> };

export default async function OpenAccountPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = getSchoolProfileByKey(params?.profile) || getDefaultSchoolProfile();
  const profileKey = profile.key;
  const profileLabel = profile.label;

  return (
    <main className="account-opening-page">
      <section className="account-opening-card" aria-labelledby="account-opening-title">
        <Link className="back" href="/gabon-educ">← Modifier le type d’établissement</Link>
        <p className="portal-entry-kicker">{PRODUCT.name.toLocaleUpperCase("fr")}</p>
        <h1 id="account-opening-title">Ouvrir un compte</h1>
        <p className="account-opening-profile">Profil sélectionné : <strong>{profileLabel}</strong></p>
        <div className="account-opening-panel">
          <UserPlus aria-hidden="true" />
          <h2>Informations d’ouverture de compte</h2>
          <p>
            Le compte sera celui du directeur, du fondateur ou du responsable habilité à enregistrer l’établissement dans {PRODUCT.name}.
          </p>
        </div>
        <div className="account-opening-steps" aria-label="Étapes d’inscription">
          <span><CheckCircle2 /> 1. Créer le compte responsable</span>
          <span><FileText /> 2. Enregistrer l’établissement</span>
          <span><ArrowRight /> 3. Se connecter au tableau de bord Administration</span>
        </div>
        <Link className="btn btn-primary btn-large full" href={`/gabon-educ/inscription?profile=${profileKey}`}>
          Continuer vers l’ouverture du compte
        </Link>
      </section>
    </main>
  );
}
