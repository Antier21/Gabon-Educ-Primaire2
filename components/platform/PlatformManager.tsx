"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LockKeyhole, ShieldAlert } from "lucide-react";
import { SchoolDocumentPreview } from "@/components/SchoolDocumentTemplates";
import { useSubscriptionAccess } from "@/lib/subscriptions/use-subscription-access";
import { createClient } from "@/lib/supabase/client";
import { Brand } from "@/components/Brand";
import { AcademicWeekStrip } from "@/components/AcademicWeekStrip";
import { buildReportCardSnapshot } from "@/lib/grading/calculations";
import { loadGradingWorkspace } from "@/lib/grading/store";
import { readClasses, type ClassRecord } from "@/lib/class-store";
import { loadActiveSchoolClasses } from "@/lib/active-school-classes";
import { hasPermission, type PermissionResource } from "@/lib/permissions";
import {
  calculateAttendance,
  detectTimetableConflicts,
  platformStatistics,
  transferStudent,
} from "@/lib/platform/calculations";
import { detectV07Data, migrateV07Classes } from "@/lib/platform/migration";
import {
  loadPlatformWorkspace,
  savePlatformWorkspace,
  defaultPlatformWorkspace,
} from "@/lib/platform/store";
import type {
  Announcement,
  AttendanceEntry,
  DocumentKind,
  Guardian,
  GuardianLink,
  PlatformWorkspace,
  SchoolDocument,
  SchoolRole,
  SchoolSubject,
  SchoolUser,
  StudentRecord,
  TeachingAssignment,
  TimetableSlot,
} from "@/lib/platform/types";
import { LEGACY_KEYS, STORAGE_KEYS, type StorageMode } from "@/lib/storage-mode";
import type { SyncOperationMetadata } from "@/lib/sync/types";
import { getDefaultLevelsForSchoolType, getDefaultSubjectsForSchoolType, levelCycleForCode, formatSchoolProfile } from "@/lib/school-profiles";
import { buildAccessEmail, normalizeAccessIdentifier, suggestAccessIdentifier } from "@/lib/access-identifiers";
import { generateMissingTimetable, inspectTimetableGeneration } from "@/lib/platform/timetable-generator";
import {
  buildSchoolDocumentPayload,
  getPrimaryReportTemplateForLevel,
  getTemplateByKey,
  getTemplatesForSchoolType,
  type SchoolDocumentTemplateKey,
} from "@/lib/school-document-templates";
import styles from "./PlatformManager.module.css";
import { PRODUCT } from "@/lib/product-edition";

export type PlatformModule =
  | "establishment"
  | "administration"
  | "users"
  | "students"
  | "guardians"
  | "subjects"
  | "timetable"
  | "attendance"
  | "announcements"
  | "documents"
  | "parent"
  | "student";
const labels: Record<PlatformModule, { title: string; description: string }> = {
  establishment: {
    title: "Établissement et année scolaire",
    description:
      "Configurez l’identité, la structure scolaire, les périodes et les paramètres de notation.",
  },
  administration: {
    title: "Pilotage de l’établissement",
    description:
      "Indicateurs calculés à partir des données enregistrées, alertes et contrôles de cohérence.",
  },
  users: {
    title: "Utilisateurs et rôles",
    description:
      "Invitez les membres, attribuez un rôle et limitez leurs périmètres d’intervention.",
  },
  students: {
    title: "Dossiers élèves",
    description:
      "Centralisez les informations administratives, importez une liste et gérez les transferts.",
  },
  guardians: {
    title: "Parents et responsables",
    description:
      "Créez les contacts et reliez-les explicitement aux élèves autorisés.",
  },
  subjects: {
    title: "Matières et affectations",
    description:
      "Définissez les matières, coefficients et enseignants affectés à chaque classe.",
  },
  timetable: {
    title: "Emplois du temps",
    description:
      "Planifiez les cours et détectez automatiquement les conflits de classe, salle ou enseignant.",
  },
  attendance: {
    title: "Assiduité",
    description:
      "Saisissez absences, retards et sorties anticipées puis suivez les statistiques.",
  },
  announcements: {
    title: "Annonces",
    description:
      "Préparez, ciblez et publiez les communications internes de l’établissement.",
  },
  documents: {
    title: "Documents scolaires",
    description:
      "Générez, prévisualisez et imprimez des modèles configurables avec traçabilité.",
  },
  parent: {
    title: "Espace parent",
    description:
      "Vue locale de démonstration limitée aux enfants explicitement liés au responsable.",
  },
  student: {
    title: "Espace élève",
    description:
      "Vue locale de démonstration du dossier, des annonces et de l’assiduité de l’élève.",
  },
};
const roleLabels: Record<SchoolRole, string> = {
  super_admin: "Super administrateur",
  school_admin: "Administration",
  headmaster: "Chef d’établissement",
  academic_director: "Direction des études",
  supervisor: "Vie scolaire",
  secretary: "Secrétariat",
  head_teacher: "Enseignant principal",
  teacher: "Enseignant",
  guardian: "Parent / responsable",
  student: "Élève",
};
const nav: [string, Array<[PlatformModule, string]>][] = [
  [
    "CONFIGURATION",
    [
      ["administration", "Administration"],
      ["establishment", "Établissement"],
      ["users", "Utilisateurs"],
    ],
  ],
  [
    "SCOLARITÉ",
    [
      ["students", "Élèves"],
      ["guardians", "Parents"],
      ["subjects", "Matières"],
      ["timetable", "Emplois du temps"],
      ["attendance", "Assiduité"],
    ],
  ],
  [
    "COMMUNICATION",
    [
      ["announcements", "Annonces"],
      ["documents", "Documents"],
      ["parent", "Espace parent"],
      ["student", "Espace élève"],
    ],
  ],
];
const moduleResources: Record<PlatformModule, PermissionResource> = {
  establishment: "school",
  administration: "school",
  users: "users",
  students: "students",
  guardians: "guardians",
  subjects: "subjects",
  timetable: "timetable",
  attendance: "attendance",
  announcements: "announcements",
  documents: "documents",
  parent: "students",
  student: "students",
};
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const field = (data: FormData, name: string) =>
  String(data.get(name) || "").trim();
const className = (classes: ClassRecord[], classId: string) =>
  classes.find((item) => item.id === classId)?.name || classId || "—";
const userName = (users: SchoolUser[], userId: string) => {
  const user = users.find((item) => item.id === userId);
  return user ? `${user.firstName} ${user.lastName}` : userId || "—";
};
const subjectName = (subjects: SchoolSubject[], subjectId: string) =>
  subjects.find((item) => item.id === subjectId)?.label || subjectId || "—";
