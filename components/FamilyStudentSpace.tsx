"use client";

import Image from "next/image";
import { PRODUCT } from "@/lib/product-edition";
import { Bell, BookOpen, CalendarDays, FileText, GraduationCap, MessageCircle, UserRoundCheck } from "lucide-react";
import { SimpleSpaceNav, type SimpleSpace } from "@/components/SpaceNavigation";
import { FamilySpaceLive } from "@/components/FamilySpaceLive";

export function FamilyStudentSpace({ space }: { space: Extract<SimpleSpace, "parent" | "student"> }) {
  const isParent = space === "parent";
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
        <div className="family-quick-cards">
          <article><GraduationCap /><b>Résultats</b><span>Consulter les notes et bulletins</span></article>
          <article><CalendarDays /><b>Emploi du temps</b><span>Voir la semaine scolaire</span></article>
          <article><BookOpen /><b>Cahiers de texte</b><span>Travail et leçons</span></article>
          <article><UserRoundCheck /><b>Vie scolaire</b><span>Présences et informations</span></article>
          <article><FileText /><b>Documents</b><span>Documents autorisés</span></article>
          <article><MessageCircle /><b>Communication</b><span>Échanges avec l’établissement</span></article>
        </div>
      </section>
      <div className="family-space-data"><FamilySpaceLive space={space} /></div>
    </main>
  );
}
