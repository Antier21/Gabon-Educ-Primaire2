import Image from "next/image";
import Link from "next/link";
import {
  BriefcaseBusiness,
  GraduationCap,
  HeartHandshake,
  ShieldCheck,
  UserRound,
} from "lucide-react";

const spaces = [
  {
    label: "Direction / Administration",
    description: "Direction, secrétariat, gestion et pilotage",
    href: "/gabon-educ/connexion-administration",
    icon: ShieldCheck,
  },
  {
    label: "Enseignants",
    description: "Cours, classes, notes et suivi pédagogique",
    href: "/gabon-educ/connexion",
    icon: GraduationCap,
  },
  {
    label: "Vie scolaire",
    description: "Présences, retards, discipline et surveillance",
    href: "/gabon-educ/connexion-vie-scolaire",
    icon: BriefcaseBusiness,
  },
  {
    label: "Parents et accompagnants",
    description: "Suivi de l’élève et échanges avec l’établissement",
    href: "/gabon-educ/connexion-parents",
    icon: HeartHandshake,
  },
  {
    label: "Élèves",
    description: "Résultats, documents et activités scolaires",
    href: "/gabon-educ/connexion-eleves",
    icon: UserRound,
  },
];

export default function PortalHome() {
  return (
    <main className="portal-entry-page">
      <section className="portal-entry-layout" aria-labelledby="portal-title">
        <div className="portal-entry-logo-panel">
          <Image
            className="portal-entry-logo"
            src="/branding/logo-gabon-educ-plus-v2.png"
            alt="Gabon Éduc+"
            width={560}
            height={560}
            priority
          />
        </div>

        <div className="portal-entry-shell">
          <p className="portal-entry-kicker">GABON ÉDUC+ SERVICE</p>
          <h1 id="portal-title">Choisissez votre espace</h1>
          <p className="portal-entry-intro">
            Cliquez sur votre profil pour accéder à la page de connexion correspondante.
          </p>
          <nav className="portal-role-list" aria-label="Choix de l’espace utilisateur">
            {spaces.map(({ label, description, href, icon: Icon }) => (
              <Link className="portal-role-link" href={href} key={label}>
                <span className="portal-role-icon"><Icon /></span>
                <span className="portal-role-copy">
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <span className="portal-role-arrow" aria-hidden="true">›</span>
              </Link>
            ))}
          </nav>

          <p className="portal-entry-help">
            En cas de doute, adressez-vous au secrétariat ou à l’administrateur de votre établissement.
          </p>
        </div>
      </section>
    </main>
  );
}
