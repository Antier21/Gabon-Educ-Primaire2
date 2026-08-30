"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  NotebookPen,
  School,
  TriangleAlert,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { PedagogyMegaNav } from "@/components/PedagogyNavigation";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { signOut } from "@/lib/profile-store";
import { listClasses, type ClassRecord } from "@/lib/class-store";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { loadPlatformWorkspace, defaultPlatformWorkspace } from "@/lib/platform/store";
import type { PlatformWorkspace } from "@/lib/platform/types";
import { formatSchoolProfile } from "@/lib/school-profiles";
import { PRODUCT } from "@/lib/product-edition";

const pedagogyModules = [
  {
    href: "/gabon-educ/matieres",
    label: "Matières et affectations",
    description: "Configurer les matières, coefficients et affectations des enseignants.",
    icon: BookOpen,
  },
  {
    href: "/gabon-educ/emplois-du-temps",
    label: "Emplois du temps",
    description: "Organiser les créneaux et contrôler les conflits de planning.",
    icon: CalendarDays,
  },
  {
    href: "/gabon-educ/creer-enseignant",
    label: "Créer un enseignant",
    description: "Créer les comptes enseignants et enseignants principaux.",
    icon: Users,
  },
  {
    href: "/gabon-educ/evaluations",
    label: "Évaluations",
    description: "Préparer et suivre les évaluations des classes.",
    icon: ClipboardCheck,
  },
  {
    href: "/gabon-educ/notes-bulletins?tab=reports",
    label: "Notes et bulletins",
    description: "Contrôler les résultats et le processus de préparation des bulletins.",
    icon: GraduationCap,
  },
  {
    href: "/gabon-educ/modele-bulletin",
    label: "Modèle de bulletin",
    description: "Configurer la présentation du bulletin de l’établissement.",
    icon: GraduationCap,
  },
  {
    href: "/gabon-educ/bulletins-publication",
    label: "Bulletins et publication",
    description: "Valider, verrouiller et publier les bulletins.",
    icon: BadgeCheck,
  },
  {
    href: "/gabon-educ/cahier-de-textes",
    label: "Cahier de textes",
    description: "Consulter et suivre les séances renseignées par les enseignants.",
    icon: NotebookPen,
  },
  {
    href: "/gabon-educ/cahier-de-textes/progression",
    label: "Progression annuelle",
    description: "Suivre l’avancement annuel des enseignements et des programmes.",
    icon: CalendarDays,
  },
  {
    href: "/gabon-educ/mes-fiches",
    label: "Fiches de préparation",
    description: "Accéder aux fiches pédagogiques et préparations de cours.",
    icon: BookOpen,
  },
];

