"use client";

import Image from "next/image";
import { PRODUCT } from "@/lib/product-edition";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BookOpen, ClipboardCheck, X } from "lucide-react";
import { loadProfile, signOut, type TeacherProfile, defaultProfile } from "@/lib/profile-store";
import { listLessonsWithStatus, type LessonRecord } from "@/lib/lesson-store";
import type { ClassRecord } from "@/lib/class-store";
import { listClasses } from "@/lib/class-store";
import { listEvaluations, type EvaluationRecord } from "@/lib/evaluation-store";
import { storageModeLabel, type StorageMode } from "@/lib/storage-mode";
import { loadPlatformWorkspace } from "@/lib/platform/store";
import { TIMETABLE_PERIODS } from "@/lib/platform/timetable-hours";
import {
  loadCurrentTeacherTimetable,
  type TeacherTimetableSlot,
} from "@/lib/teacher-timetable";
import { SimpleSpaceNav } from "@/components/SpaceNavigation";

const days = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];

function fallbackCurrentAcademicWeek() {
  const now = new Date();
  const month = now.getMonth();
  if (month === 8) return 37;
  if (month === 9) return 41;
  if (month === 10) return 45;
  if (month === 11) return 50;
  if (month === 0) return 3;
  if (month === 1) return 7;
  if (month === 2) return 11;
  if (month === 3) return 15;
  if (month === 4) return 19;
  if (month === 5) return 23;
  if (month === 6) return 28;
  return 36;
}

function slotForCell(slots: TeacherTimetableSlot[], weekday: number, startsAt: string) {
  return slots.find(
    (slot) => slot.weekday === weekday && slot.startsAt <= startsAt && slot.endsAt > startsAt,
  );
}

