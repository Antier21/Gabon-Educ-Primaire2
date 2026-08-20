import Link from "next/link";
import { SchoolRegistrationForm } from "@/components/SchoolRegistrationForm";
import { getDefaultSchoolProfile, getSchoolProfileByKey } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";

type Props = { searchParams: Promise<{ profile?: string }> };

export default async function RegisterSchoolPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = getSchoolProfileByKey(params?.profile) || getDefaultSchoolProfile();
  const profileKey = profile.key;

  return (
    <main className="register-school-page">
      <section className="register-school-shell" aria-labelledby="register-school-title">
        <Link className="back" href={`/gabon-educ/inscription?profile=${profileKey}`}>← Retour au compte</Link>
        <p className="portal-entry-kicker">{PRODUCT.name.toLocaleUpperCase("fr")}</p>
        <h1 id="register-school-title">Enregistrez votre établissement</h1>
        <p className="register-school-intro">
          Ces informations configurent {PRODUCT.name} : identité, profil scolaire et niveaux proposés dans les classes.
        </p>
        <SchoolRegistrationForm profileKey={profileKey} />
      </section>
    </main>
  );
}