export function PedagogyDashboardClient() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<PlatformWorkspace>(defaultPlatformWorkspace);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        const school = context.school;
        setProfileError("");
        setWorkspace((current) => ({ ...current, school }));
        const [platform, classResult] = await Promise.all([
          loadPlatformWorkspace(),
          listClasses({ schoolId: school.id, schoolType: school.schoolType }),
        ]);
        setWorkspace({ ...platform.workspace, school });
        setClasses(classResult.items);
      } catch (error) {
        setClasses([]);
        setProfileError(
          error instanceof Error ? error.message : "Profil de l’établissement indisponible.",
        );
      }
    })();
  }, []);

  async function logout() {
    await signOut();
    router.push("/gabon-educ/connexion-administration");
    router.refresh();
  }

  const school = workspace.school;
  const activeTeachers = workspace.users.filter(
    (user) =>
      user.status === "active" &&
      (user.role === "teacher" || user.role === "head_teacher"),
  );
  const activeSubjects = workspace.subjects.filter((subject) => subject.active);
  const activeAssignments = workspace.assignments.filter((assignment) => assignment.active);
  const unassignedClasses = classes.filter(
    (classe) => !activeAssignments.some((assignment) => assignment.classId === classe.id),
  );
  const timetableClasses = new Set(workspace.timetable.map((slot) => slot.classId));
  const classesWithoutTimetable = classes.filter((classe) => !timetableClasses.has(classe.id));
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <main className="admin-workspace pedagogy-workspace">
      <header className="admin-brandbar">
        <div className="admin-brand-identity">
          <div className="admin-seal"><GraduationCap /></div>
          <div><b>{PRODUCT.name}</b><span>Espace Pédagogie</span></div>
        </div>
        <div className="admin-school-profile" aria-label="Établissement actif">
          <Building2 />
          <div>
            <span>ÉTABLISSEMENT ACTIF</span>
            <strong>
              {school
                ? formatSchoolProfile(school.schoolType, school.schoolSector)
                : profileError
                  ? "Profil indisponible"
                  : "Chargement du profil…"}
            </strong>
            <small>{school?.name || profileError || "Établissement en cours de résolution"}</small>
          </div>
        </div>
      </header>

      <PedagogyMegaNav onLogout={() => void logout()} />
      <SubscriptionBanner />

      <section className="admin-contextbar">
        <div><b>Tableau de bord pédagogique</b><span>{today}</span></div>
        <div className="admin-user-chip">
          <span>PE</span>
          <div><b>Direction des études</b><small>{school?.name || "Établissement"}</small></div>
          <Bell />
        </div>
      </section>

      <section className="admin-search-zone">
        <div>
          <span className="admin-kicker">Pilotage pédagogique</span>
          <h1>Organiser, suivre et contrôler les enseignements</h1>
          <p>
            Toutes les fonctions pédagogiques existantes sont conservées dans un espace
            désormais séparé de l’administration générale.
          </p>
        </div>
      </section>

      <section className="admin-stat-grid">
        <article>
          <span><School /></span>
          <div><small>Classes</small><b>{classes.length}</b><em>Classes enregistrées</em></div>
        </article>
        <article>
          <span><Users /></span>
          <div><small>Enseignants actifs</small><b>{activeTeachers.length}</b><em>Enseignants et principaux</em></div>
        </article>
        <article>
          <span><BookOpen /></span>
          <div><small>Matières actives</small><b>{activeSubjects.length}</b><em>{activeAssignments.length} affectation(s)</em></div>
        </article>
        <article>
          <span><CalendarDays /></span>
          <div><small>Créneaux planifiés</small><b>{workspace.timetable.length}</b><em>Emplois du temps</em></div>
        </article>
        <article>
          <span><ClipboardCheck /></span>
          <div><small>Suivi pédagogique</small><b>{pedagogyModules.length}</b><em>Fonctions disponibles</em></div>
        </article>
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-main-panel">
          <header>
            <div>
              <h2>Centre pédagogique</h2>
              <p>Les dix fonctions de l’ancienne rubrique Pédagogie, sans suppression ni déplacement fonctionnel.</p>
            </div>
            <GraduationCap />
          </header>
          <div className="admin-module-grid">
            {pedagogyModules.map((item) => (
              <Link href={item.href} key={item.href}>
                <span><item.icon /></span>
                <div><b>{item.label}</b><small>{item.description}</small></div>
                <strong>Ouvrir →</strong>
              </Link>
            ))}
          </div>
        </section>

        <aside className="admin-side-column">
          <section className="admin-panel">
            <header>
              <div><h2>Contrôles pédagogiques</h2><p>Points à surveiller dans l’établissement.</p></div>
              <TriangleAlert />
            </header>
            <div className="admin-alert-list">
              <Link href="/gabon-educ/matieres">
                <span className={unassignedClasses.length ? "warning" : "ok"}>
                  {unassignedClasses.length ? <TriangleAlert /> : <BadgeCheck />}
                </span>
                <div>
                  <b>Affectations des classes</b>
                  <small>
                    {unassignedClasses.length
                      ? `${unassignedClasses.length} classe(s) sans affectation active`
                      : "Toutes les classes ont au moins une affectation"}
                  </small>
                </div>
              </Link>
              <Link href="/gabon-educ/emplois-du-temps">
                <span className={classesWithoutTimetable.length ? "warning" : "ok"}>
                  {classesWithoutTimetable.length ? <TriangleAlert /> : <BadgeCheck />}
                </span>
                <div>
                  <b>Emplois du temps</b>
                  <small>
                    {classesWithoutTimetable.length
                      ? `${classesWithoutTimetable.length} classe(s) sans créneau planifié`
                      : "Toutes les classes ont un emploi du temps renseigné"}
                  </small>
                </div>
              </Link>
              <Link href="/gabon-educ/cahier-de-textes">
                <span className="ok"><UserRoundCheck /></span>
                <div><b>Suivi des enseignements</b><small>Ouvrir les cahiers de textes et progressions</small></div>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
