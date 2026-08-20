"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen, BriefcaseBusiness, ChevronDown, ClipboardCheck, ExternalLink, GraduationCap,
  HeartPulse, Home, Library, LogOut, Menu, MessageCircle, NotebookPen,
  School, ShieldCheck, UserRound, Users, WalletCards, X
} from "lucide-react";

type NavItem = { label: string; href: string; external?: boolean };
type AdminGroup = { label: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[] };

const adminGroups: AdminGroup[] = [
  {
    label: "Direction et secrétariat",
    icon: ShieldCheck,
    items: [
      { label: "Direction", href: "/gabon-educ/administration" },
      { label: "Personnel", href: "/gabon-educ/personnel" },
      { label: "Emplois du temps — conception", href: "/gabon-educ/emplois-du-temps" },
      { label: "Scolarité", href: "/gabon-educ/eleves" },
      { label: "Gestion des classes", href: "/gabon-educ/classes" },
      { label: "Inscriptions", href: "/gabon-educ/inscriptions" },
      { label: "Communication", href: "/gabon-educ/annonces" },
      { label: "Abonnement et licence", href: "/gabon-educ/abonnement" },
    ],
  },
  {
    label: "Pédagogie / Vie scolaire",
    icon: GraduationCap,
    items: [
      { label: "Emplois du temps — production", href: "/gabon-educ/emplois-du-temps" },
      { label: "Créer un enseignant", href: "/gabon-educ/creer-enseignant" },
      { label: "Évaluations", href: "/gabon-educ/evaluations" },
      { label: "Bulletins", href: "/gabon-educ/notes-bulletins?tab=reports" },
      { label: "Concours", href: "/gabon-educ/modules/concours" },
      { label: "Surveillance — activité", href: "/gabon-educ/assiduite" },
      { label: "Vie scolaire", href: "/gabon-educ/assiduite" },
    ],
  },
  {
    label: "Santé / Orientation / Accompagnement",
    icon: HeartPulse,
    items: [
      { label: "Consultations", href: "/gabon-educ/modules/consultations" },
      { label: "Infirmerie", href: "/gabon-educ/modules/infirmerie" },
      { label: "Information et orientation", href: "/gabon-educ/modules/orientation" },
      { label: "Sorties scolaires", href: "/gabon-educ/modules/sorties-scolaires" },
    ],
  },
  {
    label: "Ressources humaines",
    icon: BriefcaseBusiness,
    items: [
      { label: "Dossiers du personnel", href: "/gabon-educ/personnel" },
      { label: "Surveillants — gestion du personnel", href: "/gabon-educ/personnel" },
      { label: "Personnel du secrétariat", href: "/gabon-educ/personnel" },
      { label: "Personnel de direction", href: "/gabon-educ/personnel" },
    ],
  },
  {
    label: "Comptabilité",
    icon: WalletCards,
    items: [
      { label: "Inscriptions", href: "/gabon-educ/inscription" },
      { label: "Vacations", href: "/gabon-educ/modules/vacations" },
      { label: "Salaires", href: "/gabon-educ/modules/salaires" },
      { label: "Gestion des stocks", href: "/gabon-educ/modules/gestion-stocks" },
    ],
  },
  {
    label: "Ressources numériques et documentaires",
    icon: Library,
    items: [
      { label: "Bibliothèque", href: "/gabon-educ/modules/bibliotheque" },
      { label: "Service informatique", href: "/gabon-educ/modules/service-informatique" },
      { label: "Cahiers de textes", href: "/gabon-educ/mes-fiches" },
    ],
  },
];

