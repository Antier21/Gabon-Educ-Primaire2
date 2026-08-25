"use client";

import Link from "next/link";
import { ArrowLeft, BookMarked, Bus, Compass, HeartPulse, Laptop, Package, Stethoscope, Trophy, Wallet } from "lucide-react";
import { AdminMegaNav } from "@/components/SpaceNavigation";
import { Brand } from "@/components/Brand";
import styles from "./UpcomingModules.module.css";

/**
 * Feuille de route des modules non réalisés.
 *
 * Ces dix modules figuraient au menu de l'administration comme s'ils
 * existaient. Chacun ouvrait une page « Ce module est prévu… » : un directeur
 * en démonstration tombait dessus au premier clic curieux, et la promesse non
 * tenue coûtait plus cher que l'absence.
 *
 * Ils sont réunis ici, à une seule entrée de menu, et présentés pour ce qu'ils
 * sont : un programme, pas une fonction. Promettre moins et tenir tout inspire
 * davantage confiance — et cette page reste utile en clientèle, quand un chef
 * d'établissement demande si le logiciel gérera un jour la paie.
 */

type Module = {
  nom: string;
  icone: React.ComponentType<{ className?: string }>;
  domaine: string;
  description: string;
  /** Ce que le module devra faire, en termes concrets pour l'établissement. */
  attendu: string[];
};

const MODULES: Module[] = [
  {
    nom: "Comptabilité et frais de scolarité",
    icone: Wallet,
    domaine: "Comptabilité",
    description:
      "Le module le plus attendu d'un établissement privé, et celui qui manque le plus aujourd'hui.",
    attendu: [
      "Encaissement des frais d'inscription et de scolarité",
      "Reçus numérotés et remis à la famille",
      "Suivi des impayés par classe et par élève",
      "États de caisse pour la direction",
    ],
  },
  {
    nom: "Salaires",
    icone: Wallet,
    domaine: "Comptabilité",
    description: "La paie du personnel enseignant et administratif.",
    attendu: [
      "Fiches de paie mensuelles",
      "Retenues et cotisations",
      "Historique par membre du personnel",
    ],
  },
  {
    nom: "Vacations",
    icone: Wallet,
    domaine: "Comptabilité",
    description: "La rémunération des heures assurées hors service statutaire.",
    attendu: [
      "Déclaration des heures effectuées",
      "Validation par la direction",
      "Report vers la paie",
    ],
  },
  {
    nom: "Gestion des stocks",
    icone: Package,
    domaine: "Intendance",
    description: "Fournitures, manuels et matériel de l'établissement.",
    attendu: [
      "Entrées et sorties de matériel",
      "Seuils d'alerte",
      "Inventaire de fin d'année",
    ],
  },
  {
    nom: "Bibliothèque",
    icone: BookMarked,
    domaine: "Ressources documentaires",
    description: "Le fonds documentaire et les emprunts.",
    attendu: [
      "Catalogue des ouvrages",
      "Prêts et retours par élève",
      "Relances des retards",
    ],
  },
  {
    nom: "Infirmerie",
    icone: Stethoscope,
    domaine: "Santé scolaire",
    description: "Le registre des passages et des soins.",
    attendu: [
      "Registre des passages à l'infirmerie",
      "Traitements en cours et allergies signalées",
      "Information des responsables",
    ],
  },
  {
    nom: "Consultations",
    icone: HeartPulse,
    domaine: "Santé scolaire",
    description: "Le suivi médical et psychologique des élèves.",
    attendu: [
      "Rendez-vous et comptes rendus",
      "Confidentialité stricte, réservée au personnel de santé",
    ],
  },
  {
    nom: "Information et orientation",
    icone: Compass,
    domaine: "Accompagnement",
    description: "L'accompagnement des élèves dans leurs choix scolaires.",
    attendu: [
      "Entretiens d'orientation",
      "Vœux et décisions du conseil",
      "Suivi après la sortie",
    ],
  },
  {
    nom: "Sorties scolaires",
    icone: Bus,
    domaine: "Vie scolaire",
    description: "L'organisation des sorties et des voyages.",
    attendu: [
      "Autorisations parentales",
      "Listes de participants et encadrants",
      "Budget de la sortie",
    ],
  },
  {
    nom: "Concours scolaires",
    icone: Trophy,
    domaine: "Pédagogie",
    description: "Les compositions et concours internes ou inter-établissements.",
    attendu: [
      "Inscription des candidats",
      "Saisie et classement des résultats",
      "Palmarès imprimable",
    ],
  },
  {
    nom: "Service informatique",
    icone: Laptop,
    domaine: "Intendance",
    description: "Le parc matériel et les incidents techniques.",
    attendu: [
      "Inventaire des postes et équipements",
      "Signalement et suivi des pannes",
    ],
  },
];

export function UpcomingModules({ onLogout }: { onLogout?: () => void }) {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className="icon-btn" href="/gabon-educ/administration" aria-label="Retour">
          <ArrowLeft />
        </Link>
        <Brand />
        <div>
          <b>Modules à venir</b>
          <small>Ce que Gabon Éduc+ ne fait pas encore</small>
        </div>
      </header>

      <AdminMegaNav onLogout={onLogout || (() => {})} />

      <section className={styles.intro}>
        <p className={styles.kicker}>Feuille de route</p>
        <h1>Onze modules prévus, aucun encore réalisé</h1>
        <p className={styles.lede}>
          Ces modules figurent dans l’architecture de Gabon Éduc+ mais ne sont pas construits. Ils sont
          présentés ici plutôt que dispersés dans les menus, pour qu’aucune entrée ne promette une
          fonction qui n’existe pas.
        </p>
        <p className={styles.note}>
          Ce que l’application fait aujourd’hui — inscriptions, classes, notes, bulletins, espaces
          familles, messages aux parents — fonctionne et a été éprouvé. Cette page dit le reste.
        </p>
      </section>

      <section className={styles.grid}>
        {MODULES.map((module) => {
          const Icone = module.icone;
          return (
            <article key={module.nom} className={styles.card}>
              <header>
                <span className={styles.icon}><Icone /></span>
                <div>
                  <b>{module.nom}</b>
                  <small>{module.domaine}</small>
                </div>
              </header>
              <p className={styles.description}>{module.description}</p>
              <ul>
                {module.attendu.map((ligne) => (
                  <li key={ligne}>{ligne}</li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>
    </main>
  );
}
