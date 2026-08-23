"use client";

import { useEffect, useState } from "react";
import { CalendarDays, GraduationCap, Info, MessageCircle, UserRoundCheck } from "lucide-react";
import {
  loadAttendance,
  loadMessages,
  loadReportCards,
  loadTimetable,
  resolveFamilyIdentity,
  type AttendanceEntry,
  type FamilyChild,
  type FamilyIdentity,
  type FamilyMessage,
  type ReportCardSummary,
  type TimetableEntry,
} from "@/lib/family/store";
import styles from "./FamilySpaceLive.module.css";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const TABS = [
  { key: "results", label: "Résultats", icon: GraduationCap },
  { key: "attendance", label: "Vie scolaire", icon: UserRoundCheck },
  { key: "timetable", label: "Emploi du temps", icon: CalendarDays },
  { key: "messages", label: "Messages", icon: MessageCircle },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const ATTENDANCE_LABELS: Record<AttendanceEntry["kind"], string> = {
  absence: "Absence",
  late: "Retard",
  early_leave: "Départ anticipé",
};

function formatDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR");
}

export function FamilySpaceLive({ space }: { space: "parent" | "student" }) {
  const [identity, setIdentity] = useState<FamilyIdentity | null>(null);
  const [childId, setChildId] = useState("");
  const [tab, setTab] = useState<TabKey>("results");
  const [reports, setReports] = useState<ReportCardSummary[]>([]);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [messages, setMessages] = useState<FamilyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const resolved = await resolveFamilyIdentity(space);
        setIdentity(resolved);
        setChildId(resolved.children[0]?.id || "");
        if (resolved.guardianId) setMessages(await loadMessages(resolved.guardianId));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Chargement impossible.");
      } finally {
        setLoading(false);
      }
    })();
  }, [space]);

  const child: FamilyChild | undefined = identity?.children.find((item) => item.id === childId);

  useEffect(() => {
    if (!child) return;
    void (async () => {
      try {
        const [reportList, attendanceList, timetableList] = await Promise.all([
          loadReportCards(child.id),
          loadAttendance(child.id),
          loadTimetable(child.classId),
        ]);
        setReports(reportList);
        setAttendance(attendanceList);
        setTimetable(timetableList);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Lecture des données impossible.");
      }
    })();
  }, [child]);

  if (loading) return <div className={styles.state}>Chargement de vos informations…</div>;

  if (error)
    return (
      <div className={styles.stateError}>
        <Info /> {error}
      </div>
    );

  if (!identity || identity.kind === "unlinked" || !identity.children.length)
    return (
      <div className={styles.stateError}>
        <Info /> {identity?.reason || "Aucune donnée n'est rattachée à ce compte."}
      </div>
    );

  const absences = attendance.filter((item) => item.kind === "absence");
  const lates = attendance.filter((item) => item.kind === "late");

  return (
    <div className={styles.wrapper}>
      {identity.children.length > 1 && (
        <div className={styles.childBar}>
          {identity.children.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === childId ? styles.childActive : styles.childChip}
              onClick={() => setChildId(item.id)}
            >
              <b>{item.fullName}</b>
              <small>{item.className || "Classe non renseignée"}</small>
            </button>
          ))}
        </div>
      )}

      {child && (
        <div className={styles.childHeader}>
          <div>
            <small>{child.relationship}</small>
            <h2>{child.fullName}</h2>
            <p>{child.className || "Classe non renseignée"}</p>
          </div>
          <div className={styles.counters}>
            <span>
              <b>{absences.length}</b> absence(s)
            </span>
            <span>
              <b>{lates.length}</b> retard(s)
            </span>
            <span>
              <b>{reports.length}</b> bulletin(s)
            </span>
          </div>
        </div>
      )}

      <nav className={styles.tabs}>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={tab === key ? styles.tabActive : styles.tab}
            onClick={() => setTab(key)}
          >
            <Icon /> {label}
          </button>
        ))}
      </nav>

      {tab === "results" && (
        <section className={styles.panel}>
          {!reports.length ? (
            <p className={styles.empty}>
              Aucun bulletin publié pour le moment. Les bulletins apparaissent ici une fois validés par
              l’établissement.
            </p>
          ) : (
            reports.map((report) => (
              <article key={report.id} className={styles.report}>
                <header>
                  <div>
                    <b>Bulletin</b>
                    {report.rank && <small>Rang : {report.rank}</small>}
                  </div>
                  {report.average !== null && (
                    <span className={styles.average}>{Number(report.average).toFixed(2)}</span>
                  )}
                </header>
                <table>
                  <thead>
                    <tr>
                      <th>Matière</th>
                      <th>Moyenne</th>
                      <th>Coef.</th>
                      <th>Appréciation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.subjects.map((subject, index) => (
                      <tr key={`${report.id}-${index}`}>
                        <td>{subject.name}</td>
                        <td>{subject.average === null ? "—" : Number(subject.average).toFixed(2)}</td>
                        <td>{subject.coefficient}</td>
                        <td>{subject.comment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {report.generalComment && <p className={styles.comment}>{report.generalComment}</p>}
              </article>
            ))
          )}
        </section>
      )}

      {tab === "attendance" && (
        <section className={styles.panel}>
          {!attendance.length ? (
            <p className={styles.empty}>Aucune absence ni retard enregistré.</p>
          ) : (
            <ul className={styles.attendanceList}>
              {attendance.map((entry) => (
                <li key={entry.id} className={entry.justified ? styles.justified : styles.unjustified}>
                  <div>
                    <b>{ATTENDANCE_LABELS[entry.kind]}</b>
                    <small>{formatDate(entry.date)}</small>
                    {entry.reason && <em>{entry.reason}</em>}
                  </div>
                  <span>{entry.justified ? "Justifié" : "Non justifié"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "timetable" && (
        <section className={styles.panel}>
          {!timetable.length ? (
            <p className={styles.empty}>L’emploi du temps de cette classe n’a pas encore été renseigné.</p>
          ) : (
            DAYS.map((day, index) => {
              const slots = timetable.filter((slot) => slot.weekday === index + 1);
              if (!slots.length) return null;
              return (
                <div key={day} className={styles.day}>
                  <h3>{day}</h3>
                  <ul>
                    {slots.map((slot) => (
                      <li key={slot.id}>
                        <span className={styles.hour}>
                          {slot.startsAt} – {slot.endsAt}
                        </span>
                        <b>{slot.subject}</b>
                        {slot.room && <small>{slot.room}</small>}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>
      )}

      {tab === "messages" && (
        <section className={styles.panel}>
          {!messages.length ? (
            <p className={styles.empty}>Aucun message reçu de l’établissement.</p>
          ) : (
            messages.map((message) => (
              <article key={message.id} className={styles.message}>
                <header>
                  <b>{message.title}</b>
                  <small>{formatDate(message.receivedAt)}</small>
                </header>
                <p>{message.body}</p>
                {message.studentName && <small>Concerne {message.studentName}</small>}
              </article>
            ))
          )}
        </section>
      )}
    </div>
  );
}
