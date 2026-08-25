"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck, Bell, Building2, CalendarDays, ClipboardList, FileText,
  MessageSquareText, Phone, School, Search, TriangleAlert, UserRoundCheck,
  Users, X,
} from "lucide-react";
import { signOut } from "@/lib/profile-store";
import { AdminMegaNav } from "@/components/SpaceNavigation";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { listClasses, type ClassRecord } from "@/lib/class-store";
import { defaultPlatformWorkspace, loadPlatformWorkspace } from "@/lib/platform/store";
import type { PlatformWorkspace } from "@/lib/platform/types";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { formatSchoolProfile } from "@/lib/school-profiles";
import { storageModeLabel, type StorageMode } from "@/lib/storage-mode";
import { loadPendingContactRequests } from "@/lib/guardians/contact-requests";
import { loadEnrollmentForms, type EnrollmentRecord } from "@/lib/enrollment/store";
import { isPhoneUsable } from "@/lib/communication/whatsapp";
import { PRODUCT } from "@/lib/product-edition";

/**
 * Bureau du secrétariat.
 *
 * Cette page n'est pas un tableau de bord allégé, et la différence n'est pas
 * cosmétique. Le chef d'établissement pilote : il lui faut des indicateurs,
 * des alertes, des validations en attente. Le secrétariat traite : il lui faut
 * savoir ce qui reste sur son bureau, et pouvoir retrouver en trois secondes
 * l'élève dont le parent se tient devant le guichet.
 *
 * D'où deux partis pris. La recherche est en haut, avant tout le reste, parce
 * qu'elle est le geste le plus fréquent de la journée. Et les compteurs ne
 * comptent pas ce que l'établissement possède — élèves, classes, matières —
 * mais ce qui manque : un dossier sans classe, une famille sans numéro
 * joignable, une fiche restée en brouillon. Un compteur qui affiche zéro est
 * ici une bonne nouvelle.
 */

type PendingItem = {
  key: string;
  label: string;
  count: number;
  detail: string;
  href: string;
};

const quickActions = [
  {
    href: "/gabon-educ/inscriptions",
    label: "Nouvelle inscription",
    description: "Remplir une fiche et créer le dossier de l’élève",
    icon: ClipboardList,
  },
  {
    href: "/gabon-educ/eleves",
    label: "Scolarité",
    description: "Rechercher un dossier, corriger une adresse, un contact",
    icon: Users,
  },
  {
    href: "/gabon-educ/parents",
    label: "Parents et responsables",
    description: "Rattacher un responsable, mettre à jour un numéro",
    icon: UserRoundCheck,
  },
  {
    href: "/gabon-educ/documents",
    label: "Documents",
    description: "Certificats de scolarité, attestations, impressions",
    icon: FileText,
  },
  {
    href: "/gabon-educ/communication",
    label: "Messages aux parents",
    description: "Convocations et informations par WhatsApp",
    icon: MessageSquareText,
  },
  {
    href: "/gabon-educ/annonces",
    label: "Annonces",
    description: "Informations affichées dans les espaces familles",
    icon: Bell,
  },
  {
    href: "/gabon-educ/classes",
    label: "Classes",
    description: "Effectifs et répartition des élèves",
    icon: School,
  },
  {
    href: "/gabon-educ/emplois-du-temps",
    label: "Emplois du temps",
    description: "Consulter les horaires pour renseigner les familles",
    icon: CalendarDays,
  },
];

