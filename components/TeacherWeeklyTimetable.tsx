"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TIMETABLE_PERIODS } from "@/lib/platform/timetable-hours";
import {
  loadCurrentTeacherTimetable,
  type TeacherTimetableSlot,
} from "@/lib/teacher-timetable";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

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
              ? `Filtré sur ${classGroup} · jusqu’à 14 h 30`
              : "Planning publié par l’établissement · jusqu’à 14 h 30"}
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
        {TIMETABLE_PERIODS.map((row) => (
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