function download(
  name: string,
  content: string,
  type = "text/csv;charset=utf-8",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function PlatformManager({ module, embedded = false }: { module: PlatformModule; embedded?: boolean }) {
  const [workspace, setWorkspace] = useState<PlatformWorkspace>(
    defaultPlatformWorkspace,
  );
  const [mode, setMode] = useState<StorageMode>("demo");
  const [message, setMessage] = useState("Chargement local…");
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<SchoolRole>("school_admin");
  const subscriptionAccess = useSubscriptionAccess();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  useEffect(() => {
    const refreshClasses = async () => {
      const result = await loadActiveSchoolClasses();
      setClasses(result.items);
    };
    void refreshClasses();
    void loadPlatformWorkspace()
      .then((result) => {
        setWorkspace(result.workspace);
        setMode(result.mode);
        setMessage(result.message);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Chargement pédagogique indisponible.");
      })
      .finally(() => setLoading(false));
    const onStorage = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (!detail?.key || detail.key === STORAGE_KEYS.classes || detail.key === LEGACY_KEYS.classes || detail.key === STORAGE_KEYS.activeSchool) {
        void refreshClasses();
      }
    };
    window.addEventListener("gabon-educ:storage", onStorage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("gabon-educ:storage", onStorage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  async function persist(
    next: PlatformWorkspace,
    metadata: SyncOperationMetadata | readonly SyncOperationMetadata[],
    note = "Modifications enregistrées.",
  ) {
    const context = {
      role,
      userId: "local-user",
      schoolId: workspace.school?.id || "local",
    };
    const resource = moduleResources[module];
    if (
      !hasPermission("create", resource, context, workspace) &&
      !hasPermission("update", resource, context, workspace)
    ) {
      setMessage(
        `Lecture seule pour le rôle « ${roleLabels[role]} » dans ce module.`,
      );
      return false;
    }

    setMessage("Vérification des droits et de l’abonnement…");

    // Le sélecteur de rôle sert aussi aux tests fonctionnels. La session Supabase
    // peut rester super_admin même lorsque l'interface simule un administrateur.
    // Dans ce cas, school_can_write() contournerait volontairement la suspension.
    // On vérifie donc directement l'abonnement pour tous les rôles établissement.
    const schoolId = workspace.school?.id || "";
    if (role !== "super_admin" && (!schoolId || schoolId === "local")) {
      setMessage(
        "Aucun établissement cloud n’est sélectionné. Ouvrez Service abonnements, cliquez sur « Gérer », puis revenez dans ce module.",
      );
      return false;
    }
    if (role !== "super_admin" && schoolId && schoolId !== "local") {
      const { data: strictCanWrite, error: subscriptionError } = await createClient().rpc(
        "school_can_write_strict",
        { target_school: schoolId },
      );

      if (subscriptionError) {
        setMessage(
          "Vérification de l’abonnement impossible. Par sécurité, aucune modification n’a été enregistrée.",
        );
        return false;
      }

      if (strictCanWrite !== true) {
        setMessage(
          "Votre établissement est suspendu. Les données restent consultables, mais les créations, modifications et suppressions sont désactivées jusqu’à la régularisation de l’abonnement.",
        );
        return false;
      }
    }

    const result = await savePlatformWorkspace(next, metadata);
    setWorkspace(result.workspace);
    setMode(result.mode);
    setMessage(result.blocked ? result.message : note || result.message);
    // Les messages s'affichent en haut de page, alors que les tableaux d'action
    // se trouvent souvent tout en bas : sans ce défilement, l'utilisateur clique
    // et ne voit rien se produire, y compris lorsque l'opération est refusée.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    return !result.blocked;
  }
  const meta = labels[module];
  const subscriptionBlocked = role !== "super_admin" && (subscriptionAccess.blocked || message.startsWith("Votre établissement est suspendu."));
  const subscriptionMessage = subscriptionAccess.message || message;
  return (
    <main className={embedded ? `${styles.page} ${styles.embedded}` : styles.page}>
      {!embedded && <header className={styles.topbar}>
        <div className={styles.brand}>
          <Brand />
          <div>
            <b>Plateforme établissement</b>
            <small>{workspace.school?.name || "Configuration locale"}</small>
          </div>
        </div>
        <div className={styles.topActions}>
          <span className={styles.demo}>
            {mode === "cloud"
              ? "Données synchronisées"
              : "Démonstration locale — sécurité serveur non simulée"}
          </span>
          <select
            className={styles.role}
            value={role}
            onChange={(event) => setRole(event.target.value as SchoolRole)}
            aria-label="Rôle simulé"
          >
            {Object.entries(roleLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </header>}
      <div className={embedded ? `${styles.layout} ${styles.embeddedLayout}` : styles.layout}>
        {!embedded && <aside className={styles.nav}>
          <Link href="/gabon-educ/tableau-de-bord">← Tableau de bord</Link>
          {nav.map(([group, items]) => (
            <div key={group}>
              <b>{group}</b>
              {items.map(([key, label]) => (
                <Link
                  key={key}
                  href={`/gabon-educ/${key === "establishment" ? "etablissement" : key === "users" ? "utilisateurs" : key === "students" ? "eleves" : key === "guardians" ? "parents" : key === "subjects" ? "matieres" : key === "timetable" ? "emplois-du-temps" : key === "attendance" ? "assiduite" : key === "announcements" ? "annonces" : key === "parent" ? "espace-parent" : key === "student" ? "espace-eleve" : key}`}
                >
                  {label}
                </Link>
              ))}
              {group === "SCOLARITÉ" && (
                <Link href="/gabon-educ/inscriptions">Inscriptions</Link>
              )}
            </div>
          ))}
        </aside>}
        <section className={embedded ? `${styles.main} ${styles.embeddedMain}` : styles.main}>
          <div className={styles.heading}>
            <div>
              <h1>{meta.title}</h1>
              <p>{meta.description}</p>
            </div>
            {!subscriptionBlocked && (
              <span className={styles.mode}>
                {loading ? "Chargement…" : message}
              </span>
            )}
          </div>
          {!embedded && <AcademicWeekStrip compact title="Semaines de l’année scolaire" />}
          {subscriptionBlocked && (
            <section className={styles.subscriptionBlocked} role="alert" aria-live="assertive">
              <div className={styles.subscriptionBlockedIcon} aria-hidden="true">
                <ShieldAlert />
              </div>
              {/*
                Le titre doit correspondre à la cause réelle. Annoncer une
                suspension d'abonnement pour un incident réseau inquiète
                inutilement l'établissement et masque le vrai problème.
              */}
              <h2>
                {subscriptionMessage.startsWith("Votre établissement est suspendu.")
                  ? "Votre établissement est suspendu."
                  : "Modifications temporairement indisponibles."}
              </h2>
              <p>
                {subscriptionMessage || "Les données restent consultables, mais les créations, modifications et suppressions sont désactivées jusqu’à la régularisation de l’abonnement."}
              </p>
              <span className={styles.readOnlyBadge}>
                <LockKeyhole aria-hidden="true" />
                Accès en lecture seule
              </span>
            </section>
          )}
          {!loading && (
            <fieldset className="subscription-write-lock" disabled={subscriptionBlocked}>
              <ModuleView
                module={module}
                workspace={workspace}
                classes={classes}
                role={role}
                persist={persist}
              />
            </fieldset>
          )}
        </section>
      </div>
    </main>
  );
}

type ViewProps = {
  workspace: PlatformWorkspace;
  classes: ClassRecord[];
  role: SchoolRole;
  persist: (
    next: PlatformWorkspace,
    metadata: SyncOperationMetadata | readonly SyncOperationMetadata[],
    note?: string,
  ) => Promise<boolean>;
};
function ModuleView({
  module,
  ...props
}: ViewProps & { module: PlatformModule }) {
  switch (module) {
    case "establishment":
      return <EstablishmentView {...props} />;
    case "administration":
      return <AdministrationView {...props} />;
    case "users":
      return <UsersView {...props} />;
    case "students":
      return <StudentsView {...props} />;
    case "guardians":
      return <GuardiansView {...props} />;
    case "subjects":
      return <SubjectsView {...props} />;
    case "timetable":
      return <TimetableView {...props} />;
    case "attendance":
      return <AttendanceView {...props} />;
    case "announcements":
      return <AnnouncementsView {...props} />;
    case "documents":
      return <DocumentsView {...props} />;
    case "parent":
      return <PortalView {...props} kind="parent" />;
    case "student":
      return <PortalView {...props} kind="student" />;
  }
}

function EstablishmentView({ workspace, persist }: ViewProps) {
  const detected = detectV07Data();
  const hasLegacy =
    Object.values(detected).some(Boolean) &&
    !workspace.migrationJournal.some((item) => item.status === "confirmed");
  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(event.currentTarget);
    const schoolId = workspace.school?.id || id();
    const yearId = workspace.academicYears[0]?.id || id();
    const created = now();
    const saved = await persist(
      {
        ...workspace,
        school: {
          id: schoolId,
          name: field(data, "name"),
          acronym: field(data, "acronym"),
          schoolType: PRODUCT.defaultSchoolType,
          schoolSector: workspace.school?.schoolSector || "private",
          registrationNumber: field(data, "registrationNumber"),
          province: field(data, "province"),
          city: field(data, "city"),
          district: "",
          neighborhood: "",
          address: field(data, "address"),
          phone: field(data, "phone"),
          email: field(data, "email"),
          website: "",
          logoUrl: field(data, "logoUrl"),
          stampUrl: "",
          headName: field(data, "headName"),
          motto: field(data, "motto"),
          activeAcademicYearId: yearId,
          periodSystem: field(data, "periodSystem") as "trimester" | "semester",
          maxScore: Number(field(data, "maxScore")) || PRODUCT.maxScore,
          passThreshold: Number(field(data, "passThreshold")) || PRODUCT.passThreshold,
          bulletinModel: "configurable",
          timezone: "Africa/Libreville",
          language: "fr",
          isActive: true,
          createdAt: workspace.school?.createdAt || created,
          updatedAt: created,
        },
        academicYears: workspace.academicYears.length
          ? workspace.academicYears
          : [
              {
                id: yearId,
                schoolId,
                label: field(data, "academicYear") || "2026-2027",
                startsOn: "2026-09-01",
                endsOn: "2027-07-31",
                active: true,
                archived: false,
                createdAt: created,
                updatedAt: created,
              },
            ],
        periods: workspace.periods.length
          ? workspace.periods
          : Array.from(
              { length: field(data, "periodSystem") === "semester" ? 2 : 3 },
              (_, index) => ({
                id: id(),
                schoolId,
                academicYearId: yearId,
                label: `${field(data, "periodSystem") === "semester" ? "Semestre" : "Trimestre"} ${index + 1}`,
                startsOn: "",
                endsOn: "",
                active: index === 0,
                locked: false,
                lockedAt: "",
                reopenedReason: "",
                updatedAt: created,
              }),
            ),
        levels: getDefaultLevelsForSchoolType(PRODUCT.defaultSchoolType).map((code) => ({
          id: workspace.levels.find((level) => level.code === code)?.id || id(),
          schoolId,
          code,
          label: code,
          cycle: levelCycleForCode(code),
          active: true,
        })),
      },
      {
        module: "settings",
        operation: workspace.school ? "update" : "create",
        entityId: schoolId,
        payload: { schoolId, yearId },
        baseUpdatedAt: workspace.updatedAt || null,
      },
      "Établissement et structure scolaire enregistrés.",
    );
    if (saved && schoolId && schoolId !== "local") {
      const { error } = await createClient()
        .from("schools")
        .update({
          name: field(data, "name"),
          school_type: PRODUCT.defaultSchoolType,
          school_sector: workspace.school?.schoolSector || "private",
          registration_number: field(data, "registrationNumber"),
          province: field(data, "province"),
          city: field(data, "city"),
          address: field(data, "address"),
          phone: field(data, "phone"),
          email: field(data, "email"),
          logo_url: field(data, "logoUrl"),
          updated_at: created,
        })
        .eq("id", schoolId);
      if (error) {
        console.warn(`Configuration enregistrée localement, mais la fiche établissement n’a pas été synchronisée : ${error.message}`);
      }
    }
  }
  async function migrate() {
    if (!workspace.school || !workspace.academicYears[0]) return;
    const result = migrateV07Classes(
      workspace,
      workspace.school.id,
      workspace.academicYears[0].id,
    );
    await persist(
      result.workspace,
      {
        module: "settings",
        operation: "update",
        entityId: workspace.school.id,
        payload: { migration: "v0.7", imported: result.imported },
      },
      `${result.imported} élève(s) importé(s) sans doublon.`,
    );
  }
  return (
    <>
      <div className={styles.warning}>
        Modèle configurable de bulletin scolaire — à adapter aux exigences de
        l’établissement et aux textes officiels applicables.
      </div>
      {hasLegacy && (
        <div className={styles.card}>
          <h2>Données v0.7.0 détectées</h2>
          <p>
            Des données de la version précédente ont été détectées.
            Souhaitez-vous les intégrer à l’établissement ? Classes :{" "}
            {detected.classes}, élèves : {detected.students}, évaluations :{" "}
            {detected.evaluations}, fiches : {detected.lessons}.
          </p>
          <div className={styles.actions}>
            <button
              className={styles.button}
              disabled={!workspace.school}
              onClick={() => void migrate()}
            >
              Confirmer l’intégration
            </button>
          </div>
        </div>
      )}
      <form className={`${styles.card} ${styles.form}`} onSubmit={configure}>
        <h2>
          {workspace.school
            ? "Paramètres de l’établissement"
            : "Assistant de première configuration"}
        </h2>
        {workspace.school && (
          <p className={styles.profileSummary}>
            Profil actuel : <strong>{formatSchoolProfile(workspace.school.schoolType, workspace.school.schoolSector)}</strong>
          </p>
        )}
        <div className={styles.two}>
          <label>
            Nom de l’établissement
            <input name="name" required defaultValue={workspace.school?.name} />
          </label>
          <label>
            Sigle
            <input name="acronym" defaultValue={workspace.school?.acronym} />
          </label>
        </div>
        <div className={styles.three}>
          <label>
            N° d’enregistrement
            <input
              name="registrationNumber"
              defaultValue={workspace.school?.registrationNumber}
            />
          </label>
          <label>
            Province
            <input
              name="province"
              defaultValue={workspace.school?.province || "Estuaire"}
            />
          </label>
        </div>
        <div className={styles.three}>
          <label>
            Ville
            <input
              name="city"
              defaultValue={workspace.school?.city || "Libreville"}
            />
          </label>
          <label>
            Adresse
            <input name="address" defaultValue={workspace.school?.address} />
          </label>
          <label>
            Téléphone
            <input name="phone" defaultValue={workspace.school?.phone} />
          </label>
        </div>
        <div className={styles.three}>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              defaultValue={workspace.school?.email}
            />
          </label>
          <label>
            Chef d’établissement
            <input name="headName" defaultValue={workspace.school?.headName} />
          </label>
          <label>
            Logo (URL)
            <input name="logoUrl" defaultValue={workspace.school?.logoUrl} />
          </label>
        </div>
        <div className={styles.two}>
          <label>
            Devise
            <input name="motto" defaultValue={workspace.school?.motto} />
          </label>
          <label>
            Année scolaire
            <input
              name="academicYear"
              defaultValue={workspace.academicYears[0]?.label || "2026-2027"}
            />
          </label>
        </div>
        <div className={styles.three}>
          <label>
            Découpage
            <select
              name="periodSystem"
              defaultValue={workspace.school?.periodSystem || "trimester"}
            >
              <option value="trimester">Trimestres</option>
              <option value="semester">Semestres</option>
            </select>
          </label>
          <label>
            Note maximale
            <input
              name="maxScore"
              type="number"
              min="1"
              defaultValue={workspace.school?.maxScore || 20}
            />
          </label>
          <label>
            Seuil de réussite
            <input
              name="passThreshold"
              type="number"
              min="0"
              defaultValue={workspace.school?.passThreshold || 10}
            />
          </label>
        </div>
        <div className={styles.actions}>
          <button className={styles.button} type="submit">
            Enregistrer la configuration
          </button>
        </div>
      </form>
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Périodes</h2>
          <p>
            Une période verrouillée doit être réouverte par un rôle autorisé
            avec un motif.
          </p>
          <div className={styles.checklist}>
            {workspace.periods.map((period) => (
              <span key={period.id}>
                <b>{period.label}</b> · {period.active ? "active" : "inactive"}{" "}
                · {period.locked ? "verrouillée" : "modifiable"}
              </span>
            ))}
          </div>
        </section>
        <section className={styles.card}>
          <h2>Journal de migration</h2>
          <p>
            Les imports de données antérieures sont tracés et ne suppriment pas
            les clés v0.7.0.
          </p>
          <div className={styles.checklist}>
            {workspace.migrationJournal.length ? (
              workspace.migrationJournal.map((item) => (
                <span key={item.id}>
                  {new Date(item.detectedAt).toLocaleString("fr-FR")} ·{" "}
                  {item.status} · {item.importedCounts.students || 0} élève(s)
                </span>
              ))
            ) : (
              <span>Aucune migration confirmée.</span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function AdministrationView({ workspace, classes }: ViewProps) {
  const stats = platformStatistics(workspace, classes.map((item) => item.id));
  const items = [
    ["Élèves actifs", stats.studentCount],
    ["Enseignants actifs", stats.teacherCount],
    ["Classes actives", stats.classCount],
    ["Absences aujourd’hui", stats.todayAbsences],
    ["Invitations en attente", stats.pendingInvitations],
    ["Périodes ouvertes", stats.activePeriods],
    ["Matières non affectées", stats.unassignedSubjects],
    ["Conflits d’emploi du temps", stats.conflictCount],
  ];
  return (
    <>
      <div className={styles.stats}>
        {items.map(([label, value]) => (
          <article className={styles.stat} key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <span>Donnée calculée</span>
          </article>
        ))}
      </div>
      <div className={styles.grid}>
        <section className={styles.card}>
          <h2>Contrôles prioritaires</h2>
          <p>
            Les alertes ne sont jamais remplacées par des valeurs inventées.
          </p>
          <div className={styles.checklist}>
            <span>
              {stats.classesWithoutHeadTeacher > 0
                ? `⚠ ${stats.classesWithoutHeadTeacher} classe(s) sans enseignant principal.`
                : "✓ Enseignants principaux renseignés."}
            </span>
            <span>
              {stats.unassignedSubjects > 0
                ? `⚠ ${stats.unassignedSubjects} matière(s) sans affectation.`
                : "✓ Matières affectées."}
            </span>
            <span>
              {stats.conflictCount > 0
                ? `⚠ ${stats.conflictCount} conflit(s) de planning à résoudre.`
                : "✓ Aucun conflit de planning."}
            </span>
          </div>
        </section>
        <section className={styles.card}>
          <h2>Protection des données</h2>
          <p>
            Les permissions locales servent à tester l’interface. La sécurité
            réelle dépend des politiques RLS Supabase.
          </p>
          <div className={styles.checklist}>
            <span>
              Établissement actif : {workspace.school?.name || "non configuré"}
            </span>
            <span>
              Année active :{" "}
              {workspace.academicYears.find((item) => item.active)?.label ||
                "non configurée"}
            </span>
            <span>Annonces publiées : {stats.publishedAnnouncements}</span>
          </div>
        </section>
      </div>
    </>
  );
}

function UsersView({ workspace, persist }: ViewProps) {
  const [feedback, setFeedback] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form),
      created = now();
    const firstName = field(data, "firstName");
    const lastName = field(data, "lastName");
    const rawIdentifier = field(data, "identifier") || suggestAccessIdentifier(firstName, lastName, workspace.school?.acronym || workspace.school?.name || "ge");
    const accessIdentifier = normalizeAccessIdentifier(rawIdentifier);
    const temporaryPassword = field(data, "password");
    const role = field(data, "role") as SchoolRole;
    const classId = field(data, "classId");
    const authEmail = buildAccessEmail(accessIdentifier);

    if (!accessIdentifier || temporaryPassword.length < 8) {
      setFeedback("L’identifiant est obligatoire et le mot de passe doit contenir au moins 8 caractères.");
      return;
    }

    let remoteUserId = id();
    const schoolId = workspace.school?.id || "local";

    try {
      if (schoolId !== "local" && /^[0-9a-f-]{36}$/i.test(schoolId)) {
        const response = await fetch("/api/gabon-educ/access/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            schoolId,
            firstName,
            lastName,
            phone: field(data, "phone"),
            role,
            classId,
            guardianId: field(data, "guardianId"),
            studentId: field(data, "studentId"),
            identifier: accessIdentifier,
            password: temporaryPassword,
          }),
        });
        let payload = await response.json().catch(() => ({}));
        if (!response.ok && payload.code === "ADMIN_KEY_REQUIRED") {
          const serviceRoleKey = window.prompt(
            "Configuration unique sur cet ordinateur : collez la clé Supabase service_role. Elle sera conservée uniquement côté serveur local."
          );
          if (!serviceRoleKey) throw new Error("Configuration serveur annulée.");
          const configResponse = await fetch("/api/gabon-educ/admin-config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ serviceRoleKey }),
          });
          const configPayload = await configResponse.json().catch(() => ({}));
          if (!configResponse.ok) throw new Error(configPayload.error || "Configuration serveur impossible.");
          const retry = await fetch("/api/gabon-educ/access/create", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              schoolId, firstName, lastName,
              phone: field(data, "phone"), role, classId,
              guardianId: field(data, "guardianId"),
              studentId: field(data, "studentId"),
              identifier: accessIdentifier, password: temporaryPassword,
            }),
          });
          payload = await retry.json().catch(() => ({}));
          if (!retry.ok) throw new Error(payload.error || "Création de l’accès impossible.");
        } else if (!response.ok) {
          throw new Error(payload.error || "Création de l’accès impossible.");
        }
        remoteUserId = String(payload.id || remoteUserId);
        // Le compte existe, mais sans rattachement son espace restera vide :
        // mieux vaut le dire tout de suite que de laisser la famille le découvrir.
        if (payload.linkWarning) setFeedback(String(payload.linkWarning));
      }

      const user: SchoolUser = {
        id: remoteUserId,
        schoolId,
        firstName,
        lastName,
        email: authEmail,
        authEmail,
        accessIdentifier,
        mustChangePassword: true,
        phone: field(data, "phone"),
        role,
        status: "active",
        scopeClassIds: classId ? [classId] : [],
        invitationStatus: "accepted",
        invitedAt: created,
        expiresAt: "",
        createdAt: created,
        updatedAt: created,
      };
      await persist(
        { ...workspace, users: [user, ...workspace.users.filter((item) => item.id !== user.id)] },
        {
          module: "users",
          operation: "create",
          entityId: user.id,
          payload: { user },
        },
        `Accès créé : identifiant ${accessIdentifier}`,
      );
      setFeedback(`Accès créé. Identifiant : ${accessIdentifier}. Mot de passe provisoire : ${temporaryPassword}`);
      form.reset();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Création de l’accès impossible.");
    }
  }
  /**
   * Gestion d'un compte existant.
   *
   * L'ancienne version écrivait dans school_invitations, table étrangère à la
   * connexion : le compte « suspendu » restait utilisable. Tout passe désormais
   * par une route serveur qui agit sur access_credentials, la table réellement
   * lue à l'ouverture de session.
   */
  async function manageAccount(
    user: SchoolUser,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    const schoolId = workspace.school?.id || "";
    if (!schoolId) {
      setFeedback("Établissement actif non résolu.");
      return false;
    }
    setFeedback("");
    try {
      const response = await fetch("/api/gabon-educ/access/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schoolId, userId: user.id, ...body }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(payload.error || "Opération impossible.");
        return false;
      }
      setFeedback(payload.message || "Opération effectuée.");
      // La liste des comptes vient du serveur : on la relit plutôt que de
      // deviner localement le nouvel état.
      window.dispatchEvent(new Event("gabon-educ:subscription-changed"));
      window.location.reload();
      return true;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Opération impossible.");
      return false;
    }
  }

  async function toggle(user: SchoolUser) {
    const status = user.status === "suspended" ? "active" : "suspended";
    if (
      status === "suspended" &&
      !confirm(`Suspendre ${user.firstName} ${user.lastName} ? Son identifiant ne permettra plus de se connecter.`)
    )
      return;
    await manageAccount(user, { action: "status", status });
  }

  async function renameAccount(user: SchoolUser) {
    const firstName = prompt("Prénom", user.firstName);
    if (firstName === null) return;
    const lastName = prompt("Nom", user.lastName);
    if (lastName === null) return;
    const identifier = prompt(
      "Identifiant de connexion (laisser tel quel pour ne pas le changer)",
      user.accessIdentifier,
    );
    if (identifier === null) return;
    await manageAccount(user, {
      action: "update",
      firstName,
      lastName,
      phone: user.phone,
      ...(identifier && identifier !== user.accessIdentifier ? { identifier } : {}),
    });
  }

  async function removeAccount(user: SchoolUser) {
    if (
      !confirm(
        `Supprimer définitivement l’accès de ${user.firstName} ${user.lastName} ?\n\nLa fiche de la personne (élève, parent, personnel) est conservée : seul l’identifiant de connexion est supprimé.`,
      )
    )
      return;
    await manageAccount(user, { action: "delete" });
  }
  return (
    <>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <h2>Créer un accès utilisateur</h2>
        <p>
          L’utilisateur recevra un identifiant et un mot de passe provisoire. L’e-mail technique reste invisible pour lui et sert seulement à Supabase Auth.
        </p>
        <div className={styles.three}>
          <label>
            Prénom
            <input name="firstName" required />
          </label>
          <label>
            Nom
            <input name="lastName" required />
          </label>
          <label>
            Identifiant / code d’accès
            <input name="identifier" required placeholder="ex. ondo.antier" />
          </label>
        </div>
        <div className={styles.three}>
          <label>
            Mot de passe provisoire
            <input name="password" type="text" minLength={8} required placeholder="8 caractères minimum" />
          </label>
          <label>
            Téléphone
            <input name="phone" />
          </label>
          <label>
            Rôle
            <select name="role">
              {Object.entries(roleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.three}>
          <label>
            Classe limitée
            <select name="classId">
              <option value="">Toutes selon le rôle</option>
              {readClasses().map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          {/*
            Rattachement du compte à la personne qu'il représente. Sans lui, un
            parent se connecte mais son espace reste vide : l'application ignore
            de quels enfants il répond. C'est ici que le lien doit se faire,
            pendant que le secrétariat a la personne devant lui.
          */}
          <label>
            Fiche du responsable <span>(comptes parents)</span>
            <select name="guardianId">
              <option value="">Aucune — l’espace parent restera vide</option>
              {workspace.guardians.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.lastName} {item.firstName}
                  {item.phone ? ` · ${item.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dossier de l’élève <span>(comptes élèves)</span>
            <select name="studentId">
              <option value="">Aucun — l’espace élève restera vide</option>
              {workspace.students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.lastName} {item.firstName}
                </option>
              ))}
            </select>
          </label>
        </div>
        {feedback && <p className={styles.notice}>{feedback}</p>}
        <div className={styles.actions}>
          <button className={styles.button}>Créer l’accès</button>
        </div>
      </form>
      <DataTable
        headers={[
          "Utilisateur",
          "Identifiant",
          "Rôle",
          "Statut",
          "Périmètre",
          "Action",
        ]}
        rows={workspace.users.map((user) => [
          `${user.firstName} ${user.lastName}\n${user.phone || ""}`,
          user.accessIdentifier || user.email || "—",
          roleLabels[user.role],
          user.status,
          user.scopeClassIds.join(", ") || "Selon affectations",
          <span key={user.id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => void renameAccount(user)}
              title="Corriger le nom ou l’identifiant"
            >
              Modifier
            </button>
            <button
              className={`${styles.button} ${user.status === "suspended" ? styles.buttonSecondary : styles.buttonDanger}`}
              onClick={() => void toggle(user)}
            >
              {user.status === "suspended" ? "Réactiver" : "Suspendre"}
            </button>
            <button
              className={`${styles.button} ${styles.buttonDanger}`}
              onClick={() => void removeAccount(user)}
              title="Supprimer définitivement cet identifiant de connexion"
            >
              Supprimer
            </button>
          </span>,
        ])}
      />
    </>
  );
}

function StudentsView({ workspace, classes, persist }: ViewProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form),
      created = now();
    const student: StudentRecord = {
      id: id(),
      schoolId: workspace.school?.id || "local",
      academicYearId:
        workspace.academicYears.find((item) => item.active)?.id || "local",
      classId: field(data, "classId"),
      registrationNumber: field(data, "registrationNumber"),
      firstName: field(data, "firstName"),
      lastName: field(data, "lastName"),
      gender: field(data, "gender") as StudentRecord["gender"],
      dateOfBirth: field(data, "dateOfBirth"),
      placeOfBirth: field(data, "placeOfBirth"),
      nationality: field(data, "nationality") || "Gabonaise",
      photoUrl: "",
      address: field(data, "address"),
      phone: field(data, "phone"),
      email: field(data, "email"),
      previousSchool: "",
      enrolledOn: new Date().toISOString().slice(0, 10),
      status: "active",
      specialNeeds: "",
      emergencyContact: field(data, "emergencyContact"),
      administrativeNotes: "",
      limitedMedicalNotes: "",
      createdAt: created,
      updatedAt: created,
    };
    await persist(
      { ...workspace, students: [student, ...workspace.students] },
      {
        module: "students",
        operation: "create",
        entityId: student.id,
        payload: { student },
      },
    );
    form.reset();
  }
  async function importCsv(file: File) {
    const text = await file.text();
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter(Boolean);
    const separator = lines[0]?.includes(";") ? ";" : ",";
    const rows = lines.slice(/nom|prénom|prenom/i.test(lines[0] || "") ? 1 : 0);
    const created = now(),
      newStudents = rows
        .map((line) => line.split(separator))
        .filter((row) => row[0] && row[1])
        .map((row) => ({
          id: id(),
          schoolId: workspace.school?.id || "local",
          academicYearId: workspace.academicYears[0]?.id || "local",
          classId: row[4]?.trim() || classes[0]?.id || "",
          registrationNumber: row[2]?.trim() || "",
          firstName: row[1].trim(),
          lastName: row[0].trim(),
          gender: "" as const,
          dateOfBirth: row[3]?.trim() || "",
          placeOfBirth: "",
          nationality: "Gabonaise",
          photoUrl: "",
          address: "",
          phone: "",
          email: "",
          previousSchool: "",
          enrolledOn: new Date().toISOString().slice(0, 10),
          status: "active" as const,
          specialNeeds: "",
          emergencyContact: "",
          administrativeNotes: "Import CSV",
          limitedMedicalNotes: "",
          createdAt: created,
          updatedAt: created,
        }));
    await persist(
      { ...workspace, students: [...newStudents, ...workspace.students] },
      newStudents.map((student) => ({
        module: "students" as const,
        operation: "create" as const,
        entityId: student.id,
        payload: { student },
      })),
      `${newStudents.length} élève(s) importé(s).`,
    );
  }
  function exportCsv() {
    download(
      "eleves-v0.8.0.csv",
      [
        "Nom;Prénom;Matricule;Naissance;Classe",
        ...workspace.students.map((item) =>
          [
            item.lastName,
            item.firstName,
            item.registrationNumber,
            item.dateOfBirth,
            item.classId,
          ]
            .map((value) => `"${value.replace(/"/g, '""')}"`)
            .join(";"),
        ),
      ].join("\n"),
    );
  }
  async function move(student: StudentRecord) {
    const target = prompt(
      "Identifiant de la classe de destination",
      student.classId,
    );
    if (!target) return;
    const movedStudent = transferStudent(
      workspace.students,
      student.id,
      target,
      workspace.academicYears[0]?.id || student.academicYearId,
    ).find((item) => item.id === student.id);
    if (!movedStudent) return;
    await persist(
      {
        ...workspace,
        students: workspace.students.map((item) =>
          item.id === student.id ? movedStudent : item,
        ),
      },
      {
        module: "students",
        operation: "update",
        entityId: student.id,
        payload: { student: movedStudent },
        baseUpdatedAt: student.updatedAt,
      },
      "Transfert enregistré dans le dossier élève.",
    );
  }
  async function archive(student: StudentRecord) {
    const archivedStudent: StudentRecord = {
      ...student,
      status: "archived",
      updatedAt: now(),
    };
    await persist(
      {
        ...workspace,
        students: workspace.students.map((item) =>
          item.id === student.id ? archivedStudent : item,
        ),
      },
      {
        module: "students",
        operation: "update",
        entityId: student.id,
        payload: { student: archivedStudent },
        baseUpdatedAt: student.updatedAt,
      },
    );
  }
  /**
   * Suppression définitive d'un dossier d'élève.
   *
   * L'archivage convient à un départ en cours d'année ; il ne règle pas la
   * saisie erronée ou le doublon, qui doivent disparaître. On refuse toutefois
   * de détruire un dossier porteur d'informations : responsables rattachés ou
   * compte de connexion. L'utilisateur retire d'abord ces éléments.
   */
  async function removeStudent(student: StudentRecord) {
    const links = workspace.guardianLinks.filter((item) => item.studentId === student.id);
    if (links.length) {
      const names = links
        .map((link) => workspace.guardians.find((item) => item.id === link.guardianId))
        .filter(Boolean)
        .map((guardian) => `${guardian?.firstName} ${guardian?.lastName}`);
      alert(
        `Suppression impossible : ${links.length} responsable(s) sont rattachés à cet élève${names.length ? ` (${names.join(", ")})` : ""}. Retirez ces liens dans Parents et responsables, puis recommencez.`,
      );
      return;
    }
    if (
      !confirm(
        `Supprimer définitivement le dossier de ${student.firstName} ${student.lastName} ?\n\nCette action est irréversible. Pour un élève qui quitte l’établissement, préférez « Archiver », qui conserve son historique.`,
      )
    )
      return;
    await persist(
      {
        ...workspace,
        students: workspace.students.filter((item) => item.id !== student.id),
      },
      {
        module: "students",
        operation: "delete",
        entityId: student.id,
        payload: {},
        baseUpdatedAt: student.updatedAt,
      },
      "Dossier supprimé.",
    );
  }

  return (
    <>
      <form className={`${styles.card} ${styles.form}`} onSubmit={add}>
        <h2>Ajouter un élève</h2>
        <div className={styles.three}>
          <label>
            Prénom
            <input name="firstName" required />
          </label>
          <label>
            Nom
            <input name="lastName" required />
          </label>
          <label>
            Matricule
            <input name="registrationNumber" />
          </label>
        </div>
        <div className={styles.three}>
          <label>
            Classe
            <select name="classId" required>
              <option value="">Choisir</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Genre
            <select name="gender">
              <option value="">Non renseigné</option>
              <option value="female">Féminin</option>
              <option value="male">Masculin</option>
            </select>
          </label>
          <label>
            Date de naissance
            <input type="date" name="dateOfBirth" />
          </label>
        </div>
        <div className={styles.three}>
          <label>
            Lieu de naissance
            <input name="placeOfBirth" />
          </label>
          <label>
            Nationalité
            <input name="nationality" defaultValue="Gabonaise" />
          </label>
          <label>
            Urgence
            <input name="emergencyContact" />
          </label>
        </div>
        <div className={styles.two}>
          <label>
            Adresse
            <input name="address" />
          </label>
          <label>
            E-mail
            <input name="email" type="email" />
          </label>
        </div>
        <input
          className={styles.file}
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importCsv(file);
          }}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={() => fileRef.current?.click()}
          >
            Importer CSV
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={exportCsv}
          >
            Exporter CSV
          </button>
          <button className={styles.button}>Ajouter</button>
        </div>
      </form>
      <DataTable
        headers={[
          "Élève",
          "Matricule",
          "Classe",
          "Naissance",
          "Statut",
          "Actions",
        ]}
        rows={workspace.students.map((student) => [
          `${student.lastName} ${student.firstName}`,
          student.registrationNumber || "—",
          className(classes, student.classId),
          student.dateOfBirth || "—",
          student.status,
          <div key={student.id} className={styles.actions}>
            <button
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => void move(student)}
            >
              Transférer
            </button>
            <button
              className={`${styles.button} ${styles.buttonDanger}`}
              onClick={() => void archive(student)}
              title="Conserve le dossier et son historique, mais le retire des listes actives"
            >
              Archiver
            </button>
            <button
              className={`${styles.button} ${styles.buttonDanger}`}
              onClick={() => void removeStudent(student)}
              title="Efface définitivement le dossier — réservé aux erreurs de saisie et aux doublons"
            >
              Supprimer
            </button>
          </div>,
        ])}
      />
    </>
  );
}