export function SecretariatDeskClient() {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<PlatformWorkspace>(defaultPlatformWorkspace);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRecord[]>([]);
  const [mode, setMode] = useState<StorageMode>("demo");
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  /**
   * Corrections de coordonnées signalées par les familles. Elles vivent dans
   * Supabase et non dans l'espace de travail local : c'est le seul élément de
   * ce bureau qui vienne directement du nuage, parce qu'il est écrit par
   * quelqu'un d'autre que le personnel.
   */
  const [contactRequests, setContactRequests] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        const school = context.school;
        setLoadError("");
        setMode(context.mode);
        setWorkspace((current) => ({ ...current, school }));
        const [platform, classResult, forms] = await Promise.all([
          loadPlatformWorkspace(),
          listClasses({ schoolId: school.id, schoolType: school.schoolType }),
          loadEnrollmentForms(school.id),
        ]);
        setWorkspace({ ...platform.workspace, school });
        setMode(platform.mode === "demo" ? context.mode : platform.mode);
        setClasses(classResult.items);
        setEnrollments(forms.items);
        try {
          const demandes = await loadPendingContactRequests(school.id);
          setContactRequests(demandes.length);
        } catch {
          // Le bureau reste utilisable même si cette lecture échoue.
          setContactRequests(0);
        }
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Établissement indisponible pour le moment.",
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
  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const activeStudents = useMemo(
    () => workspace.students.filter((item) => item.status === "active"),
    [workspace.students],
  );

  const pending = useMemo<PendingItem[]>(() => {
    const drafts = enrollments.filter((item) => item.status === "draft");
    const withoutClass = activeStudents.filter((item) => !item.classId);
    const linkedStudentIds = new Set(
      workspace.guardianLinks.map((link) => link.studentId),
    );
    const withoutGuardian = activeStudents.filter(
      (item) => !linkedStudentIds.has(item.id),
    );
    // Un responsable sans numéro exploitable rend l'élève injoignable en cas
    // d'urgence, et fait échouer silencieusement tout envoi WhatsApp.
    const unreachable = workspace.guardians.filter(
      (item) => item.status === "active" && !isPhoneUsable(item.phone),
    );
    return [
      {
        key: "drafts",
        label: "Fiches d’inscription en brouillon",
        count: drafts.length,
        detail: drafts.length
          ? "À compléter puis valider pour créer le dossier élève."
          : "Aucune fiche en attente de validation.",
        href: "/gabon-educ/inscriptions",
      },
      {
        key: "class",
        label: "Élèves sans classe",
        count: withoutClass.length,
        detail: withoutClass.length
          ? "Ils n’apparaîtront ni dans un cahier d’appel ni sur un bulletin."
          : "Tous les élèves actifs sont affectés.",
        href: "/gabon-educ/eleves",
      },
      {
        key: "guardian",
        label: "Élèves sans responsable rattaché",
        count: withoutGuardian.length,
        detail: withoutGuardian.length
          ? "Aucune famille ne recevra les messages concernant ces élèves."
          : "Chaque élève actif a au moins un responsable.",
        href: "/gabon-educ/parents",
      },
      {
        key: "contact-requests",
        label: "Corrections de coordonnées signalées",
        count: contactRequests,
        detail: contactRequests
          ? "Des familles ont signalé un changement de numéro. Tant qu’il n’est pas appliqué, l’établissement appelle l’ancien."
          : "Aucune correction en attente de validation.",
        href: "/gabon-educ/parents",
      },
      {
        key: "phone",
        label: "Responsables sans numéro joignable",
        count: unreachable.length,
        detail: unreachable.length
          ? "Numéro absent ou incomplet : les envois WhatsApp échoueront."
          : "Tous les responsables actifs ont un numéro exploitable.",
        href: "/gabon-educ/parents",
      },
    ];
  }, [activeStudents, contactRequests, enrollments, workspace.guardianLinks, workspace.guardians]);

  const toHandle = pending.reduce((total, item) => total + item.count, 0);

  /**
   * La recherche couvre élèves et responsables. Au guichet, la personne qui se
   * présente est aussi souvent le parent que l'élève, et chercher un parent en
   * passant d'abord par le dossier de son enfant fait perdre un temps que la
   * file d'attente ne pardonne pas.
   */
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    if (!needle) return { students: [], guardians: [] };
    const students = activeStudents
      .filter((student) => {
        const className = classes.find((item) => item.id === student.classId)?.name || "";
        return [
          student.firstName,
          student.lastName,
          student.registrationNumber,
          className,
          student.phone,
        ]
          .join(" ")
          .toLocaleLowerCase("fr")
          .includes(needle);
      })
      .slice(0, 6);
    const guardians = workspace.guardians
      .filter((guardian) =>
        [guardian.firstName, guardian.lastName, guardian.phone, guardian.email]
          .join(" ")
          .toLocaleLowerCase("fr")
          .includes(needle),
      )
      .slice(0, 6);
    return { students, guardians };
  }, [activeStudents, classes, query, workspace.guardians]);

  const hasResults = results.students.length > 0 || results.guardians.length > 0;

  return (
    <main className="admin-workspace">
      <header className="admin-brandbar">
        <div className="admin-brand-identity">
          <div className="admin-seal"><ClipboardList /></div>
          <div><b>{PRODUCT.name}</b><span>Bureau du secrétariat</span></div>
        </div>
        <div className="admin-school-profile" aria-label="Établissement actif">
          <Building2 />
          <div>
            <span>ÉTABLISSEMENT ACTIF</span>
            <strong>
              {school
                ? formatSchoolProfile(school.schoolType, school.schoolSector)
                : loadError
                  ? "Profil indisponible"
                  : "Chargement du profil…"}
            </strong>
            <small>{school?.name || loadError || "Établissement en cours de résolution"}</small>
          </div>
        </div>
      </header>

      <AdminMegaNav onLogout={() => void logout()} role="secretary" />
      <SubscriptionBanner />

      <section className="admin-contextbar">
        <div><b>Bureau du secrétariat</b><span>{today}</span></div>
        <div className="admin-user-chip">
          <span>SC</span>
          <div>
            <b>Secrétariat</b>
            <small>{school?.name || "Établissement"} · {storageModeLabel(mode)}</small>
          </div>
          <Bell />
        </div>
      </section>

      <section className="admin-search-zone">
        <div>
          <span className="admin-kicker">Accueil et guichet</span>
          <h1>Retrouver un élève ou un responsable</h1>
          <p>Nom, prénom, matricule, classe ou numéro de téléphone.</p>
        </div>
        <label className="admin-searchbox">
          <Search />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ex. NDONG Marie, 6e B ou 077…"
          />
          {query && <button onClick={() => setQuery("")} aria-label="Effacer"><X /></button>}
        </label>
        {query && (
          <div className="admin-search-results">
            {results.students.map((student) => (
              <Link key={`e-${student.id}`} href="/gabon-educ/eleves">
                <span>{student.firstName.charAt(0)}{student.lastName.charAt(0)}</span>
                <div>
                  <b>{student.lastName} {student.firstName}</b>
                  <small>
                    Élève · {student.registrationNumber || "Sans matricule"} ·{" "}
                    {classes.find((item) => item.id === student.classId)?.name || "Classe non attribuée"}
                  </small>
                </div>
                <em>Ouvrir le dossier</em>
              </Link>
            ))}
            {results.guardians.map((guardian) => (
              <Link key={`r-${guardian.id}`} href="/gabon-educ/parents">
                <span>{guardian.firstName.charAt(0)}{guardian.lastName.charAt(0)}</span>
                <div>
                  <b>{guardian.lastName} {guardian.firstName}</b>
                  <small>Responsable · {guardian.phone || "Aucun numéro enregistré"}</small>
                </div>
                <em>Ouvrir la fiche</em>
              </Link>
            ))}
            {!hasResults && <p>Aucun élève ni responsable ne correspond à cette recherche.</p>}
          </div>
        )}
      </section>

      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-main-panel">
          <header>
            <div>
              <h2>Tâches courantes</h2>
              <p>Les gestes quotidiens du secrétariat, accessibles en un clic.</p>
            </div>
            <ClipboardList />
          </header>
          <div className="admin-module-grid">
            {quickActions.map((item) => (
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
              <div>
                <h2>Sur le bureau</h2>
                <p>
                  {toHandle
                    ? `${toHandle} point(s) à régulariser.`
                    : "Rien en attente : les dossiers sont à jour."}
                </p>
              </div>
              {toHandle ? <TriangleAlert /> : <BadgeCheck />}
            </header>
            <div className="admin-alert-list">
              {pending.map((item) => (
                <Link href={item.href} key={item.key}>
                  <span className={item.count ? "warning" : "ok"}>
                    {item.count ? <TriangleAlert /> : <BadgeCheck />}
                  </span>
                  <div>
                    <b>{item.count ? `${item.count} · ${item.label}` : item.label}</b>
                    <small>{item.detail}</small>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="admin-panel">
            <header>
              <div>
                <h2>Effectifs</h2>
                <p>État de l’établissement à cet instant.</p>
              </div>
              <Users />
            </header>
            <div className="admin-alert-list">
              <Link href="/gabon-educ/eleves">
                <span className="ok"><Users /></span>
                <div><b>{activeStudents.length} élève(s) actif(s)</b><small>Dossiers en cours de scolarité</small></div>
              </Link>
              <Link href="/gabon-educ/classes">
                <span className="ok"><School /></span>
                <div><b>{classes.length} classe(s)</b><small>Classes ouvertes cette année</small></div>
              </Link>
              <Link href="/gabon-educ/parents">
                <span className="ok"><Phone /></span>
                <div>
                  <b>{workspace.guardians.filter((item) => item.status === "active").length} responsable(s)</b>
                  <small>Familles enregistrées</small>
                </div>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
