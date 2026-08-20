import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3 } from "lucide-react";
import styles from "./ComingSoonModule.module.css";

type ComingSoonModuleProps = {
  title: string;
  description: string;
  features: string[];
  version?: string;
};

export function ComingSoonModule({ title, description, features, version = "0.7.0" }: ComingSoonModuleProps) {
  return (
    <main className={styles.page}>
      <header className="builder-topbar">
        <div className="builder-top-left">
          <Link className="icon-btn" href="/gabon-educ/tableau-de-bord" aria-label="Retour au tableau de bord">
            <ArrowLeft />
          </Link>
          <div>
            <small>Gabon Éduc+</small>
            <strong>{title}</strong>
          </div>
        </div>
        <Link className="btn btn-light" href="/gabon-educ/tableau-de-bord">Tableau de bord</Link>
      </header>

      <section className={styles.shell}>
        <article className={styles.hero}>
          <span className={styles.badge}><Clock3 /> En préparation</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <div className={styles.version}>Disponibilité prévue : version {version}</div>
        </article>

        <section className={styles.features}>
          <h2>Ce module permettra bientôt de :</h2>
          <div className={styles.grid}>
            {features.map((feature) => (
              <article key={feature}>
                <CheckCircle2 />
                <span>{feature}</span>
              </article>
            ))}
          </div>
        </section>

        <div className={styles.actions}>
          <Link className="btn btn-primary" href="/gabon-educ/tableau-de-bord">Retour au tableau de bord</Link>
          <Link className="btn btn-light" href="/gabon-educ/generateur-ia">Utiliser l’assistant IA</Link>
        </div>
      </section>
    </main>
  );
}