function GuardiansView({ workspace, persist }: ViewProps) {
  const [editing, setEditing] = useState<Guardian | null>(null);
  const [notice, setNotice] = useState("");

  /**
   * Correction d'une fiche existante. Les liens avec les élèves ne sont pas
   * touchés : on ne corrige ici que l'identité et les coordonnées du
   * responsable.
   */
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const guardian: Guardian = {
      ...editing,
      firstName: field(data, "firstName"),
      lastName: field(data, "lastName"),
      phone: field(data, "phone"),
      email: field(data, "email"),
      address: field(data, "address"),
      contactAllowed: data.get("contactAllowed") === "on",
      updatedAt: now(),
    };
    const done = await persist(
      {
        ...workspace,
        guardians: workspace.guardians.map((item) => (item.id === guardian.id ? guardian : item)),
      },
      {
        module: "guardians",
        operation: "update",
        entityId: guardian.id,
        payload: { guardian },
        baseUpdatedAt: editing.updatedAt,
      },
      "Responsable mis à jour.",
    );
    if (done) setEditing(null);
  }

  /**
   * Suppression d'un responsable. Conformément au principe retenu, on refuse
   * et on explique plutôt que de détruire en chaîne : un responsable qui
   * dispose d'un compte de connexion doit d'abord voir cet accès supprimé,
   * sans quoi le compte resterait rattaché à une fiche disparue.
   */
  async function removeGuardian(guardian: Guardian) {
    setNotice("");
    const account = workspace.users.find(
      (user) =>
        user.role === "guardian" &&
        `${user.firstName} ${user.lastName}`.trim().toLocaleLowerCase("fr") ===
          `${guardian.firstName} ${guardian.lastName}`.trim().toLocaleLowerCase("fr"),
    );
    if (account) {
      setNotice(
        `Suppression impossible : un compte de connexion (${account.accessIdentifier || account.email}) correspond à ce responsable. Supprimez d’abord cet accès dans Comptes et identifiants.`,
      );
      return;
    }
    const links = workspace.guardianLinks.filter((item) => item.guardianId === guardian.id);
    const children = links
      .map((link) => workspace.students.find((item) => item.id === link.studentId))
      .filter(Boolean)
      .map((child) => `${child?.firstName} ${child?.lastName}`);
    if (
      !confirm(
        children.length
          ? `Supprimer ${guardian.firstName} ${guardian.lastName} ?\n\nSon lien avec ${children.join(", ")} sera également retiré. L’élève, lui, est conservé.`
          : `Supprimer ${guardian.firstName} ${guardian.lastName} ?`,
      )
    )
      return;
    await persist(
      {
        ...workspace,
        guardians: workspace.guardians.filter((item) => item.id !== guardian.id),
        guardianLinks: workspace.guardianLinks.filter((item) => item.guardianId !== guardian.id),
      },
      {
        module: "guardians",
        operation: "delete",
        entityId: guardian.id,
        payload: {},
        baseUpdatedAt: guardian.updatedAt,
      },
      "Responsable supprimé.",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form),
      created = now(),
      guardianId = id();
    const guardian: Guardian = {
      id: guardianId,
      schoolId: workspace.school?.id || "local",
      firstName: field(data, "firstName"),
      lastName: field(data, "lastName"),
      phone: field(data, "phone"),
      email: field(data, "email"),
      address: field(data, "address"),
      contactAllowed: data.get("contactAllowed") === "on",
      status: "active",
      createdAt: created,
      updatedAt: created,
    };
    const link: GuardianLink = {
      id: id(),
      schoolId: guardian.schoolId,
      guardianId,
      studentId: field(data, "studentId"),
      relationship: field(data, "relationship") as GuardianLink["relationship"],
      primary: data.get("primary") === "on",
      createdAt: created,
    };
    await persist(
      {
        ...workspace,
        guardians: [guardian, ...workspace.guardians],
        guardianLinks: [link, ...workspace.guardianLinks],
      },
      {
        module: "guardians",
        operation: "create",
        entityId: guardian.id,
        payload: { guardian, link },
      },
    );
    form.reset();
  }
  return (
    <>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <h2>Ajouter un responsable et son lien</h2>
        <div className={styles.three}>
          <label>
            Prénom
            <input name="firstName" required />
          </label>
          <label>
            Nom
            <input name="lastName" required />
          </label>
          <label>
            Téléphone
            <input name="phone" required />
          </label>
        </div>
        <div className={styles.three}>
          <label>
            E-mail
            <input name="email" type="email" />
          </label>
          <label>
            Élève
            <select name="studentId" required>
              <option value="">Choisir</option>
              {workspace.students
                .filter((item) => item.status === "active")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.lastName} {item.firstName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Lien
            <select name="relationship">
              <option value="father">Père</option>
              <option value="mother">Mère</option>
              <option value="guardian">Responsable</option>
              <option value="legal_guardian">Tuteur légal</option>
              <option value="other">Autre</option>
            </select>
          </label>
        </div>
        <div className={styles.two}>
          <label>
            Adresse
            <input name="address" />
          </label>
          <label>
            <span>Autorisations</span>
            <span>
              <input type="checkbox" name="primary" /> Contact principal ·{" "}
              <input type="checkbox" name="contactAllowed" defaultChecked />{" "}
              Communications autorisées
            </span>
          </label>
        </div>
        <div className={styles.actions}>
          <button className={styles.button}>Enregistrer</button>
        </div>
      </form>
      {editing && (
        <form className={`${styles.card} ${styles.form}`} onSubmit={saveEdit}>
          <h2>
            Corriger la fiche de {editing.firstName} {editing.lastName}
          </h2>
          <div className={styles.three}>
            <label>
              Prénom
              <input name="firstName" defaultValue={editing.firstName} required />
            </label>
            <label>
              Nom
              <input name="lastName" defaultValue={editing.lastName} required />
            </label>
            <label>
              Téléphone
              <input name="phone" defaultValue={editing.phone} required />
            </label>
          </div>
          <div className={styles.two}>
            <label>
              E-mail
              <input name="email" defaultValue={editing.email} />
            </label>
            <label>
              Adresse
              <input name="address" defaultValue={editing.address} />
            </label>
          </div>
          <label>
            <input type="checkbox" name="contactAllowed" defaultChecked={editing.contactAllowed} />{" "}
            Communications autorisées
          </label>
          <div className={styles.actions}>
            <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => setEditing(null)}>
              Annuler
            </button>
            <button className={styles.button}>Enregistrer les corrections</button>
          </div>
        </form>
      )}
      {notice && <p className={`${styles.notice} ${styles.dangerNotice}`}>{notice}</p>}
      <DataTable
        headers={["Responsable", "Contact", "Élève(s)", "Lien", "Autorisé", "Action"]}
        rows={workspace.guardians.map((guardian) => {
          const links = workspace.guardianLinks.filter(
            (item) => item.guardianId === guardian.id,
          );
          return [
            `${guardian.firstName} ${guardian.lastName}`,
            `${guardian.phone}\n${guardian.email}`,
            links
              .map((link) => {
                const child = workspace.students.find(
                  (item) => item.id === link.studentId,
                );
                return child
                  ? `${child.firstName} ${child.lastName}`
                  : "Élève inconnu";
              })
              .join(", "),
            links.map((item) => item.relationship).join(", "),
            guardian.contactAllowed ? "Oui" : "Non",
            <span key={guardian.id} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                onClick={() => {
                  setNotice("");
                  setEditing(guardian);
                }}
              >
                Modifier
              </button>
              <button
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={() => void removeGuardian(guardian)}
              >
                Supprimer
              </button>
            </span>,
          ];
        })}
      />
    </>
  );
}

