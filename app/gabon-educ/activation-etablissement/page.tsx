import Link from "next/link";
import { Building2, KeyRound, ShieldCheck } from "lucide-react";
import { SchoolActivationForm } from "@/components/SchoolActivationForm";
import { getDefaultSchoolProfile, getSchoolProfileByKey } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";
import styles from "./page.module.css";

type Props = { searchParams: Promise<{ profile?: string; expired?: string }> };

export default async function SchoolActivationPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = getSchoolProfileByKey(params?.profile) || getDefaultSchoolProfile();

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="school-activation-title">
        <div className={styles.brandRow}>
          <Link href="/gabon-educ" className={styles.back}>← Retour à l’accueil</Link>
          <span className={styles.brand}>{PRODUCT.name}</span>
        </div>

        <div className={styles.card}>
          <aside className={styles.securityPanel}>
            <div className={styles.shield}><ShieldCheck aria-hidden="true" /></div>
            <p className={styles.kicker}>Activation sécurisée</p>
            <h1 id="school-activation-title">Votre établissement a-t-il été autorisé par GEPS ?</h1>
            <p className={styles.lead}>
              La création d’un nouvel établissement dans {PRODUCT.name} est désormais réservée aux structures disposant d’un code d’activation délivré par Gabon Éduc Plus Service.
            </p>

            <div className={styles.points}>
              <div><KeyRound aria-hidden="true" /><span><strong>Code personnel</strong><small>Délivré par le super administrateur GEPS.</small></span></div>
              <div><Building2 aria-hidden="true" /><span><strong>Lié à un établissement</strong><small>Le code identifie la structure autorisée.</small></span></div>
              <div><ShieldCheck aria-hidden="true" /><span><strong>Usage contrôlé</strong><small>Expiration, révocation et nombre d’utilisations sont vérifiés côté serveur.</small></span></div>
            </div>
          </aside>

          <div className={styles.formPanel}>
            <div className={styles.formHeading}>
              <span>Étape 1 sur 3</span>
              <h2>Activation de votre établissement</h2>
              <p>Entrez le code reçu de GEPS. Après validation, vous pourrez ouvrir le compte du responsable puis enregistrer l’établissement.</p>
            </div>

            {params?.expired === "1" && (
              <p className={styles.expired}>Votre autorisation précédente a expiré. Saisissez de nouveau un code valide.</p>
            )}

            <SchoolActivationForm profileKey={profile.key} profileLabel={profile.label} />

            <div className={styles.help}>
              <strong>Vous n’avez pas de code ?</strong>
              <p>Contactez Gabon Éduc Plus Service afin qu’un code d’activation soit créé pour votre établissement.</p>
            </div>

            <Link href="/gabon-educ/espaces" className={styles.existingAccess}>
              Établissement déjà enregistré ? Accéder aux espaces de connexion
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