export function AdminMegaNav({ onLogout }: { onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function onOutside(event: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenGroup(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("touchstart", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("touchstart", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <nav ref={navRef} className={mobileOpen ? "admin-meganav mobile-open" : "admin-meganav"} aria-label="Navigation de l’administration">
      <button className="admin-meganav-toggle" onClick={() => setMobileOpen(value => !value)} aria-expanded={mobileOpen}>
        {mobileOpen ? <X /> : <Menu />} Menu de l’administration
      </button>
      <div className="admin-meganav-inner">
        <Link className="admin-meganav-home" href="/gabon-educ/administration"><Home />Accueil</Link>
        {adminGroups.map(group => {
          const Icon = group.icon;
          const isOpen = openGroup === group.label;
          return (
            <div className={isOpen ? "admin-nav-group open" : "admin-nav-group"} key={group.label} onMouseEnter={() => setOpenGroup(group.label)} onMouseLeave={() => setOpenGroup(null)}>
              <button onClick={() => setOpenGroup(isOpen ? null : group.label)} aria-expanded={isOpen}>
                <Icon className="admin-nav-group-icon" />
                <span>{group.label}</span>
                <ChevronDown className="admin-nav-chevron" />
              </button>
              <div className="admin-nav-dropdown" role="menu">
                {group.items.map(item => <Link key={`${group.label}-${item.label}`} href={item.href} role="menuitem" onClick={() => { setOpenGroup(null); setMobileOpen(false); }}>{item.label}</Link>)}
              </div>
            </div>
          );
        })}
        <button className="admin-meganav-logout" onClick={onLogout}><LogOut />Déconnexion</button>
      </div>
    </nav>
  );
}

export type SimpleSpace = "teacher" | "parent" | "student";

const simpleNav: Record<SimpleSpace, NavItem[]> = {
  teacher: [
    { label: "Accueil", href: "/gabon-educ/tableau-de-bord" },
    { label: "Voir mes classes", href: "/gabon-educ/mes-classes" },
    { label: "Cahiers de texte", href: "/gabon-educ/mes-fiches" },
    { label: "Notes", href: "/gabon-educ/notes" },
    { label: "Bulletins", href: "/gabon-educ/bulletins" },
    { label: "Ressources", href: "/gabon-educ/documents" },
    { label: "Cahiers d’appel", href: "/gabon-educ/assiduite" },
    { label: "Vie scolaire", href: "/gabon-educ/assiduite" },
    { label: "Communication", href: "/gabon-educ/notifications" },
  ],
  parent: [
    { label: "Mes données", href: "/gabon-educ/espace-parent" },
    { label: "Cahiers de texte", href: "/gabon-educ/modules/parent-cahiers-textes" },
    { label: "Évaluations", href: "/gabon-educ/modules/parent-evaluations" },
    { label: "Notes", href: "/gabon-educ/modules/parent-notes" },
    { label: "Résultats", href: "/gabon-educ/modules/parent-resultats" },
    { label: "Bulletins", href: "/gabon-educ/modules/parent-bulletins" },
    { label: "Emploi du temps", href: "/gabon-educ/modules/parent-emploi-du-temps" },
    { label: "Vie scolaire", href: "/gabon-educ/modules/parent-vie-scolaire" },
    { label: "Communication", href: "/gabon-educ/modules/parent-communication" },
  ],
  student: [
    { label: "Mes données", href: "/gabon-educ/espace-eleve" },
    { label: "Cahiers de texte", href: "/gabon-educ/modules/eleve-cahiers-textes" },
    { label: "Évaluations", href: "/gabon-educ/modules/eleve-evaluations" },
    { label: "Notes", href: "/gabon-educ/modules/eleve-notes" },
    { label: "Résultats", href: "/gabon-educ/modules/eleve-resultats" },
    { label: "Bulletins", href: "/gabon-educ/modules/eleve-bulletins" },
    { label: "Emploi du temps", href: "/gabon-educ/modules/eleve-emploi-du-temps" },
    { label: "Vie scolaire", href: "/gabon-educ/modules/eleve-vie-scolaire" },
    { label: "Communication", href: "/gabon-educ/modules/eleve-communication" },
  ],
};

const simpleIcons = [Home, Users, NotebookPen, BookOpen, ClipboardCheck, GraduationCap, BookOpen, School, UserRound, MessageCircle];

export function SimpleSpaceNav({ space, onLogout }: { space: SimpleSpace; onLogout?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className={`space-topnav space-topnav-${space} ${open ? "open" : ""}`} aria-label={`Navigation espace ${space}`}>
      <button className="space-topnav-toggle" onClick={() => setOpen(value => !value)}>{open ? <X /> : <Menu />} Menu</button>
      <div className="space-topnav-links">
        {simpleNav[space].map((item, index) => {
          const Icon = simpleIcons[index] || BookOpen;
          return item.external ? (
            <a href={item.href} key={item.label} onClick={() => setOpen(false)} target="_blank" rel="noopener noreferrer" className="apc-nav-link"><Icon />{item.label}<ExternalLink /></a>
          ) : (
            <Link href={item.href} key={item.label} onClick={() => setOpen(false)}><Icon />{item.label}</Link>
          );
        })}
        {onLogout && <button onClick={onLogout}><LogOut />Déconnexion</button>}
      </div>
    </nav>
  );
}
