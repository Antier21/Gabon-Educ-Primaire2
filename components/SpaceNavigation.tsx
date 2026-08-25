"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen, BriefcaseBusiness, CalendarDays, ChevronDown, ClipboardCheck, ExternalLink,
  GraduationCap, HeartPulse, Home, Library, LogOut, Menu, MessageCircle, NotebookPen,
  PenLine, Printer, School, ShieldCheck, UserRound, Users, X, PhoneCall} from "lucide-react";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { homeForRole, resolveMyRoles } from "@/lib/roles/current-role";
import type { SchoolRole } from "@/lib/platform/types";

/**
 * `hiddenFor` retire une entrée à certains rôles.
 *
 * Le choix est de masquer plutôt que de griser : une porte visible qu'on
 * ouvre pour se voir refuser l'entrée est plus décourageante qu'une porte
 * absente, et elle donne au passage une fausse idée de l'organigramme.
 */
type NavItem = { label: string; href: string; external?: boolean; hiddenFor?: SchoolRole[] };
type AdminGroup = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  hiddenFor?: SchoolRole[];
};

/**
 * Menu de l'administration.
 *
 * Il annonçait vingt-neuf entrées pour dix-sept destinations réelles. Trois
 * défauts s'y étaient accumulés :
 *
 *   — dix entrées ouvraient une page « Ce module est prévu… ». Elles sont
 *     réunies sous « Modules à venir », qui les présente pour ce qu'elles
 *     sont : un programme, pas une fonction ;
 *
 *   — « Comptabilité → Inscriptions » menait à la création d'un NOUVEL
 *     ÉTABLISSEMENT, pas aux inscriptions d'élèves. Un secrétaire cherchant à
 *     inscrire un enfant arrivait sur un formulaire d'ouverture de compte
 *     école ;
 *
 *   — sept entrées faisaient doublon : quatre libellés différents pour la même
 *     page du personnel, deux pour les emplois du temps, deux pour la vie
 *     scolaire. Un menu qui nomme quatre fois la même porte fait douter de
 *     toutes les autres.
 *
 * Chaque entrée mène désormais à une destination distincte et réelle.
 */
const adminGroups: AdminGroup[] = [
  {
    label: "Direction et secrétariat",
    icon: ShieldCheck,
    items: [
      // Le tableau de pilotage de la direction. Le secrétariat possède son
      // propre bureau, atteint par « Accueil » : lui proposer en plus l'écran
      // du chef d'établissement l'envoyait sur des indicateurs qui ne sont pas
      // les siens.
      { label: "Direction", href: "/gabon-educ/administration", hiddenFor: ["secretary"] },
      { label: "Scolarité", href: "/gabon-educ/eleves" },
      { label: "Inscriptions", href: "/gabon-educ/inscriptions" },
      { label: "Gestion des classes", href: "/gabon-educ/classes" },
      { label: "Parents et responsables", href: "/gabon-educ/parents" },
      { label: "Dossiers du personnel", href: "/gabon-educ/personnel" },
      { label: "Documents et attestations", href: "/gabon-educ/documents" },
      // Deux entrées distinctes : les annonces s'affichent dans l'application,
      // les messages partent sur le téléphone des parents. Les confondre sous
      // un même intitulé « Communication » rendait le second introuvable.
      { label: "Messages aux parents (WhatsApp)", href: "/gabon-educ/communication" },
      { label: "Annonces", href: "/gabon-educ/annonces" },
      // Le secrétariat inscrit, met à jour et communique, mais ne distribue pas
      // les accès et ne touche pas au contrat : ouvrir un compte, c'est décider
      // qui voit quoi dans l'établissement, et cela reste une décision de
      // direction.
      { label: "Comptes et identifiants", href: "/gabon-educ/utilisateurs", hiddenFor: ["secretary"] },
      { label: "Abonnement et licence", href: "/gabon-educ/abonnement", hiddenFor: ["secretary"] },
    ],
  },
  {
    label: "Pédagogie",
    icon: GraduationCap,
    items: [
      { label: "Matières et affectations", href: "/gabon-educ/matieres" },
      { label: "Emplois du temps", href: "/gabon-educ/emplois-du-temps" },
      { label: "Créer un enseignant", href: "/gabon-educ/creer-enseignant" },
      { label: "Évaluations", href: "/gabon-educ/evaluations" },
      { label: "Notes et bulletins", href: "/gabon-educ/notes-bulletins?tab=reports" },
      { label: "Modèle de bulletin", href: "/gabon-educ/modele-bulletin" },
      { label: "Cahiers de texte", href: "/gabon-educ/mes-fiches" },
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
      { label: "Établissement", href: "/gabon-educ/etablissement", hiddenFor: ["secretary"] },
      { label: "Synchronisation", href: "/gabon-educ/synchronisation" },
      { label: "Import et export", href: "/gabon-educ/import-export", hiddenFor: ["secretary"] },
      { label: "Journal d’audit", href: "/gabon-educ/journal-audit", hiddenFor: ["secretary"] },
      { label: "Diagnostic", href: "/gabon-educ/diagnostic", hiddenFor: ["secretary"] },
    ],
  },
  {
    // Une seule entrée pour les onze modules non construits, en fin de menu.
    label: "Modules à venir",
    icon: Library,
    items: [
      { label: "Comptabilité, santé, bibliothèque…", href: "/gabon-educ/modules-a-venir" },
    ],
  },
];

