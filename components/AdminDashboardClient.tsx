"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, BookOpenCheck, Building2, CalendarDays, ClipboardList, CreditCard,
  FileText, GraduationCap, Home, LogOut, Menu, MessageSquareText, Search,
  Settings, ShieldCheck, UserCog, Users, WalletCards, X, School, Clock3,
  TriangleAlert, BadgeCheck, BookOpen, UserRoundCheck
} from "lucide-react";
import { signOut } from "@/lib/profile-store";
import { AdministrationMegaNav } from "@/components/AdministrationNavigation";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import type { ClassRecord } from "@/lib/class-store";
import { listClasses } from "@/lib/class-store";
import { loadPlatformWorkspace, defaultPlatformWorkspace } from "@/lib/platform/store";
import type { PlatformWorkspace, SchoolRole } from "@/lib/platform/types";
import type { StorageMode } from "@/lib/storage-mode";
import { storageModeLabel } from "@/lib/storage-mode";
import { formatSchoolProfile } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";
import { resolveActiveSchoolContext } from "@/lib/active-school";

const roleLabels: Record<SchoolRole, string> = {
  super_admin: "Super administrateur",
  school_admin: "Administrateur scolaire",
  headmaster: "Chef d’établissement",
  academic_director: "Directeur des études",
  supervisor: "Responsable vie scolaire",
  secretary: "Secrétaire / scolarité",
  head_teacher: "Enseignant principal",
  teacher: "Enseignant",
  guardian: "Parent / responsable",
  student: "Élève",
};

const adminRoles: Array<{role: SchoolRole; mission: string; scope: string}> = [
  { role: "headmaster", mission: "Pilote l’établissement, valide les décisions et les bulletins.", scope: "Vue complète" },
  { role: "school_admin", mission: "Configure le logiciel, les comptes et les paramètres généraux.", scope: "Administration" },
  { role: "academic_director", mission: "Organise classes, matières, affectations, emplois du temps et résultats.", scope: "Pédagogie" },
  { role: "secretary", mission: "Inscrit les élèves, met à jour les dossiers et prépare les documents.", scope: "Scolarité" },
  { role: "supervisor", mission: "Suit absences, retards, discipline et vie scolaire.", scope: "Vie scolaire" },
  { role: "head_teacher", mission: "Suit sa classe, coordonne les appréciations et prépare les conseils.", scope: "Classe attribuée" },
];

const quickModules = [
  {
  href: "/gabon-educ/classes",
  label: "Classes",
  description: "Créer et organiser les classes de l’établissement",
  icon: School,
},
  { href: "/gabon-educ/eleves", label: "Élèves", description: "Inscrire, rechercher et gérer les dossiers", icon: Users },
  { href: "/gabon-educ/utilisateurs", label: "Personnel et rôles", description: "Créer les comptes et attribuer les responsabilités", icon: UserCog },
  { href: "/gabon-educ/pedagogie", label: "Pédagogie", description: "Ouvrir le tableau de bord autonome de la direction des études", icon: GraduationCap },
  { href: "/gabon-educ/assiduite", label: "Vie scolaire", description: "Absences, retards et suivi des élèves", icon: UserRoundCheck },
  { href: "/gabon-educ/documents", label: "Documents", description: "Certificats, attestations et impressions", icon: FileText },
  { href: "/gabon-educ/annonces", label: "Communication", description: "Annonces et informations internes", icon: MessageSquareText },
];

