"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readClasses, type ClassRecord } from "@/lib/class-store";
import { readPlatformWorkspace } from "@/lib/platform/store";
import type { PlatformWorkspace, TimetableSlot } from "@/lib/platform/types";

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const TIME_ROWS = [
  { start: "07:30", end: "08:25", label: "07h30" },
  { start: "08:25", end: "09:30", label: "08h25" },
  { start: "09:30", end: "10:25", label: "09h30" },
  { start: "10:25", end: "11:30", label: "10h25" },
  { start: "11:30", end: "12:25", label: "11h30" },
  { start: "12:25", end: "13:15", label: "12h25" },
  { start: "13:15", end: "14:25", label: "13h15" },
  { start: "14:25", end: "15:20", label: "14h25" },
  { start: "15:20", end: "16:10", label: "15h20" },
  { start: "16:10", end: "16:55", label: "16h10" },
  { start: "16:55", end: "17:40", label: "16h55" },
];

function classLabel(classes: ClassRecord[], classId: string) {
  const item = classes.find((classe) => classe.id === classId);
  return item?.name || "Classe";
}

function subjectLabel(workspace: PlatformWorkspace, subjectId: string) {
  return workspace.subjects.find((subject) => subject.id === subjectId)?.label || "Matière";
}

function teacherLabel(workspace: PlatformWorkspace, teacherId: string) {
  const teacher = workspace.users.find((user) => user.id === teacherId);
  return teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : "Enseignant";
}

function slotMatchesClass(slot: TimetableSlot, classes: ClassRecord[], classGroup?: string) {
  if (!classGroup?.trim()) return true;
  const normalized = classGroup.trim().toLocaleLowerCase("fr");
  const classe = classes.find((item) => item.id === slot.classId);
  if (!classe) return true;
  return (
    classe.name.toLocaleLowerCase("fr").includes(normalized) ||
    classe.level.toLocaleLowerCase("fr").includes(normalized)
  );
}

function slotForCell(slots: TimetableSlot[], weekday: number, startsAt: string) {
  return slots.find((slot) => slot.weekday === weekday && slot.startsAt <= startsAt && slot.endsAt > startsAt);
}

export function TeacherWeeklyTimetable({
  selectedWeek,
  classGroup,
}: {
  selectedWeek?: number;
  classGroup?: string;
}) {
  const [workspace, setWorkspace] = useState<PlatformWorkspace | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);

  useEffect(() => {
    const refresh = () => {
      setWorkspace(readPlatformWorkspace());
      setClasses(readClasses());
    };
    refresh();
    window.addEventListener("gabon-educ:storage", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("gabon-educ:storage", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const slots = useMemo(() => {
    if (!workspace) return [];
    return workspace.timetable
      .filter((slot) => slotMatchesClass(slot, classes, classGroup))
      .sort((a, b) => `${a.weekday}${a.startsAt}`.localeCompare(`${b.weekday}${b.startsAt}`, "fr"));
  }, [workspace, classes, classGroup]);

  return (
    <aside className="teacher-week-card teacher-week-card-board" aria-label="Emploi du temps enseignant">
      <header>
        <span>Semaine {selectedWeek || "—"}</span>
        <h2>Emploi du temps</h2>
        <p>{classGroup?.trim() ? `Filtré sur ${classGroup}` : "Cliquez une case pour remplir le cahier de textes."}</p>
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
              const slot = workspace ? slotForCell(slots, index + 1, row.start) : null;
              const href = `/gabon-educ/preparer-un-cours?week=${selectedWeek || ""}&day=${index + 1}&time=${row.start}`;
              return (
                <Link
                  href={href}
                  className={slot ? "teacher-week-board-cell has-course" : "teacher-week-board-cell"}
                  key={`${day}-${row.start}`}
                  title="Remplir le cahier de textes pour ce créneau"
                >
                  {slot && workspace ? (
                    <>
                      <strong>{subjectLabel(workspace, slot.subjectId)}</strong>
                      <span>{classLabel(classes, slot.classId)}</span>
                      <em>{teacherLabel(workspace, slot.teacherId)}</em>
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
