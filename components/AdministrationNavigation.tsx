"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  HeartPulse,
  Home,
  Library,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";

type NavItem = { label: string; href: string };
type NavGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const administrationGroups: NavGroup[] = [
  {
    label: "Finances scolaires",
    icon: Banknote,
    items: [
      { label: "Comptabilité et frais de scolarité", href: "/gabon-educ/comptabilite" },
    ],
  },
  {
    label: "Direction et secrétariat",
    icon: ShieldCheck,
    items: [
      { label: "Direction", href: "/gabon-educ/administration" },
      { label: "Scolarité", href: "/gabon-educ/eleves" },
      { label: "Inscriptions", href: "/gabon-educ/inscriptions" },
      { label: "Gestion des classes", href: "/gabon-educ/classes" },
      { label: "Parents et responsables", href: "/gabon-educ/parents" },
      { label: "Dossiers du personnel", href: "/gabon-educ/personnel" },
      { label: "Documents et attestations", href: "/gabon-educ/documents" },
      { label: "Messages aux parents (WhatsApp)", href: "/gabon-educ/communication" },
      { label: "Annonces", href: "/gabon-educ/annonces" },
      { label: "Comptes et identifiants", href: "/gabon-educ/utilisateurs" },
      { label: "Abonnement et licence", href: "/gabon-educ/abonnement" },
    ],
  },
  {
    label: "Vie scolaire",
    icon: HeartPulse,
    items: [
      { label: "Absences et retards", href: "/gabon-educ/assiduite" },
    ],
  },
  {
    label: "Administration du logiciel",
    icon: BriefcaseBusiness,
    items: [
      { label: "Établissement", href: "/gabon-educ/etablissement" },
      { label: "Synchronisation", href: "/gabon-educ/synchronisation" },
      { label: "Import et export", href: "/gabon-educ/import-export" },
      { label: "Journal d’audit", href: "/gabon-educ/journal-audit" },
      { label: "Diagnostic", href: "/gabon-educ/diagnostic" },
    ],
  },
  {
    label: "Modules à venir",
    icon: Library,
    items: [
      { label: "Paie, santé, bibliothèque…", href: "/gabon-educ/modules-a-venir" },
    ],
  },
];

export function AdministrationMegaNav({ onLogout }: { onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOutside(event: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenGroup(null);
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenGroup(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("touchstart", closeOutside);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("touchstart", closeOutside);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, []);

  function closeNavigation() {
    setOpenGroup(null);
    setMobileOpen(false);
  }

  function renderGroup(group: NavGroup) {
    const Icon = group.icon;
    const isOpen = openGroup === group.label;
    return (
      <div
        className={isOpen ? "admin-nav-group open" : "admin-nav-group"}
        key={group.label}
        onMouseEnter={() => setOpenGroup(group.label)}
        onMouseLeave={() => setOpenGroup(null)}
      >
        <button
          type="button"
          onClick={() => setOpenGroup(isOpen ? null : group.label)}
          aria-expanded={isOpen}
        >
          <Icon className="admin-nav-group-icon" />
          <span>{group.label}</span>
          <ChevronDown className="admin-nav-chevron" />
        </button>
        <div className="admin-nav-dropdown" role="menu">
          {group.items.map((item) => (
            <Link key={item.label} href={item.href} role="menuitem" onClick={closeNavigation}>
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <nav
      ref={navRef}
      className={mobileOpen ? "admin-meganav mobile-open" : "admin-meganav"}
      aria-label="Navigation de l’administration"
    >
      <button
        className="admin-meganav-toggle"
        onClick={() => setMobileOpen((value) => !value)}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X /> : <Menu />} Menu de l’administration
      </button>
      <div className="admin-meganav-inner">
        <Link className="admin-meganav-home" href="/gabon-educ/administration" onClick={closeNavigation}>
          <Home />Accueil
        </Link>
        <Link className="admin-meganav-home" href="/gabon-educ/pedagogie" onClick={closeNavigation}>
          <GraduationCap />Pédagogie
        </Link>
        {administrationGroups.slice(0, 2).map(renderGroup)}
        <Link
          className="admin-meganav-home"
          href="/gabon-educ/emplois-du-temps"
          onClick={closeNavigation}
          aria-label="EDT — Emplois du temps"
          style={{ backgroundColor: "#FF2400", color: "#fff", fontWeight: 900 }}
        >
          <CalendarDays />EDT
        </Link>
        {administrationGroups.slice(2).map(renderGroup)}
        <button className="admin-meganav-logout" onClick={onLogout}>
          <LogOut />Déconnexion
        </button>
      </div>
    </nav>
  );
}