function SubjectsView({ workspace, classes, persist }: ViewProps) {
  /**
   * Correction d'une matière. Le libellé apparaît sur les bulletins et le
   * coefficient pèse dans les moyennes : une faute de frappe ou un coefficient
   * erroné devait pouvoir se rattraper.
   */
  async function editSubject(subject: SchoolSubject) {
    const label = prompt("Nom de la matière", subject.label);
    if (label === null) return;
    const coefficientText = prompt("Coefficient", String(subject.coefficient));
    if (coefficientText === null) return;
    const coefficient = Number(coefficientText.replace(",", "."));
    if (!Number.isFinite(coefficient) || coefficient <= 0) {
      alert("Le coefficient doit être un nombre strictement positif.");
      return;
    }
    const hoursText = prompt("Volume horaire hebdomadaire", String(subject.weeklyHours || 0));
    if (hoursText === null) return;
    const updated: SchoolSubject = {
      ...subject,
      label: label.trim() || subject.label,
      coefficient,
      weeklyHours: Number(hoursText.replace(",", ".")) || 0,
      updatedAt: now(),
    };
    await persist(
      {
        ...workspace,
        subjects: workspace.subjects.map((item) => (item.id === subject.id ? updated : item)),
      },
      {
        module: "subjects",
        operation: "update",
        entityId: subject.id,
        payload: { subject: updated },
        baseUpdatedAt: subject.updatedAt,
      },
      "Matière corrigée.",
    );
  }

  /**
   * Suppression d'une matière. Refuser et expliquer : une matière encore
   * affectée à une classe ou placée dans un emploi du temps ne peut pas
   * disparaître sans laisser des références orphelines.
   */
  async function removeSubject(subject: SchoolSubject) {
    const linkedAssignments = workspace.assignments.filter(
      (item) => item.active && item.subjectId === subject.id,
    );
    const linkedSlots = workspace.timetable.filter((item) => item.subjectId === subject.id);
    if (linkedAssignments.length || linkedSlots.length) {
      const parts: string[] = [];
      if (linkedAssignments.length)
        parts.push(`${linkedAssignments.length} affectation(s) d’enseignant`);
      if (linkedSlots.length) parts.push(`${linkedSlots.length} créneau(x) d’emploi du temps`);
      alert(
        `Suppression impossible : « ${subject.label} » est encore utilisée par ${parts.join(" et ")}. Retirez-les d’abord, puis recommencez.`,
      );
      return;
    }
    if (!confirm(`Supprimer définitivement la matière « ${subject.label} » ?`)) return;
    await persist(
      {
        ...workspace,
        subjects: workspace.subjects.filter((item) => item.id !== subject.id),
      },
      {
        module: "subjects",
        operation: "delete",
        entityId: subject.id,
        payload: {},
        baseUpdatedAt: subject.updatedAt,
      },
      "Matière supprimée.",
    );
  }

  /**
   * Retrait d'une affectation. C'est aussi le préalable à la suppression d'une
   * matière ou d'un compte enseignant, que l'application refuse tant que des
   * affectations subsistent.
   */
  async function removeAssignment(assignment: TeachingAssignment) {
    const subject = workspace.subjects.find((item) => item.id === assignment.subjectId);
    if (
      !confirm(
        `Retirer ${userName(workspace.users, assignment.teacherId)} de « ${subject?.label || "cette matière"} » en ${className(classes, assignment.classId)} ?`,
      )
    )
      return;
    await persist(
      {
        ...workspace,
        assignments: workspace.assignments.filter((item) => item.id !== assignment.id),
      },
      {
        module: "assignments",
        operation: "delete",
        entityId: assignment.id,
        payload: { assignment },
        baseUpdatedAt: assignment.updatedAt,
      },
      "Affectation retirée.",
    );
  }

  const suggestedSubjects = getDefaultSubjectsForSchoolType(workspace.school?.schoolType || PRODUCT.defaultSchoolType);
  const knownSubjectLabels = new Set(workspace.subjects.map((subject) => subject.label.trim().toLocaleLowerCase("fr")));
  const missingSuggestedSubjects = suggestedSubjects.filter((label) => !knownSubjectLabels.has(label.toLocaleLowerCase("fr")));

  async function installSuggestedSubjects() {
    if (!missingSuggestedSubjects.length) return;
    const created = now();
    const levelId = workspace.levels.find((level) => level.active)?.id || workspace.levels[0]?.id || "";
    const subjects = missingSuggestedSubjects.map((label, index) => ({
      id: id(),
      schoolId: workspace.school?.id || "local",
      code: label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .toUpperCase()
        .slice(0, 18) || `MAT_${index + 1}`,
      label,
      color: "#08734f",
      icon: "book",
      levelId,
      coefficient: workspace.school?.schoolType === "primary" ? 1 : 1,
      weeklyHours: 0,
      category: workspace.school?.schoolType === "primary" ? "Primaire" : "Générale",
      bulletinOrder: workspace.subjects.length + index + 1,
      active: true,
      createdAt: created,
      updatedAt: created,
    }));
    await persist(
      { ...workspace, subjects: [...subjects, ...workspace.subjects] },
      subjects.map((subject) => ({
        module: "subjects" as const,
        operation: "create" as const,
        entityId: subject.id,
        payload: { subject },
      })),
      `${subjects.length} matière(s) du profil ajoutée(s).`,
    );
  }

  async function addSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form),
      created = now();
    const subject: SchoolSubject = {
      id: id(),
      schoolId: workspace.school?.id || "local",
      code: field(data, "code"),
      label: field(data, "label"),
      color: field(data, "color") || "#08734f",
      icon: "book",
      levelId: field(data, "levelId"),
      coefficient: Math.max(0.1, Number(field(data, "coefficient")) || 1),
      weeklyHours: Math.max(0, Number(field(data, "weeklyHours")) || 0),
      category: field(data, "category") || "Générale",
      bulletinOrder: workspace.subjects.length + 1,
      active: true,
      createdAt: created,
      updatedAt: created,
    };
    await persist(
      { ...workspace, subjects: [subject, ...workspace.subjects] },
      {
        module: "subjects",
        operation: "create",
        entityId: subject.id,
        payload: { subject },
      },
    );
    form.reset();
  }
  async function assignPrimaryClassTeacher(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const classId = field(data, "classId");
    const teacherId = field(data, "teacherId");
    const created = now();
    const schoolId = workspace.school?.id || "local";
    const academicYearId = workspace.academicYears.find((item) => item.active)?.id || workspace.academicYears[0]?.id || "local";
    if (!classId || !teacherId) return;

    const profileLabels = getDefaultSubjectsForSchoolType("primary");
    const known = new Set(
      workspace.subjects
        .filter((subject) => subject.active && (!subject.schoolId || subject.schoolId === schoolId))
        .map((subject) => subject.label.trim().toLocaleLowerCase("fr")),
    );
    const levelId = workspace.levels.find((level) => level.active)?.id || workspace.levels[0]?.id || "";
    const createdSubjects: SchoolSubject[] = profileLabels
      .filter((label) => !known.has(label.toLocaleLowerCase("fr")))
      .map((label, index) => ({
        id: id(), schoolId,
        code: label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase().slice(0, 18) || `MAT_${index + 1}`,
        label, color: "#08734f", icon: "book", levelId, coefficient: 1, weeklyHours: 0,
        category: "Primaire", bulletinOrder: workspace.subjects.length + index + 1,
        active: true, createdAt: created, updatedAt: created,
      }));
    const allSubjects = [...createdSubjects, ...workspace.subjects].filter(
      (subject) => subject.active && (!subject.schoolId || subject.schoolId === schoolId),
    );

    const previousTitular = workspace.assignments.filter(
      (item) => item.active && item.classId === classId && item.headTeacher,
    );
    const keptAssignments = workspace.assignments.filter(
      (item) => !(item.active && item.classId === classId && item.headTeacher),
    );
    const assignments: TeachingAssignment[] = allSubjects.map((subject) => ({
      id: id(), schoolId, academicYearId, classId, subjectId: subject.id, teacherId,
      startsOn: "", endsOn: "", temporary: false, headTeacher: true, active: true,
      createdAt: created, updatedAt: created,
    }));

    await persist(
      { ...workspace, subjects: [...createdSubjects, ...workspace.subjects], assignments: [...assignments, ...keptAssignments] },
      [
        ...createdSubjects.map((subject) => ({ module: "subjects" as const, operation: "create" as const, entityId: subject.id, payload: { subject } })),
        ...previousTitular.map((assignment) => ({
          module: "assignments" as const, operation: "delete" as const, entityId: assignment.id,
          payload: { assignment }, baseUpdatedAt: assignment.updatedAt,
        })),
        ...assignments.map((assignment) => ({
          module: "assignments" as const, operation: "create" as const, entityId: assignment.id, payload: { assignment },
        })),
      ],
      createdSubjects.length
        ? `Titulaire affecté à ${assignments.length} matière(s) ; ${createdSubjects.length} matière(s) primaire(s) manquante(s) ont été ajoutée(s).`
        : `Enseignant titulaire affecté à ${assignments.length} matière(s).`,
    );
    form.reset();
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form),
      created = now();
    const assignment: TeachingAssignment = {
      id: id(),
      schoolId: workspace.school?.id || "local",
      academicYearId: workspace.academicYears[0]?.id || "local",
      classId: field(data, "classId"),
      subjectId: field(data, "subjectId"),
      teacherId: field(data, "teacherId"),
      startsOn: "",
      endsOn: "",
      temporary: false,
      headTeacher: data.get("headTeacher") === "on",
      active: true,
      createdAt: created,
      updatedAt: created,
    };
    await persist(
      {
        ...workspace,
        assignments: [assignment, ...workspace.assignments],
      },
      {
        module: "assignments",
        operation: "create",
        entityId: assignment.id,
        payload: { assignment },
      },
    );
    form.reset();
  }
  return (
    <>
      <section className={styles.card}>
        <h2>Matières du profil de l’établissement</h2>
        <p>
          Les suggestions ci-dessous dépendent du type d’établissement configuré.
          Pour le primaire, Gabon Educ+ propose les domaines du bulletin primaire.
        </p>
        <div className={styles.checklist}>
          {suggestedSubjects.map((subject) => (
            <span key={subject}>{subject}</span>
          ))}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={() => void installSuggestedSubjects()}
            disabled={!missingSuggestedSubjects.length}
          >
            Installer les matières du profil
          </button>
        </div>
      </section>
      <datalist id="school-subject-suggestions">
        {suggestedSubjects.map((subject) => (
          <option value={subject} key={subject} />
        ))}
      </datalist>
      <div className={styles.grid}>
        <form className={`${styles.card} ${styles.form}`} onSubmit={addSubject}>
          <h2>Nouvelle matière</h2>
          <div className={styles.two}>
            <label>
              Code
              <input name="code" required />
            </label>
            <label>
              Libellé
              <input name="label" required list="school-subject-suggestions" placeholder={suggestedSubjects[0] || "Français"} />
            </label>
          </div>
          <div className={styles.three}>
            <label>
              Coefficient
              <input
                name="coefficient"
                type="number"
                min="0.1"
                step="0.1"
                defaultValue="1"
              />
            </label>
            <label>
              Heures/semaine
              <input name="weeklyHours" type="number" min="0" step="0.5" />
            </label>
            <label>
              Couleur
              <input name="color" type="color" defaultValue="#08734f" />
            </label>
          </div>
          <input
            type="hidden"
            name="levelId"
            value={workspace.levels[0]?.id || ""}
          />
          <div className={styles.actions}>
            <button className={styles.button}>Ajouter</button>
          </div>
        </form>
        {workspace.school?.schoolType === "primary" ? (
          <div className={styles.card}>
            <form className={styles.form} onSubmit={assignPrimaryClassTeacher}>
              <h2>Enseignant titulaire de la classe</h2>
              <p>Le titulaire est automatiquement affecté à toutes les matières actives de sa classe.</p>
              <label>Classe<select name="classId" required><option value="">Choisir</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Enseignant titulaire<select name="teacherId" required><option value="">Choisir</option>{workspace.users.filter((item) => ["teacher","head_teacher"].includes(item.role) && item.status === "active" && item.invitationStatus === "accepted").map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>
              <div className={styles.actions}><button className={styles.button}>Affecter le titulaire</button></div>
            </form>
            <form className={styles.form} onSubmit={assign}>
              <h3>Exception par matière</h3>
              <p>Pour EPS, anglais, informatique ou toute matière confiée à un autre enseignant.</p>
              <label>Classe<select name="classId" required><option value="">Choisir</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Matière<select name="subjectId" required><option value="">Choisir</option>{workspace.subjects.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
              <label>Enseignant spécialisé<select name="teacherId" required><option value="">Choisir</option>{workspace.users.filter((item) => ["teacher","head_teacher"].includes(item.role) && item.status === "active" && item.invitationStatus === "accepted").map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>
              <div className={styles.actions}><button className={`${styles.button} ${styles.buttonSecondary}`}>Ajouter l’exception</button></div>
            </form>
          </div>
        ) : (
          <form className={`${styles.card} ${styles.form}`} onSubmit={assign}>
            <h2>Affecter un enseignant</h2>
            <label>Classe<select name="classId" required><option value="">Choisir</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Matière<select name="subjectId" required><option value="">Choisir</option>{workspace.subjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>Enseignant<select name="teacherId" required><option value="">Choisir</option>{workspace.users.filter((item) => ["teacher","head_teacher"].includes(item.role) && item.status === "active" && item.invitationStatus === "accepted").map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>
            <label><span><input type="checkbox" name="headTeacher" /> Enseignant principal de la classe</span></label>
            <div className={styles.actions}><button className={styles.button}>Affecter</button></div>
          </form>
        )}
      </div>
      <h2 style={{ marginTop: 24 }}>Matières de l’établissement</h2>
      <DataTable
        headers={["Matière", "Code", "Coefficient", "Volume", "Affectations", "Action"]}
        rows={workspace.subjects
          .filter((subject) => subject.active)
          .map((subject) => {
            const used = workspace.assignments.filter(
              (item) => item.active && item.subjectId === subject.id,
            ).length;
            return [
              subject.label,
              subject.code,
              subject.coefficient,
              `${subject.weeklyHours || 0} h`,
              used ? `${used} affectation(s)` : "Aucune",
              <div key={subject.id} className={styles.actions}>
                <button
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  onClick={() => void editSubject(subject)}
                >
                  Modifier
                </button>
                <button
                  className={`${styles.button} ${styles.buttonDanger}`}
                  onClick={() => void removeSubject(subject)}
                >
                  Supprimer
                </button>
              </div>,
            ];
          })}
      />
      <h2 style={{ marginTop: 24 }}>Affectations</h2>
      <DataTable
        headers={[
          "Matière",
          "Coefficient",
          "Volume",
          "Classe",
          "Enseignant",
          "Titulaire / principal",
          "Action",
        ]}
        rows={workspace.assignments.map((assignment) => {
          const subject = workspace.subjects.find(
            (item) => item.id === assignment.subjectId,
          );
          return [
            subject?.label || "—",
            subject?.coefficient || "—",
            `${subject?.weeklyHours || 0} h`,
            className(classes, assignment.classId),
            userName(workspace.users, assignment.teacherId),
            assignment.headTeacher ? "Oui" : "Non",
            <button
              key={assignment.id}
              className={`${styles.button} ${styles.buttonDanger}`}
              onClick={() => void removeAssignment(assignment)}
              title="Retirer cette affectation"
            >
              Retirer
            </button>,
          ];
        })}
      />
    </>
  );
}

function TimetableView({ workspace, classes, persist }: ViewProps) {
  const [generating, setGenerating] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id || "");
  const [editingCell, setEditingCell] = useState<{
    weekday: number;
    startsAt: string;
    endsAt: string;
    slot?: TimetableSlot;
  } | null>(null);
  const [cellSubjectId, setCellSubjectId] = useState("");
  const [cellTeacherId, setCellTeacherId] = useState("");
  const [cellRoom, setCellRoom] = useState("");
  const generationCheck = inspectTimetableGeneration(workspace, classes);
  const conflicts = detectTimetableConflicts(workspace.timetable),
    days = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const timeRows = [
    { label: "07h30", start: "07:30", end: "08:25" },
    { label: "08h25", start: "08:25", end: "09:20" },
    { label: "09h30", start: "09:30", end: "10:25" },
    { label: "10h25", start: "10:25", end: "11:20" },
    { label: "11h30", start: "11:30", end: "12:25" },
    { label: "12h25", start: "12:25", end: "13:15" },
    { label: "13h15", start: "13:15", end: "14:10" },
    { label: "14h25", start: "14:25", end: "15:20" },
    { label: "15h20", start: "15:20", end: "16:10" },
    { label: "16h10", start: "16:10", end: "16:55" },
    { label: "16h55", start: "16:55", end: "17:40" },
  ];
  const activeSubjects = workspace.subjects.filter(
    (item) => item.active && (!workspace.school?.id || !item.schoolId || item.schoolId === workspace.school.id),
  );
  const activeTeachers = workspace.users.filter(
    (item) => ["teacher", "head_teacher"].includes(item.role) && item.status === "active",
  );
  const slotForCell = (classId: string, weekday: number, startsAt: string) =>
    workspace.timetable.find(
      (slot) => slot.classId === classId && slot.weekday === weekday && slot.startsAt <= startsAt && slot.endsAt > startsAt,
    );
  const teacherFor = (classId: string, subjectId: string) => {
    const candidates = workspace.assignments.filter(
      (item) => item.active && item.classId === classId && item.subjectId === subjectId,
    );
    if (workspace.school?.schoolType === "primary") {
      return candidates.find((item) => !item.headTeacher)?.teacherId || candidates.find((item) => item.headTeacher)?.teacherId || "";
    }
    return candidates[0]?.teacherId || "";
  };
  function openCell(weekday: number, startsAt: string, endsAt: string, slot?: TimetableSlot) {
    setEditingCell({ weekday, startsAt, endsAt, slot });
    setCellSubjectId(slot?.subjectId || "");
    setCellTeacherId(slot?.teacherId || "");
    setCellRoom(slot?.room || classes.find((item) => item.id === selectedClassId)?.room || "");
  }
  function chooseCellSubject(subjectId: string) {
    setCellSubjectId(subjectId);
    const teacherId = teacherFor(selectedClassId, subjectId);
    if (teacherId) setCellTeacherId(teacherId);
  }
  async function generateAutomatically() {
    if (!generationCheck.ready || generating) {
      if (generationCheck.blockers.length) window.alert(`Génération impossible :\n\n${generationCheck.blockers.join("\n")}`);
      return;
    }
    setGenerating(true);
    try {
      const result = generateMissingTimetable(workspace, classes);
      if (!result.slots.length) {
        window.alert(result.unscheduledHours
          ? `Aucun nouveau créneau n’a pu être placé. ${result.unscheduledHours} créneau(x) restent à planifier.`
          : "L’emploi du temps couvre déjà les volumes horaires actuellement configurés.");
        return;
      }
      const operations: SyncOperationMetadata[] = result.slots.map((slot) => ({
        module: "timetables",
        operation: "create",
        entityId: slot.id,
        payload: { slot },
      }));
      const ok = await persist(
        { ...workspace, timetable: [...result.slots, ...workspace.timetable] },
        operations,
        result.unscheduledHours
          ? `${result.slots.length} créneau(x) généré(s). ${result.unscheduledHours} créneau(x) restent à placer.`
          : `${result.slots.length} créneau(x) généré(s) automatiquement, sans double réservation de classe, d’enseignant ou de salle.`,
      );
      if (ok && result.warnings.length) window.alert(result.warnings.join("\n"));
    } finally {
      setGenerating(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form),
      created = now();
    const slot: TimetableSlot = {
      id: id(),
      schoolId: workspace.school?.id || "local",
      academicYearId: workspace.academicYears[0]?.id || "local",
      classId: field(data, "classId"),
      subjectId: field(data, "subjectId"),
      teacherId: field(data, "teacherId"),
      room: field(data, "room"),
      weekday: Number(field(data, "weekday")),
      startsAt: field(data, "startsAt"),
      endsAt: field(data, "endsAt"),
      weekLabel: "Toutes les semaines",
      createdAt: created,
      updatedAt: created,
    };
    await persist(
      { ...workspace, timetable: [slot, ...workspace.timetable] },
      { module: "timetables", operation: "create", entityId: slot.id, payload: { slot } },
      "Créneau ajouté ; les conflits ont été recalculés.",
    );
    form.reset();
  }
  async function saveCell(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCell || !selectedClassId || !cellSubjectId) return;
    const existing = editingCell.slot;
    const created = existing?.createdAt || now();
    const slot: TimetableSlot = {
      id: existing?.id || id(),
      schoolId: workspace.school?.id || "local",
      academicYearId: workspace.academicYears.find((item) => item.active)?.id || workspace.academicYears[0]?.id || "local",
      classId: selectedClassId,
      subjectId: cellSubjectId,
      teacherId: cellTeacherId || teacherFor(selectedClassId, cellSubjectId),
      room: cellRoom,
      weekday: editingCell.weekday,
      startsAt: editingCell.startsAt,
      endsAt: editingCell.endsAt,
      weekLabel: "Toutes les semaines",
      createdAt: created,
      updatedAt: now(),
    };
    const nextTimetable = existing
      ? workspace.timetable.map((item) => item.id === existing.id ? slot : item)
      : [slot, ...workspace.timetable];
    const ok = await persist(
      { ...workspace, timetable: nextTimetable },
      {
        module: "timetables",
        operation: existing ? "update" : "create",
        entityId: slot.id,
        payload: { slot },
        ...(existing ? { baseUpdatedAt: existing.updatedAt } : {}),
      },
      existing ? "Créneau modifié." : "Créneau ajouté depuis la grille.",
    );
    if (ok) setEditingCell(null);
  }
  async function deleteCell() {
    const existing = editingCell?.slot;
    if (!existing) return;
    const ok = await persist(
      { ...workspace, timetable: workspace.timetable.filter((item) => item.id !== existing.id) },
      {
        module: "timetables",
        operation: "delete",
        entityId: existing.id,
        payload: { slot: existing },
        baseUpdatedAt: existing.updatedAt,
      },
      "Créneau supprimé.",
    );
    if (ok) setEditingCell(null);
  }
  return (
    <>
      <section className={styles.card}>
        <h2>Préparation de la génération automatique</h2>
        <p>Le moteur utilise uniquement les données de l’établissement actif et vérifie les contraintes avant toute création.</p>
        <div className={styles.checklist}>
          <span>{generationCheck.classCount} classe(s) disponible(s)</span>
          <span>{generationCheck.assignmentCount} affectation(s) pédagogique(s)</span>
          <span>{generationCheck.plannedPeriods} créneau(x) hebdomadaire(s) attendu(s)</span>
          {generationCheck.ready ? (
            <span>✓ Données suffisantes pour lancer la génération.</span>
          ) : (
            generationCheck.blockers.map((message) => <span key={message}>⚠ {message}</span>)
          )}
          {generationCheck.warnings.map((message) => <span key={message}>ℹ {message}</span>)}
        </div>
      </section>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <h2>Ajouter un créneau</h2>
        <div className={styles.three}>
          <label>Jour<select name="weekday">{days.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label>
          <label>Début<input name="startsAt" type="time" required /></label>
          <label>Fin<input name="endsAt" type="time" required /></label>
        </div>
        <div className={styles.three}>
          <label>Classe<select name="classId" required><option value="">Choisir</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Matière<select name="subjectId" required><option value="">Choisir</option>{activeSubjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>Enseignant<select name="teacherId"><option value="">Non affecté</option>{activeTeachers.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}</select></label>
        </div>
        <div className={styles.two}>
          <label>Salle<input name="room" /></label>
          <div className={styles.actions}>
            <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => void generateAutomatically()} disabled={!generationCheck.ready || generating} title={!generationCheck.ready ? "Complétez d’abord les données signalées ci-dessus." : "Générer les créneaux manquants"}>{generating ? "Génération…" : "Générer automatiquement"}</button>
            <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => window.print()}>Imprimer la semaine</button>
            <button className={styles.button}>Ajouter</button>
          </div>
        </div>
      </form>
      {conflicts.length > 0 && <div className={`${styles.warning} ${styles.dangerNotice}`}>{conflicts.length} conflit(s) détecté(s). Les créneaux concernés sont signalés en rouge.</div>}
      <section className={styles.card}>
        <div className={styles.two}>
          <label>
            Emploi du temps de la classe
            <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
              <option value="">Choisir une classe</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <p>Cliquez sur une case pour ajouter ou modifier la matière de ce créneau.</p>
        </div>
      </section>
      <div className="platform-timetable-board" aria-label="Tableau hebdomadaire des emplois du temps">
        <div className="platform-timetable-head"><b />{days.map((day) => <b key={day}>{day}</b>)}</div>
        {timeRows.map((row) => (
          <div className="platform-timetable-row" key={row.start}>
            <small>{row.label}</small>
            {days.map((day, index) => {
              const slot = selectedClassId ? slotForCell(selectedClassId, index + 1, row.start) : undefined;
              const conflict = slot && conflicts.some((item) => item.slotId === slot.id || item.otherSlotId === slot.id);
              return (
                <button
                  type="button"
                  className={slot ? `platform-timetable-cell has-course ${conflict ? "conflict" : ""}` : "platform-timetable-cell"}
                  onClick={() => selectedClassId && openCell(index + 1, row.start, row.end, slot)}
                  key={`${day}-${row.start}`}
                  title={selectedClassId ? (slot ? "Modifier ce créneau" : "Ajouter une matière à ce créneau") : "Choisissez d’abord une classe"}
                  disabled={!selectedClassId}
                >
                  {slot ? <><strong>{subjectName(activeSubjects, slot.subjectId)}</strong><span>{className(classes, slot.classId)}</span><em>{slot.room || userName(activeTeachers, slot.teacherId)}</em></> : <span className="empty-cell-label">+</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {editingCell && (
        <div className="preview-overlay" role="dialog" aria-modal="true">
          <form className={styles.card} style={{ width: "min(620px, 100%)", height: "max-content" }} onSubmit={saveCell}>
            <div className={styles.sectionTitle}>
              <div>
                <span className={styles.eyebrow}>EMPLOI DU TEMPS</span>
                <h2>{editingCell.slot ? "Modifier le créneau" : "Insérer une matière"}</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setEditingCell(null)}>×</button>
            </div>
            <div className={styles.form}>
              <div className={styles.three}>
                <label>Classe<input value={className(classes, selectedClassId)} readOnly /></label>
                <label>Jour<input value={days[editingCell.weekday - 1] || ""} readOnly /></label>
                <label>Créneau<input value={`${editingCell.startsAt} – ${editingCell.endsAt}`} readOnly /></label>
              </div>
              <label>
                Matière
                <select value={cellSubjectId} onChange={(event) => chooseCellSubject(event.target.value)} required>
                  <option value="">Choisir une matière</option>
                  {activeSubjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              <label>
                Enseignant
                <select value={cellTeacherId} onChange={(event) => setCellTeacherId(event.target.value)}>
                  <option value="">Titulaire / non affecté</option>
                  {activeTeachers.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName}</option>)}
                </select>
              </label>
              <label>Salle<input value={cellRoom} onChange={(event) => setCellRoom(event.target.value)} /></label>
              <div className={styles.actions}>
                {editingCell.slot && <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => void deleteCell()}>Supprimer</button>}
                <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={() => setEditingCell(null)}>Annuler</button>
                <button className={styles.button}>{editingCell.slot ? "Enregistrer les modifications" : "Insérer la matière"}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function AttendanceView({ workspace, classes, persist }: ViewProps) {
  const summary = calculateAttendance(workspace.attendance);

  /**
   * Requalifier une absence. C'est le geste quotidien du secrétariat : le
   * justificatif arrive le lendemain, et il n'existait aucun moyen d'en tenir
   * compte — l'absence restait « non justifiée » à vie.
   */
  async function toggleJustified(entry: PlatformWorkspace["attendance"][number]) {
    const reason = entry.justified
      ? entry.reason
      : prompt("Motif du justificatif (facultatif)", entry.reason) ?? entry.reason;
    const updated = {
      ...entry,
      justified: !entry.justified,
      reason,
      updatedAt: now(),
    };
    await persist(
      {
        ...workspace,
        attendance: workspace.attendance.map((item) => (item.id === entry.id ? updated : item)),
      },
      {
        module: "attendance",
        operation: "update",
        entityId: entry.id,
        payload: { attendance: updated },
        baseUpdatedAt: entry.updatedAt,
      },
      updated.justified ? "Absence justifiée." : "Justificatif retiré.",
    );
  }

  /**
   * Suppression d'un enregistrement. Une absence attribuée au mauvais élève
   * fausse durablement les statistiques ; elle doit pouvoir disparaître.
   */
  async function removeAttendance(entry: PlatformWorkspace["attendance"][number]) {
    const student = workspace.students.find((item) => item.id === entry.studentId);
    if (
      !confirm(
        `Supprimer cet enregistrement du ${entry.date}${student ? ` pour ${student.lastName} ${student.firstName}` : ""} ?\n\nÀ n’utiliser que pour une saisie erronée : les statistiques d’assiduité seront recalculées.`,
      )
    )
      return;
    await persist(
      {
        ...workspace,
        attendance: workspace.attendance.filter((item) => item.id !== entry.id),
      },
      {
        module: "attendance",
        operation: "delete",
        entityId: entry.id,
        payload: {},
        baseUpdatedAt: entry.updatedAt,
      },
      "Enregistrement supprimé.",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form),
      created = now();
    const entry: AttendanceEntry = {
      id: id(),
      schoolId: workspace.school?.id || "local",
      academicYearId: workspace.academicYears[0]?.id || "local",
      periodId: workspace.periods.find((item) => item.active)?.id || "local",
      classId: field(data, "classId"),
      studentId: field(data, "studentId"),
      timetableSlotId: "",
      kind: field(data, "kind") as AttendanceEntry["kind"],
      date: field(data, "date"),
      durationMinutes: Math.max(0, Number(field(data, "durationMinutes")) || 0),
      reason: field(data, "reason"),
      proofName: "",
      justified: data.get("justified") === "on",
      recordedBy: "local-user",
      createdAt: created,
      updatedAt: created,
    };
    await persist(
      {
        ...workspace,
        attendance: [entry, ...workspace.attendance],
      },
      {
        module: "attendance",
        operation: "create",
        entityId: entry.id,
        payload: { entry },
      },
    );
    form.reset();
  }
  return (
    <>
      <div className={styles.stats}>
        <article className={styles.stat}>
          <small>Absences</small>
          <strong>{summary.absenceCount}</strong>
          <span>{summary.unjustifiedAbsenceCount} non justifiée(s)</span>
        </article>
        <article className={styles.stat}>
          <small>Retards</small>
          <strong>{summary.lateCount}</strong>
          <span>Sur la période locale</span>
        </article>
        <article className={styles.stat}>
          <small>Sorties anticipées</small>
          <strong>{summary.earlyLeaveCount}</strong>
          <span>Événements tracés</span>
        </article>
        <article className={styles.stat}>
          <small>Temps manqué</small>
          <strong>{summary.missedMinutes}</strong>
          <span>minutes enregistrées</span>
        </article>
      </div>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <h2>Saisie rapide</h2>
        <div className={styles.three}>
          <label>
            Classe
            <select name="classId" required>
              <option value="">Choisir</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Élève
            <select name="studentId" required>
              <option value="">Choisir</option>
              {workspace.students
                .filter((item) => item.status === "active")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.lastName} {item.firstName}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Type
            <select name="kind">
              <option value="absence">Absence</option>
              <option value="late">Retard</option>
              <option value="early_leave">Sortie anticipée</option>
            </select>
          </label>
        </div>
        <div className={styles.three}>
          <label>
            Date
            <input
              name="date"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label>
            Durée (minutes)
            <input
              name="durationMinutes"
              type="number"
              min="0"
              defaultValue="60"
            />
          </label>
          <label>
            Motif
            <input name="reason" />
          </label>
        </div>
        <label>
          <span>
            <input name="justified" type="checkbox" /> Justificatif contrôlé
          </span>
        </label>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonSecondary}`}
            onClick={() => window.print()}
          >
            Imprimer
          </button>
          <button className={styles.button}>Enregistrer</button>
        </div>
      </form>
      <DataTable
        headers={["Date", "Élève", "Classe", "Type", "Durée", "Justification", "Action"]}
        rows={workspace.attendance.map((entry) => {
          const student = workspace.students.find(
            (item) => item.id === entry.studentId,
          );
          return [
            entry.date,
            student ? `${student.lastName} ${student.firstName}` : "—",
            className(classes, entry.classId),
            entry.kind,
            `${entry.durationMinutes} min`,
            entry.justified ? "Justifiée" : "Non justifiée",
            <div key={entry.id} className={styles.actions}>
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                onClick={() => void toggleJustified(entry)}
                title="Basculer entre justifiée et non justifiée"
              >
                {entry.justified ? "Retirer le justificatif" : "Justifier"}
              </button>
              <button
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={() => void removeAttendance(entry)}
                title="Supprimer — pour une absence saisie sur le mauvais élève"
              >
                Supprimer
              </button>
            </div>,
          ];
        })}
      />
    </>
  );
}

function AnnouncementsView({ workspace, persist }: ViewProps) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form),
      created = now();
    const announcement: Announcement = {
      id: id(),
      schoolId: workspace.school?.id || "local",
      title: field(data, "title"),
      content: field(data, "content"),
      audience: field(data, "audience") as Announcement["audience"],
      targetId: field(data, "targetId"),
      attachmentName: field(data, "attachmentName"),
      publishesAt: field(data, "publishesAt") || created,
      expiresAt: field(data, "expiresAt"),
      status: field(data, "status") as Announcement["status"],
      createdBy: "local-user",
      createdAt: created,
      updatedAt: created,
    };
    const saved = await persist(
      {
        ...workspace,
        announcements: [announcement, ...workspace.announcements],
      },
      {
        module: "announcements",
        operation: "create",
        entityId: announcement.id,
        payload: { announcement },
      },
    );
    if (saved) form.reset();
  }
  async function publish(item: Announcement) {
    const publishedAt = now();
    const publishedAnnouncement: Announcement = {
      ...item,
      status: "published",
      publishesAt: publishedAt,
      updatedAt: publishedAt,
    };
    await persist(
      {
        ...workspace,
        announcements: workspace.announcements.map((entry) =>
          entry.id === item.id ? publishedAnnouncement : entry,
        ),
      },
      {
        module: "announcements",
        operation: "update",
        entityId: item.id,
        payload: { announcement: publishedAnnouncement },
        baseUpdatedAt: item.updatedAt,
      },
      "Annonce publiée localement.",
    );
  }

  /** Retirer une annonce publiée par erreur, sans la détruire. */
  async function unpublish(item: PlatformWorkspace["announcements"][number]) {
    const updated = { ...item, status: "draft" as const, updatedAt: now() };
    await persist(
      {
        ...workspace,
        announcements: workspace.announcements.map((entry) =>
          entry.id === item.id ? updated : entry,
        ),
      },
      {
        module: "announcements",
        operation: "update",
        entityId: item.id,
        payload: { announcement: updated },
        baseUpdatedAt: item.updatedAt,
      },
      "Annonce retirée. Elle redevient un brouillon.",
    );
  }

  /** Corriger le titre et le contenu d'une annonce, publiée ou non. */
  async function editAnnouncement(item: PlatformWorkspace["announcements"][number]) {
    const title = prompt("Titre de l’annonce", item.title);
    if (title === null) return;
    const content = prompt("Message", item.content);
    if (content === null) return;
    const updated = { ...item, title: title.trim(), content, updatedAt: now() };
    await persist(
      {
        ...workspace,
        announcements: workspace.announcements.map((entry) =>
          entry.id === item.id ? updated : entry,
        ),
      },
      {
        module: "announcements",
        operation: "update",
        entityId: item.id,
        payload: { announcement: updated },
        baseUpdatedAt: item.updatedAt,
      },
      "Annonce corrigée.",
    );
  }

  async function removeAnnouncement(item: PlatformWorkspace["announcements"][number]) {
    if (
      !confirm(
        item.status === "published"
          ? `Supprimer définitivement l’annonce « ${item.title} » ?\n\nElle est actuellement publiée. Pour la retirer temporairement, préférez « Dépublier ».`
          : `Supprimer définitivement l’annonce « ${item.title} » ?`,
      )
    )
      return;
    await persist(
      {
        ...workspace,
        announcements: workspace.announcements.filter((entry) => entry.id !== item.id),
      },
      {
        module: "announcements",
        operation: "delete",
        entityId: item.id,
        payload: {},
        baseUpdatedAt: item.updatedAt,
      },
      "Annonce supprimée.",
    );
  }

  return (
    <>
      <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
        <h2>Nouvelle annonce</h2>
        <div className={styles.two}>
          <label>
            Titre
            <input name="title" required />
          </label>
          <label>
            Public
            <select name="audience">
              <option value="school">Tout l’établissement</option>
              <option value="teachers">Enseignants</option>
              <option value="guardians">Parents</option>
              <option value="students">Élèves</option>
              <option value="class">Une classe</option>
            </select>
          </label>
        </div>
        <label>
          Message
          <textarea name="content" required />
        </label>
        <div className={styles.three}>
          <label>
            Cible facultative
            <input name="targetId" />
          </label>
          <label>
            Pièce jointe (nom)
            <input name="attachmentName" />
          </label>
          <label>
            Expiration
            <input name="expiresAt" type="date" />
          </label>
        </div>
        <input type="hidden" name="status" value="draft" />
        <div className={styles.actions}>
          <button className={styles.button}>Enregistrer le brouillon</button>
        </div>
      </form>
      <DataTable
        headers={["Annonce", "Public", "Publication", "Statut", "Action"]}
        rows={workspace.announcements.map((item) => [
          <span key={item.id}>
            <b>{item.title}</b>
            <br />
            {item.content}
          </span>,
          item.audience,
          new Date(item.publishesAt).toLocaleString("fr-FR"),
          item.status,
          <div key={item.id} className={styles.actions}>
            {item.status !== "published" ? (
              <button className={styles.button} onClick={() => void publish(item)}>
                Publier
              </button>
            ) : (
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                onClick={() => void unpublish(item)}
                title="Retirer l’annonce sans la supprimer"
              >
                Dépublier
              </button>
            )}
            <button
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={() => void editAnnouncement(item)}
            >
              Modifier
            </button>
            <button
              className={`${styles.button} ${styles.buttonDanger}`}
              onClick={() => void removeAnnouncement(item)}
            >
              Supprimer
            </button>
          </div>,
        ])}
      />
    </>
  );
}

function DocumentsView({ workspace, classes, persist }: ViewProps) {
  const [selected, setSelected] = useState<SchoolDocument | null>(null);
  const templates = getTemplatesForSchoolType(workspace.school?.schoolType);

  /**
   * Suppression d'un document généré. Chaque essai d'attestation ou de
   * bulletin s'accumulait définitivement dans le registre, sans moyen de faire
   * le ménage.
   */
  async function removeDocument(doc: SchoolDocument) {
    if (!confirm(`Supprimer le document « ${doc.title} » du registre ?`)) return;
    if (selected?.id === doc.id) setSelected(null);
    await persist(
      {
        ...workspace,
        documents: workspace.documents.filter((item) => item.id !== doc.id),
      },
      {
        module: "documents",
        operation: "delete",
        entityId: doc.id,
        payload: {},
        baseUpdatedAt: doc.updatedAt,
      },
      "Document supprimé du registre.",
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      created = now(),
      selectedTemplate = getTemplateByKey(field(data, "templateKey")),
      student = workspace.students.find(
        (item) => item.id === field(data, "studentId"),
      ),
      chosenClass = classes.find((item) => item.id === field(data, "classId")),
      chosenClassName = chosenClass?.name || className(classes, field(data, "classId"));
    const template = selectedTemplate.documentKind === "report_card"
      ? getPrimaryReportTemplateForLevel(chosenClass?.level)
      : selectedTemplate;
    let reportPayload: Record<string, unknown> = {};
    if (template.documentKind === "report_card" && student && field(data, "classId")) {
      try {
        const grading = await loadGradingWorkspace();
        const gradingClass = classes.find((item) => item.id === field(data, "classId"));
        const gradingStudent = gradingClass?.students.find((item) => item.id === student.id)
          || gradingClass?.students.find((item) => item.lastName.toLocaleLowerCase("fr") === student.lastName.toLocaleLowerCase("fr") && item.firstName.toLocaleLowerCase("fr") === student.firstName.toLocaleLowerCase("fr"));
        const period = grading.workspace.periods.find((item) => item.active) || grading.workspace.periods[0];
        if (gradingClass && gradingStudent && period) {
          const snapshot = buildReportCardSnapshot({
            workspace: grading.workspace,
            settings: grading.workspace.settings,
            classId: gradingClass.id,
            className: gradingClass.name,
            classLevel: gradingClass.level,
            periodId: period.id,
            periodLabel: period.label,
            student: gradingStudent,
            students: gradingClass.students,
          });
          reportPayload = { reportSnapshot: snapshot };
        }
      } catch {
        reportPayload = {};
      }
    }
    const model = {
      ...buildSchoolDocumentPayload({
        templateKey: template.key as SchoolDocumentTemplateKey,
        school: workspace.school,
        student,
        className: chosenClassName,
        academicYear: workspace.academicYears[0]?.label,
        issuedAt: new Date().toLocaleDateString("fr-FR"),
      }),
      ...reportPayload,
    };
    const doc: SchoolDocument = {
      id: id(),
      schoolId: workspace.school?.id || "local",
      kind: template.documentKind,
      title: template.label,
      studentId: field(data, "studentId"),
      classId: field(data, "classId"),
      payload: model,
      status: "generated",
      createdBy: "local-user",
      createdAt: created,
      updatedAt: created,
    };
    const saved = await persist(
      { ...workspace, documents: [doc, ...workspace.documents] },
      {
        module: "documents",
        operation: "create",
        entityId: doc.id,
        payload: { document: doc },
      },
      "Document scolaire généré et tracé.",
    );
    if (saved) setSelected(doc);
  }
  return (
    <>
      <form
        className={`${styles.card} ${styles.form} ${styles.screenOnly}`}
        onSubmit={submit}
      >
        <h2>Générer un document scolaire</h2>
        <p>
          Le carnet de maternelle ou le bulletin du primaire élémentaire est choisi automatiquement selon la classe.
        </p>
        <div className={styles.three}>
          <label>
            Modèle
            <select name="templateKey">
              {templates.map((template) => (
                <option value={template.key} key={template.key}>
                  {template.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Élève
            <select name="studentId">
              <option value="">Non applicable</option>
              {workspace.students.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.lastName} {item.firstName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Classe
            <select name="classId">
              <option value="">Non applicable</option>
              {classes.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.checklist}>
          {templates.map((template) => (
            <span key={template.key}>
              <b>{template.label}</b> · {template.description}
            </span>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.button}>Générer et prévisualiser</button>
        </div>
      </form>
      {selected && <DocumentPreview document={selected} />}
      <div className="no-print">
        <DataTable
          headers={["Document", "Modèle", "Élève", "Statut", "Date", "Action"]}
          rows={workspace.documents.map((doc) => [
            doc.title,
            String(doc.payload.templateLabel || doc.kind),
            workspace.students.find((item) => item.id === doc.studentId)
              ?.lastName || "—",
            doc.status,
            new Date(doc.createdAt).toLocaleDateString("fr-FR"),
            <div key={doc.id} className={styles.actions}>
              <button
                className={`${styles.button} ${styles.buttonSecondary}`}
                onClick={() => setSelected(doc)}
              >
                Prévisualiser
              </button>
              <button
                className={`${styles.button} ${styles.buttonDanger}`}
                onClick={() => void removeDocument(doc)}
              >
                Supprimer
              </button>
            </div>,
          ])}
        />
      </div>
    </>
  );
}
function DocumentPreview({ document }: { document: SchoolDocument }) {
  return <SchoolDocumentPreview document={document} />;
}

function PortalView({
  workspace,
  classes,
  kind,
}: ViewProps & { kind: "parent" | "student" }) {
  const [selection, setSelection] = useState("");
  const allowed =
    kind === "parent"
      ? workspace.guardianLinks
          .filter((item) => item.guardianId === selection)
          .map((item) => item.studentId)
      : [selection];
  const students = workspace.students.filter((item) =>
    allowed.includes(item.id),
  );
  return (
    <>
      <div className={styles.warning}>
        Simulation locale uniquement : cette vue illustre les rôles sans
        prétendre fournir une sécurité serveur. En production, les politiques
        RLS limitent les données accessibles.
      </div>
      <section className={`${styles.card} ${styles.form}`}>
        <label>
          {kind === "parent" ? "Responsable simulé" : "Élève simulé"}
          <select
            value={selection}
            onChange={(event) => setSelection(event.target.value)}
          >
            <option value="">Choisir</option>
            {kind === "parent"
              ? workspace.guardians.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.firstName} {item.lastName}
                  </option>
                ))
              : workspace.students.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.firstName} {item.lastName}
                  </option>
                ))}
          </select>
        </label>
      </section>
      {students.map((student) => {
        const attendance = calculateAttendance(
          workspace.attendance.filter((item) => item.studentId === student.id),
        );
        return (
          <section className={styles.card} key={student.id}>
            <h2>
              {student.firstName} {student.lastName}
            </h2>
            <p>
              {className(classes, student.classId)} · matricule{" "}
              {student.registrationNumber || "non renseigné"}
            </p>
            <div className={styles.stats}>
              <article className={styles.stat}>
                <small>Absences</small>
                <strong>{attendance.absenceCount}</strong>
              </article>
              <article className={styles.stat}>
                <small>Retards</small>
                <strong>{attendance.lateCount}</strong>
              </article>
              <article className={styles.stat}>
                <small>Documents</small>
                <strong>
                  {
                    workspace.documents.filter(
                      (item) => item.studentId === student.id,
                    ).length
                  }
                </strong>
              </article>
              <article className={styles.stat}>
                <small>Annonces</small>
                <strong>
                  {
                    workspace.announcements.filter(
                      (item) =>
                        item.status === "published" &&
                        [
                          "school",
                          kind === "parent" ? "guardians" : "students",
                        ].includes(item.audience),
                    ).length
                  }
                </strong>
              </article>
            </div>
          </section>
        );
      })}
      {selection && !students.length && (
        <div className={styles.empty}>Aucun élève autorisé pour ce profil.</div>
      )}
    </>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
}) {
  if (!rows.length)
    return (
      <div className={styles.empty}>
        Aucune donnée enregistrée pour le moment.
      </div>
    );
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
