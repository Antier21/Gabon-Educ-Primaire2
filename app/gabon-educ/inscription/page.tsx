import Link from "next/link";
import { Brand } from "@/components/Brand";
import { AuthForm } from "@/components/AuthForm";
import { getDefaultSchoolProfile, getSchoolProfileByKey } from "@/lib/school-profiles";
import { RequireRole } from "@/components/RequireRole";
import { SECRETARIAT_ROLES } from "@/lib/roles/page-policies";

type Props = { searchParams: Promise<{ profile?: string }> };

export default async function Signup({ searchParams }: Props) {
  const params = await searchParams;
  const profile = getSchoolProfileByKey(params?.profile) || getDefaultSchoolProfile();
  const profileKey = profile.key;
  const profileLabel = profile.label;

  return (
    <RequireRole allow={SECRETARIAT_ROLES} what="L’inscription">
    <main className="auth-page">
      <section className="auth-aside">
        <Brand />
        <div>
          <span className="eyebrow light">Ouverture de compte</span>
          <h1>Créez le compte responsable de votre établissement.</h1>
          <p>
            Profil choisi : <strong>{profileLabel}</strong>. Après cette étape, vous enregistrerez officiellement les informations de l’établissement.
          </p>
        </div>
        <small>Compte responsable · Enregistrement établissement · Connexion administration</small>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <Link className="back" href={`/gabon-educ/ouvrir-compte?profile=${profileKey}`}>← Retour à l’ouverture de compte</Link>
          <h2>Créer le compte responsable</h2>
          <p>Ce compte servira à finaliser l’enregistrement et à accéder au tableau de bord Administration.</p>
          <AuthForm
            mode="signup"
            redirectTo={`/gabon-educ/enregistrer-etablissement?profile=${profileKey}`}
            signupRedirectTo={`/gabon-educ/enregistrer-etablissement?profile=${profileKey}`}
            demoRole="school_admin"
            demoName="Responsable Établissement"
            defaultSchoolType={profile.schoolType}
            defaultSchoolSector={profile.schoolSector}
            selectedSchoolProfileLabel={profileLabel}
          />
        </div>
      </section>
    </main>
    </RequireRole>
  );
}
