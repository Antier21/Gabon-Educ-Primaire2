import Image from "next/image";
import Link from "next/link";
import { Building2, GraduationCap, School } from "lucide-react";
import { SCHOOL_PROFILE_OPTIONS } from "@/lib/school-profiles";
import { PRODUCT, PRODUCT_EDITION } from "@/lib/product-edition";

const allGroups = [
  {
    id: "primary",
    title: "Maternelle et primaire",
    icon: School,
    description: "Tous les établissements de la Petite Section à la 5e Année.",
  },
  {
    id: "secondary",
    title: "Secondaire",
    icon: GraduationCap,
    description: "Tous les établissements du secondaire : 6e à Terminale.",
  },
] as const;

const groups = allGroups.filter(({ id }) =>
  id === PRODUCT_EDITION,
);

export default function PortalHome() {
  return (
    <main className="onboarding-home">
      <section className="onboarding-home-layout" aria-labelledby="onboarding-title">
        <div className="onboarding-logo-panel">
          <Image
            src="/branding/logo-gabon-educ-plus-v2.png"
            alt={PRODUCT.name}
            width={520}
            height={520}
            priority
            unoptimized
          />
        </div>
        <div className="onboarding-choice-card">
          <p className="portal-entry-kicker">{PRODUCT.name.toLocaleUpperCase("fr")}</p>
          <h1 id="onboarding-title">Bienvenue sur {PRODUCT.name}</h1>
          <p className="onboarding-intro">
            Édition réservée aux {PRODUCT.audience}. Poursuivez pour ouvrir le compte responsable et enregistrer l’établissement.
          </p>
          <div className="school-type-grid">
            {groups.map(({ id, title, icon: Icon, description }) => (
              <section className="school-type-panel" key={id}>
                <header>
                  <span><Icon aria-hidden="true" /></span>
                  <div>
                    <h2>{title}</h2>
                    <p>{description}</p>
                  </div>
                </header>
                <div className="school-type-buttons">
                  {SCHOOL_PROFILE_OPTIONS.filter((item) => item.group === id).map((option) => (
                    <Link
                      href={`/gabon-educ/ouvrir-compte?profile=${option.key}`}
                      key={option.key}
                      className="school-type-button"
                    >
                      <strong>Enregistrez votre établissement</strong>
                      <small>{option.description}</small>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="onboarding-existing-access">
            <Building2 aria-hidden="true" />
            <span>Un établissement déjà enregistré ?</span>
            <Link href="/gabon-educ/espaces">Accéder aux espaces de connexion</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