export function DashboardClient() {
  const router = useRouter();
  const [user, setUser] = useState<TeacherProfile>(defaultProfile);
  const [lessons, setLessons] = useState<LessonRecord[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [mode, setMode] = useState<StorageMode>("demo");
  const [timetableSlots, setTimetableSlots] = useState<TeacherTimetableSlot[]>([]);

  useEffect(() => {
    void (async () => {
      const [profile, lessonData, evaluationData, platformResult, cloudTimetable] = await Promise.all([
        loadProfile(),
        listLessonsWithStatus(),
        listEvaluations(),
        loadPlatformWorkspace().catch(() => ({ workspace: null, mode: "offline" as const, message: "" })),
        loadCurrentTeacherTimetable().catch(() => []),
      ]);
      setUser(profile.profile);
      setLessons(lessonData.items);
      setEvaluations(evaluationData.items);
      setTimetableSlots(cloudTimetable);

      const school = platformResult.workspace?.school;
      if (school?.id && school.schoolType) {
        const classData = await listClasses({ schoolId: school.id, schoolType: school.schoolType });
        const teacherIds = new Set(
          (platformResult.workspace?.users || [])
            .filter((item) => item.role === "teacher" || item.role === "head_teacher")
            .filter((item) => {
              const sameEmail = Boolean(
                item.email &&
                  profile.profile.email &&
                  item.email.toLowerCase() === profile.profile.email.toLowerCase(),
              );
              const sameName =
                `${item.firstName} ${item.lastName}`.trim().toLowerCase() ===
                `${profile.profile.firstName} ${profile.profile.lastName}`.trim().toLowerCase();
              return sameEmail || sameName;
            })
            .map((item) => item.id),
        );
        const assignedClassIds = new Set(
          (platformResult.workspace?.assignments || [])
            .filter((item) => item.active && teacherIds.has(item.teacherId))
            .map((item) => item.classId),
        );
        setClasses(classData.items.filter((item) => assignedClassIds.has(item.id)));
      } else {
        setClasses([]);
      }
      setMode(
        profile.mode === "cloud" || lessonData.mode === "cloud"
          ? "cloud"
          : profile.mode === "offline" || lessonData.mode === "offline"
            ? "offline"
            : "demo",
      );
    })();
  }, []);

  useEffect(() => {
    const refreshTimetable = () => {
      void loadCurrentTeacherTimetable().then(setTimetableSlots).catch(() => undefined);
    };
    window.addEventListener("focus", refreshTimetable);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshTimetable();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", refreshTimetable);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function logout() {
    await signOut();
    router.push("/gabon-educ/connexion");
    router.refresh();
  }

  const today = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const upcoming = useMemo(
    () =>
      evaluations
        .filter((item) => item.date >= new Date().toISOString().slice(0, 10))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4),
    [evaluations],
  );
  const recentLessons = useMemo(
    () => lessons.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5),
    [lessons],
  );
  const currentWeek = fallbackCurrentAcademicWeek();

  return (
    <main className="teacher-workspace">
      <header className="teacher-brandbar">
        <div className="teacher-seal">
          <Image
            src="/branding/logo-gabon-educ-plus-v2.png"
            alt={`Logo ${PRODUCT.name}`}
            width={44}
            height={44}
            unoptimized
          />
        </div>
        <div className="teacher-brand-name">{PRODUCT.name}</div>
      </header>

      <SimpleSpaceNav space="teacher" onLogout={() => void logout()} />

      <section className="teacher-contextbar">
        <div>
          <b>Page d’accueil</b><span>{today}</span>
        </div>
        <div className="teacher-user-chip">
          <span>{(user.firstName[0] || "E") + (user.lastName[0] || "G")}</span>
          <div>
            <b>{user.firstName} {user.lastName}</b>
            <small>{user.mainSubject || "Enseignant"} · {storageModeLabel(mode)}</small>
          </div>
          <Bell />
        </div>
      </section>

      <div className="teacher-dashboard-grid">
        <section className="teacher-panel teacher-schedule">
          <header>
            <div><h2>Emploi du temps</h2><p>Semaine en cours · planning publié · jusqu’à 14 h 30</p></div>
            <Link href="/gabon-educ/preparer-un-cours">Préparer un cours ↗</Link>
          </header>
          <div className="schedule-wrap">
            <div className="schedule-grid">
              <span className="schedule-corner" />
              {days.map((day) => <b key={day}>{day}</b>)}
              {TIMETABLE_PERIODS.map((hour) => (
                <div className="schedule-row" key={hour.start}>
                  <small>{hour.label}</small>
                  {days.map((day, col) => {
                    const slot = slotForCell(timetableSlots, col + 1, hour.start);
                    const href = slot
                      ? `/gabon-educ/preparer-un-cours?week=${currentWeek}&day=${col + 1}&time=${hour.start}&classId=${encodeURIComponent(slot.classId)}&subject=${encodeURIComponent(slot.subjectLabel)}`
                      : `/gabon-educ/preparer-un-cours?week=${currentWeek}&day=${col + 1}&time=${hour.start}`;
                    return (
                      <Link
                        href={href}
                        key={`${day}-${hour.start}`}
                        className={slot ? "course" : ""}
                        title={slot ? `${slot.subjectLabel} · ${slot.className}` : "Préparer un cours pour ce créneau"}
                      >
                        {slot ? (
                          <>
                            <strong>{slot.subjectLabel}</strong>
                            <span>{slot.className}</span>
                          </>
                        ) : (
                          <em className="empty-cell-label">+</em>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="teacher-center-column">
          <section className="teacher-panel teacher-note">
            <button aria-label="Fermer"><X /></button>
            <h2>Pense-bête</h2>
            <textarea placeholder="Écrivez ici une note personnelle…" />
          </section>
          <section className="teacher-panel">
            <header>
              <div><h2>Cahier de textes récent</h2><p>Vos dernières fiches pédagogiques</p></div>
              <Link href="/gabon-educ/mes-fiches">Tout voir ↗</Link>
            </header>
            <div className="teacher-list">
              {recentLessons.length ? recentLessons.map((item) => (
                <Link key={item.id} href="/gabon-educ/mes-fiches">
                  <BookOpen />
                  <div><b>{item.title || "Fiche sans titre"}</b><small>{item.grade} · {item.subject}</small></div>
                  <span>{item.status === "draft" ? "À finir" : "Prête"}</span>
                </Link>
              )) : <p>Aucune fiche enregistrée.</p>}
            </div>
          </section>
          <section className="teacher-panel">
            <header>
              <div><h2>À rendre par les élèves</h2><p>Évaluations programmées</p></div>
              <Link href="/gabon-educ/evaluations">Tout voir ↗</Link>
            </header>
            <div className="teacher-list">
              {upcoming.length ? upcoming.map((item) => (
                <Link key={item.id} href="/gabon-educ/evaluations">
                  <ClipboardCheck />
                  <div><b>{item.title}</b><small>{item.className || item.grade} · {item.date}</small></div>
                  <span>{item.duration} min</span>
                </Link>
              )) : <p>Aucune évaluation à venir.</p>}
            </div>
          </section>
        </div>

        <aside className="teacher-right-column">
          <section className="teacher-panel compact">
            <header><h2>Agenda</h2><Link href="/gabon-educ/preparer-un-cours">Voir l’EDT ↗</Link></header>
            <p>{upcoming.length ? `${upcoming.length} activité(s) à venir` : "Aucun événement à venir"}</p>
          </section>
          <section className="teacher-panel compact">
            <header><h2>Informations & annonces</h2><Link href="/gabon-educ/annonces">Tout voir ↗</Link></header>
            <p>Aucune nouvelle information</p>
          </section>
          <section className="teacher-panel compact">
            <header><h2>Discussions</h2><Link href="/gabon-educ/notifications">Tout voir ↗</Link></header>
            <p>Aucun nouveau message</p>
          </section>
          <section className="teacher-panel compact">
            <header><h2>Casier numérique</h2><Link href="/gabon-educ/documents">Tout voir ↗</Link></header>
            <p>Tous les documents ont été lus</p>
          </section>
          <section className="teacher-panel compact teacher-summary">
            <h2>Résumé</h2>
            <div>
              <span><b>{classes.length}</b> classes</span>
              <span><b>{classes.reduce((sum, item) => sum + item.students.length, 0)}</b> élèves</span>
              <span><b>{evaluations.length}</b> évaluations</span>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
