"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  loadCurrentTeacherTimetable,
  type TeacherTimetableSlot,
} from "@/lib/teacher-timetable";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const TIME_ROWS = [
  { start: "07:30", end: "08:25", label: "07h30" },
  { start: "08:25", end: "09:20", label: "08h25" },
  { start: "09:30", end: "10:25", label: "09h30" },
  { start: "10:25", end: "11:20", label: "10h25" },
  { start: "11:30", end: "12:25", label: "11h30" },
  { start: "12:25", end: "13:15", label: "12h25" },
  { start: "13:15", end: "14:10", label: "13h15" },
  { start: "14:25", end: "15:20", label: "14h25" },
  { start: "15:20", end: "16:10", label: "15h20" },
  { start: "16:10", end: "16:55", label: "16h10" },
  { start: "16:55", end: "17:40", label: "16h55" },
];

function slotMatchesClass(slot: TeacherTimetableSlot, classGroup?: string) {
  if (!classGroup?.trim()) return true;
  const normalized = classGroup.trim().toLocaleLowerCase("fr");
  return slot.className.toLocaleLowerCase("fr").includes(normalized);
}

function slotForCell(slots: TeacherTimetableSlot[], weekday: number, startsAt: string) {
  return slots.find(
    (slot) => slot.weekday === weekday && slot.startsAt <= startsAt && slot.endsAt > startsAt,
  );
}

export function TeacherWeeklyTimetable({
  selectedWeek,
  classGroup,
}: {
  selectedWeek?: number;
  classGroup?: string;
}) {
  const [cloudSlots, setCloudSlots] = useState<TeacherTimetableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const slots = await loadCurrentTeacherTimetable();
        if (cancelled) return;
        setCloudSlots(slots);
        setWarning("");
      } catch (error) {
        if (cancelled) return;
        setWarning(
          error instanceof Error
            ? error.message
            : "L’emploi du temps publié est momentanément indisponible.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void refresh();
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const classFilteredSlots = useMemo(
    () => cloudSlots.filter((slot) => slotMatchesClass(slot, classGroup)),
    [cloudSlots, classGroup],
  );
  const classFilterApplied = Boolean(classGroup?.trim() && classFilteredSlots.length);
  const slots = useMemo(
    () =>
      (classFilterApplied ? classFilteredSlots : cloudSlots)
        .slice()
        .sort((a, b) => `${a.weekday}${a.startsAt}`.localeCompare(`${b.weekday}${b.startsAt}`, "fr")),
    [classFilterApplied, classFilteredSlots, cloudSlots],
  );

  return (
    <aside className="teacher-week-card teacher-week-card-board" aria-label="Emploi du temps enseignant">
      <header>
        <span>Semaine {selectedWeek || "—"}</span>
        <h2>Emploi du temps</h2>
        <p>
          {loading
            ? "Chargement du planning publié…"
            : classFilterApplied
              ? `Filtré sur ${classGroup}`
              : "Planning publié par l’établissement"}
        </p>
        {warning ? <small role="alert">{warning}</small> : null}
      </header>

      <div className="teacher-week-board" role="table" aria-label="Tableau hebdomadaire de l’enseignant">
        <div className="teacher-week-board-head" role="row">
          <b />
          {DAYS.map((day) => (
            <b key={day}>{day}</b>
          ))}
        </div>
        {TIME_ROWS.map((row) => (
          <div className="teacher-week-board-row" role="row" key={row.start}>
            <small>{row.label}</small>
            {DAYS.map((day, index) => {
              const slot = slotForCell(slots, index + 1, row.start);
              const params = new URLSearchParams({
                week: String(selectedWeek || ""),
                day: String(index + 1),
                time: row.start,
              });
              if (slot) {
                params.set("classId", slot.classId);
                params.set("className", slot.className);
                params.set("subject", slot.subjectLabel);
              }
              const href = `/gabon-educ/preparer-un-cours?${params.toString()}`;
              return (
                <Link
                  href={href}
                  className={slot ? "teacher-week-board-cell has-course" : "teacher-week-board-cell"}
                  key={`${day}-${row.start}`}
                  title={slot ? `${slot.subjectLabel} · ${slot.className}` : "Préparer un cours pour ce créneau"}
                >
                  {slot ? (
                    <>
                      <strong>{slot.subjectLabel}</strong>
                      <span>{slot.className}</span>
                      {slot.room ? <em>{slot.room}</em> : null}
                    </>
                  ) : (
                    <span className="empty-cell-label">+</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
