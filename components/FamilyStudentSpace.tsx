"use client";

import Image from "next/image";
import { PRODUCT } from "@/lib/product-edition";
import { Bell, CalendarDays, GraduationCap, ListChecks, ListTodo, MessageCircle, Receipt, UserRoundCheck } from "lucide-react";
import { SimpleSpaceNav, type SimpleSpace } from "@/components/SpaceNavigation";
import { FamilySpaceLive } from "@/components/FamilySpaceLive";
import { ParentFinancePanel } from "@/components/finance/ParentFinancePanel";

export function FamilyStudentSpace({ space }: { space: Extract<SimpleSpace, "parent" | "student"> }) {
  const isParent = space === "parent";
  const base = isParent ? "/gabon-educ/espace-parent" : "/gabon-educ/espace-eleve";
  return (
    <main className={`family-space family-space-${space}`}>
      <header className="family-space-brandbar">
        <Image src="/branding/logo-gabon-educ-plus-v2.png" alt={`Logo ${PRODUCT.name}`} width={52} height={52} unoptimized />
        <div><b>{PRODUCT.name}</b><span>{isParent ? "Espace Parents et accompagnants" : "Espace Élèves"}</span></div>
        <Bell />
      </header>
      <SimpleSpaceNav space={space} />
      <section className="family-space-welcome">
        <div><small>{isParent ? "Suivi familial" : "Suivi personnel"}</small><h1>{isParent ? "Suivez la scolarité de vos enfants" : "Bienvenue dans votre espace scolaire"}</h1><p>Les informations visibles ici sont limitées au profil connecté.</p></div>
        {/*
          Ces vignettes ressemblaient à des boutons sans réagir au clic, et
          deux d'entre elles annonçaient des contenus inexistants. Elles
          ouvrent désormais chacune son onglet, et se limitent à ce que
          l'établissement alimente réellement.
        */}
        <div className="family-quick-cards">
          <a href={`${base}#releve-de-notes`}><ListChecks /><b>Relevé de notes</b><span>Les notes dès leur saisie</span></a>
          <a href={`${base}#bulletins`}><GraduationCap /><b>Bulletins</b><span>Moyennes, rangs et appréciations</span></a>
          <a href={`${base}#travail-a-faire`}><ListTodo /><b>Travail à faire</b><span>Les devoirs remis par les enseignants</span></a>
          <a href={`${base}#vie-scolaire`}><UserRoundCheck /><b>Vie scolaire</b><span>Absences, retards et justificatifs</span></a>
          <a href={`${base}#emploi-du-temps`}><CalendarDays /><b>Emploi du temps</b><span>Voir la semaine scolaire</span></a>
          {isParent && <a href={`${base}#messages`}><MessageCircle /><b>Messages</b><span>Informations reçues de l’établissement</span></a>}
          {isParent && <a href={`${base}#frais-de-scolarite`}><Receipt /><b>Frais de scolarité</b><span>Échéances, paiements et reçus publiés</span></a>}
        </div>
      </section>
      <div className="family-space-data"><FamilySpaceLive space={space} />{isParent && <ParentFinancePanel />}</div>
    </main>
  );
}
