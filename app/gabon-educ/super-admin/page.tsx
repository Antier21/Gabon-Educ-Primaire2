import Link from "next/link";
import {
  Activity,
  BellRing,
  CreditCard,
  LayoutDashboard,
  RefreshCcw,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import styles from "./super-admin.module.css";

export const metadata = { title: "Portail super administrateur | Gabon Éduc+ Service" };

const services = [
  {
    href: "/gabon-educ/centre-pilotage",
    title: "Centre de pilotage",
    description: "Vue d’ensemble des établissements clients et codes d’activation GEPS.",
    icon: LayoutDashboard,
  },
  {
    href: "/gabon-educ/service-abonnements",
    title: "Service des abonnements",
    description: "Gérer les abonnements, échéances et établissements actifs.",
    icon: CreditCard,
  },
  {
    href: "/gabon-educ/synchronisation",
    title: "Centre de synchronisation",
    description: "Suivre les opérations et la file de synchronisation de la plateforme.",
    icon: RefreshCcw,
  },
  {
    href: "/gabon-educ/journal-audit",
    title: "Journal d’audit",
    description: "Consulter les traces et événements importants de la plateforme.",
    icon: ScrollText,
  },
  {
    href: "/gabon-educ/notifications",
    title: "Service de notifications",
    description: "Suivre les notifications techniques et les envois de la plateforme.",
    icon: BellRing,
  },
  {
    href: "/gabon-educ/diagnostic",
    title: "Centre de diagnostic",
    description: "Contrôler l’état technique et identifier rapidement les anomalies.",
    icon: Activity,
  },
] as const;

export default function SuperAdminPortalPage() {
  return (
    <RequireRole superAdminOnly what="Le portail du super administrateur">
      <main className={styles.page}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.icon}><ShieldCheck aria-hidden="true" /></span>
            <div>
              <p>GABON ÉDUC+ SERVICE</p>
              <h1>Portail super administrateur</h1>
              <span>Choisissez le centre que vous souhaitez ouvrir.</span>
            </div>
          </div>
          <Link className={styles.back} href="/gabon-educ">Gabon Éduc+</Link>
        </header>

        <section className={styles.grid} aria-label="Services du super administrateur">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Link key={service.href} href={service.href} className={styles.card}>
                <span className={styles.cardIcon}><Icon aria-hidden="true" /></span>
                <div>
                  <h2>{service.title}</h2>
                  <p>{service.description}</p>
                </div>
                <span className={styles.open}>Ouvrir →</span>
              </Link>
            );
          })}
        </section>
      </main>
    </RequireRole>
  );
}