export function AdminMegaNav({ onLogout, role }: { onLogout: () => void; role?: SchoolRole }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [resolvedRole, setResolvedRole] = useState<SchoolRole | null>(role || null);
  const navRef = useRef<HTMLElement>(null);

  // Le rôle est résolu ici lorsque l'appelant ne le fournit pas, pour que
  // chaque page qui affiche ce menu n'ait pas à s'en charger. Tant qu'il est
  // inconnu, aucune entrée n'est masquée : mieux vaut montrer brièvement une
  // rubrique de trop que faire clignoter le menu à chaque ouverture de page.
  useEffect(() => {
    if (role) {
      setResolvedRole(role);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        const roles = await resolveMyRoles(context.school.id);
        if (!cancelled && roles) setResolvedRole(roles.primary);
      } catch {
        // Sans rôle identifié, le menu reste complet : c'est l'état d'avant.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role]);

  const visibleGroups = adminGroups
    .filter((group) => !(resolvedRole && group.hiddenFor?.includes(resolvedRole)))
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !(resolvedRole && item.hiddenFor?.includes(resolvedRole)),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const homeHref = resolvedRole ? homeForRole(resolvedRole) : "/gabon-educ/administration";

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
        <Link className="admin-meganav-home" href={homeHref}><Home />Accueil</Link>
        {visibleGroups.map(group => {
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

type SimpleNavItem = NavItem & { icon: React.ComponentType<{ className?: string }> };

/**
 * Menus des espaces simples.
 *
 * Les espaces parent et élève annonçaient neuf entrées dont huit menaient à
 * une page « Ce module est prévu… » : le deuxième clic d'une démonstration
 * tombait dans le vide. Ils n'annoncent plus que ce qui existe, et pointent
 * vers les onglets réellement alimentés par l'établissement.
 *
 * Les entrées retirées — cahiers de texte, évaluations à venir, documents —
 * reviendront au menu le jour où elles auront un contenu, et pas avant.
 * Promettre moins et tenir tout inspire davantage confiance que l'inverse.
 */
const simpleNav: Record<SimpleSpace, SimpleNavItem[]> = {
  teacher: [
    { label: "Accueil", href: "/gabon-educ/tableau-de-bord", icon: Home },
    { label: "Voir mes classes", href: "/gabon-educ/mes-classes", icon: Users },
    { label: "Cahiers de texte", href: "/gabon-educ/mes-fiches", icon: NotebookPen },
    { label: "Notes", href: "/gabon-educ/notes", icon: ClipboardCheck },
    { label: "Saisie du bulletin", href: "/gabon-educ/saisie-bulletin", icon: PenLine },
    { label: "Imprimer les bulletins", href: "/gabon-educ/impression-bulletins", icon: Printer },
    { label: "Bulletins", href: "/gabon-educ/bulletins", icon: GraduationCap },
    { label: "Ressources", href: "/gabon-educ/documents", icon: BookOpen },
    { label: "Cahiers d’appel", href: "/gabon-educ/assiduite", icon: School },
    { label: "Vie scolaire", href: "/gabon-educ/assiduite", icon: UserRound },
    { label: "Communication", href: "/gabon-educ/notifications", icon: MessageCircle },
  ],
  parent: [
    { label: "Accueil", href: "/gabon-educ/espace-parent", icon: Home },
    { label: "Relevé de notes", href: "/gabon-educ/espace-parent#releve-de-notes", icon: ClipboardCheck },
    { label: "Bulletins", href: "/gabon-educ/espace-parent#bulletins", icon: GraduationCap },
    { label: "Cahiers de texte", href: "/gabon-educ/espace-parent#cahiers-de-texte", icon: NotebookPen },
    { label: "Évaluations", href: "/gabon-educ/espace-parent#evaluations", icon: CalendarDays },
    { label: "Vie scolaire", href: "/gabon-educ/espace-parent#vie-scolaire", icon: UserRound },
    { label: "Emploi du temps", href: "/gabon-educ/espace-parent#emploi-du-temps", icon: CalendarDays },
    { label: "Messages", href: "/gabon-educ/espace-parent#messages", icon: MessageCircle },
    { label: "Mes coordonnées", href: "/gabon-educ/espace-parent#mes-coordonnees", icon: PhoneCall },
  ],
  student: [
    { label: "Accueil", href: "/gabon-educ/espace-eleve", icon: Home },
    { label: "Relevé de notes", href: "/gabon-educ/espace-eleve#releve-de-notes", icon: ClipboardCheck },
    { label: "Bulletins", href: "/gabon-educ/espace-eleve#bulletins", icon: GraduationCap },
    { label: "Cahiers de texte", href: "/gabon-educ/espace-eleve#cahiers-de-texte", icon: NotebookPen },
    { label: "Évaluations", href: "/gabon-educ/espace-eleve#evaluations", icon: CalendarDays },
    { label: "Vie scolaire", href: "/gabon-educ/espace-eleve#vie-scolaire", icon: UserRound },
    { label: "Emploi du temps", href: "/gabon-educ/espace-eleve#emploi-du-temps", icon: CalendarDays },
  ],
};

export function SimpleSpaceNav({ space, onLogout }: { space: SimpleSpace; onLogout?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <nav className={`space-topnav space-topnav-${space} ${open ? "open" : ""}`} aria-label={`Navigation espace ${space}`}>
      <button className="space-topnav-toggle" onClick={() => setOpen(value => !value)}>{open ? <X /> : <Menu />} Menu</button>
      <div className="space-topnav-links">
        {simpleNav[space].map(item => {
          const Icon = item.icon;
          if (item.external) {
            return <a href={item.href} key={item.label} onClick={() => setOpen(false)} target="_blank" rel="noopener noreferrer" className="apc-nav-link"><Icon />{item.label}<ExternalLink /></a>;
          }
          // Les liens vers une ancre restent des liens ordinaires : le routeur
          // de Next change l'adresse par l'API d'historique, qui n'émet pas
          // « hashchange » — l'onglet visé ne s'ouvrirait donc jamais.
          if (item.href.includes("#")) {
            return <a href={item.href} key={item.label} onClick={() => setOpen(false)}><Icon />{item.label}</a>;
          }
          return <Link href={item.href} key={item.label} onClick={() => setOpen(false)}><Icon />{item.label}</Link>;
        })}
        {onLogout && <button onClick={onLogout}><LogOut />Déconnexion</button>}
      </div>
    </nav>
  );
}
