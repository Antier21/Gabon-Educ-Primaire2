import Link from "next/link";
import { SchoolRegistrationForm } from "@/components/SchoolRegistrationForm";
import { getDefaultSchoolProfile, getSchoolProfileByKey } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";
import styles from "./page.module.css";

type Props = { searchParams: Promise<{ profile?: string }> };

export default async function RegisterSchoolPage({ searchParams }: Props) {
  const params = await searchParams;
  const profile = getSchoolProfileByKey(params?.profile) || getDefaultSchoolProfile();
  const profileKey = profile.key;

  return (
    <main className={styles.page}>
      <section className={styles.shell} aria-labelledby="register-school-title">
        <header className={styles.topbar}>
          <Link className={styles.backLink} href={`/gabon-educ/inscription?profile=${profileKey}`}>
            <span className={styles.backIcon} aria-hidden="true">←</span>
            Retour au compte
          </Link>

          <div className={styles.brand} aria-label={PRODUCT.name}>
            <span className={styles.brandMark} aria-hidden="true">GE+</span>
            <span className={styles.brandCopy}>
              <strong>{PRODUCT.name}</strong>
              <small>Configuration établissement</small>
            </span>
          </div>
        </header>

        <div className={styles.contentGrid}>
          <aside className={styles.introPanel}>
            <p className={styles.kicker}>Votre espace scolaire</p>
            <h1 id="register-school-title">Enregistrez votre établissement</h1>
            <p className={styles.lead}>
              Quelques informations suffisent pour préparer un espace {PRODUCT.name} adapté à votre établissement et à ses niveaux d’enseignement.
            </p>

            <div className={styles.steps} aria-label="Étapes de configuration">
              <div className={styles.step}>
                <span className={styles.stepNumber}>01</span>
                <span className={styles.stepText}>
                  <strong>Identifiez l’établissement</strong>
                  <span>Nom, responsable et coordonnées.</span>
                </span>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>02</span>
                <span className={styles.stepText}>
                  <strong>Préparez l’année scolaire</strong>
                  <span>Les niveaux correspondant au profil sont créés.</span>
                </span>
              </div>
              <div className={styles.step}>
                <span className={styles.stepNumber}>03</span>
                <span className={styles.stepText}>
                  <strong>Accédez à l’administration</strong>
                  <span>Vous pourrez ensuite compléter la configuration.</span>
                </span>
              </div>
            </div>

            <p className={styles.reassurance}>
              <strong>Une configuration simple et guidée.</strong><br />
              Vous pourrez modifier et compléter les informations de l’établissement depuis les paramètres de votre espace.
            </p>
          </aside>

          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <span>Étape de configuration</span>
              <h2>Informations de l’établissement</h2>
              <p>Renseignez les informations essentielles. Les champs facultatifs pourront être complétés plus tard.</p>
            </div>
            <SchoolRegistrationForm profileKey={profileKey} />
          </div>
        </div>
      </section>
    </main>
  );
}
