"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  School,
  X,
} from "lucide-react";

type PedagogyItem = {
  label: string;
  href: string;
  external?: boolean;
};

type PedagogyGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: PedagogyItem[];
};

/**
 * Menu propre à la direction des études.
 *
 * Ces destinations existaient auparavant dans le menu de l'administration.
 * Elles sont regroupées ici sans changer leurs routes ni leurs fonctions :
 * seule leur porte d'entrée change.
 */
const pedagogyGroups: PedagogyGroup[] = [
  {
    label: "Organisation pédagogique",
    icon: School,
    items: [
      { label: "Matières et affectations", href: "/gabon-educ/matieres" },
      { label: "Emplois du temps", href: "/gabon-educ/emplois-du-temps" },
      { label: "Créer un enseignant", href: "/gabon-educ/creer-enseignant" },
    ],
  },
  {
    label: "Évaluations et bulletins",
    icon: GraduationCap,
    items: [
      { label: "Évaluations", href: "/gabon-educ/evaluations" },
      { label: "Notes et bulletins", href: "/gabon-educ/notes-bulletins?tab=reports" },
      { label: "Modèle de bulletin", href: "/gabon-educ/modele-bulletin" },
      { label: "Bulletins et publication", href: "/gabon-educ/bulletins-publication" },
    ],
  },
  {
    label: "Suivi des enseignements",
    icon: BookOpen,
    items: [
      { label: "Cahier de textes", href: "/gabon-educ/cahier-de-textes" },
      {
        label: "Progression annuelle",
        href: "/gabon-educ/cahier-de-textes/progression",
        external: true,
      },
      { label: "Fiches de préparation", href: "/gabon-educ/mes-fiches" },
    ],
  },
];

export function PedagogyMegaNav({ onLogout }: { onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOutside(event: MouseEvent | TouchEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenGroup(null);
      }
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

  return (
    <nav
      ref={navRef}
      className={mobileOpen ? "admin-meganav mobile-open" : "admin-meganav"}
      aria-label="Navigation de la pédagogie"
    >
      <button
        className="admin-meganav-toggle"
        onClick={() => setMobileOpen((value) => !value)}
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? <X /> : <Menu />} Menu Pédagogie
      </button>
      <div className="admin-meganav-inner">
        <Link className="admin-meganav-home" href="/gabon-educ/pedagogie" onClick={closeNavigation}>
          <Home />Accueil
        </Link>
        {pedagogyGroups.map((group) => {
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
                {group.items.map((item) =>
                  item.external ? (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      onClick={closeNavigation}
                    >
                      {item.label}<ExternalLink />
                    </a>
                  ) : (
                    <Link key={item.label} href={item.href} role="menuitem" onClick={closeNavigation}>
                      {item.label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          );
        })}
        <button className="admin-meganav-logout" onClick={onLogout}>
          <LogOut />Déconnexion
        </button>
      </div>
    </nav>
  );
}