export function AdminDashboardClient() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<PlatformWorkspace>(defaultPlatformWorkspace);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [mode, setMode] = useState<StorageMode>("demo");
  const [query, setQuery] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        // Le profil s'affiche dès que l'appartenance est vérifiée. Le reste du
        // tableau de bord continue à se charger sans bloquer cet affichage.
        const context = await resolveActiveSchoolContext();
        const school = context.school;
        setProfileError("");
        setWorkspace((current) => ({ ...current, school }));
        setMode(context.mode);
        const [platform, classResult] = await Promise.all([
          loadPlatformWorkspace(),
          listClasses({ schoolId: school.id, schoolType: school.schoolType }),
        ]);
        setWorkspace({ ...platform.workspace, school });
        setMode(platform.mode === "demo" ? context.mode : platform.mode);
        setClasses(classResult.items);
      } catch (error) {
        setClasses([]);
        setProfileError(error instanceof Error ? error.message : "Profil de l’établissement indisponible.");
      }
    })();
  }, []);

  async function logout() {
    await signOut();
    router.push("/gabon-educ/connexion-administration");
    router.refresh();
  }

  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  const activeStudents = workspace.students.filter(item => item.status === "active");
  const activeUsers = workspace.users.filter(item => item.status === "active");
  const pendingUsers = workspace.users.filter(item => item.status === "invited");
  const currentSchool = workspace.school;
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    if (!needle) return [];
    return activeStudents.filter(student => {
      const classLabel = classes.find(item => item.id === student.classId)?.name || "";
      return [student.firstName, student.lastName, student.registrationNumber, classLabel, student.phone]
        .join(" ").toLocaleLowerCase("fr").includes(needle);
    }).slice(0, 8);
  }, [activeStudents, classes, query]);

  return (
    <main className="admin-workspace">
      <header className="admin-brandbar">
        <div className="admin-brand-identity"><div className="admin-seal"><School /></div><div><b>{PRODUCT.name}</b><span>Espace Administration</span></div></div>
        <div className="admin-school-profile" aria-label="Type d’établissement actif">
          <Building2 />
          <div>
            <span>ÉTABLISSEMENT ACTIF</span>
            <strong>{currentSchool ? formatSchoolProfile(currentSchool.schoolType, currentSchool.schoolSector) : profileError ? "Profil indisponible" : "Chargement du profil…"}</strong>
            <small>{currentSchool?.name || profileError || "Établissement en cours de résolution"}</small>
          </div>
        </div>
      </header>

      <AdministrationMegaNav onLogout={() => void logout()} />
      <SubscriptionBanner />

      <section className="admin-contextbar">
        <div><b>Tableau de pilotage</b><span>{today}</span></div>
        <div className="admin-user-chip"><span>AD</span><div><b>Administration</b><small>{currentSchool?.name || "Établissement"} · {storageModeLabel(mode)}</small></div><Bell /></div>
      </section>

      <section className="admin-search-zone">
        <div>
          <span className="admin-kicker">Recherche rapide</span>
          <h1>Retrouver un élève dans tout l’établissement</h1>
          <p>Nom, prénom, matricule, téléphone ou classe.</p>
        </div>
        <label className="admin-searchbox"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Ex. TEST Arnaud, 5A2 ou matricule…" />{query && <button onClick={() => setQuery("")} aria-label="Effacer"><X /></button>}</label>
        {query && <div className="admin-search-results">
          {results.length ? results.map(student => <Link key={student.id} href="/gabon-educ/eleves"><span>{student.firstName[0]}{student.lastName[0]}</span><div><b>{student.lastName} {student.firstName}</b><small>{student.registrationNumber || "Sans matricule"} · {classes.find(item => item.id === student.classId)?.name || "Classe non attribuée"}</small></div><em>Ouvrir le dossier</em></Link>) : <p>Aucun élève ne correspond à cette recherche.</p>}
        </div>}
      </section>

      <section className="admin-stat-grid">
        <article><span><Users /></span><div><small>Élèves actifs</small><b>{activeStudents.length}</b><em>Dossiers actifs</em></div></article>
        <article><span><School /></span><div><small>Total des classes</small><b>{classes.length}</b><em>Classes enregistrées</em></div></article>
        <article><span><UserCog /></span><div><small>Personnel actif</small><b>{activeUsers.length}</b><em>{pendingUsers.length} invitation(s) en attente</em></div></article>
        <article><span><BookOpenCheck /></span><div><small>Matières</small><b>{workspace.subjects.length}</b><em>{workspace.assignments.length} affectation(s)</em></div></article>
        <article><span><Clock3 /></span><div><small>Créneaux planifiés</small><b>{workspace.timetable.length}</b><em>Emploi du temps</em></div></article>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-main-panel">
          <header><div><h2>Centre des opérations</h2><p>Accès direct aux tâches quotidiennes de l’administration.</p></div><ShieldCheck /></header>
          <div className="admin-module-grid">
            {quickModules.map(item => <Link href={item.href} key={item.href}><span><item.icon /></span><div><b>{item.label}</b><small>{item.description}</small></div><strong>Ouvrir →</strong></Link>)}
            <Link href="/gabon-educ/comptabilite"><span><WalletCards /></span><div><b>Comptabilité et frais de scolarité</b><small>Frais, paiements, reçus, impayés et clôtures de caisse.</small></div><strong>Ouvrir →</strong></Link>
          </div>
        </section>

        <aside className="admin-side-column">
          <section className="admin-panel">
            <header><div><h2>Alertes et contrôles</h2><p>Points à vérifier aujourd’hui.</p></div><TriangleAlert /></header>
            <div className="admin-alert-list">
              <Link href="/gabon-educ/utilisateurs"><span className={pendingUsers.length ? "warning" : "ok"}>{pendingUsers.length ? <TriangleAlert/> : <BadgeCheck/>}</span><div><b>Comptes utilisateurs</b><small>{pendingUsers.length ? `${pendingUsers.length} invitation(s) non acceptée(s)` : "Tous les comptes sont à jour"}</small></div></Link>
              <Link href="/gabon-educ/eleves"><span className={activeStudents.some(item => !item.classId) ? "warning" : "ok"}>{activeStudents.some(item => !item.classId) ? <TriangleAlert/> : <BadgeCheck/>}</span><div><b>Affectation des élèves</b><small>{activeStudents.some(item => !item.classId) ? "Des élèves n’ont pas de classe" : "Tous les élèves actifs ont une classe"}</small></div></Link>
              <Link href="/gabon-educ/pedagogie"><span className={workspace.assignments.length ? "ok" : "warning"}>{workspace.assignments.length ? <BadgeCheck/> : <TriangleAlert/>}</span><div><b>Pédagogie</b><small>{workspace.assignments.length ? `${workspace.assignments.length} affectation(s) enregistrée(s)` : "Aucune affectation enregistrée"}</small></div></Link>
            </div>
          </section>

          <section className="admin-panel">
            <header><div><h2>Rôles administratifs</h2><p>Qui fait quoi dans {PRODUCT.name} ?</p></div><UserCog /></header>
            <div className="admin-role-list">{adminRoles.map(item => <article key={item.role}><div><b>{roleLabels[item.role]}</b><span>{item.scope}</span></div><p>{item.mission}</p></article>)}</div>
            <Link className="admin-manage-roles" href="/gabon-educ/utilisateurs">Gérer les utilisateurs et les rôles</Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
