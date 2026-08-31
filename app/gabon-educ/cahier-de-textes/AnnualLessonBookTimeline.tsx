"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { resolveActiveAcademicYear } from "@/lib/report-model/periods-store";
import {
  formatWeekRange,
  fromISODate,
  toISODate,
  weekStart,
} from "@/lib/lesson-book/week";

type TimelineDay = {
  date: Date;
  iso: string;
  weekStart: string;
  weekday: string;
  dayNumber: number;
  month: string;
  beginsMonth: boolean;
  endsWeek: boolean;
  isToday: boolean;
};

type TimelineWeek = {
  key: string;
  index: number;
  days: TimelineDay[];
};

const DAY_MS = 86_400_000;
const YEAR_DAY_COUNT = 365;

function atNoon(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12, 0, 0, 0);
}

function fallbackAcademicStart() {
  const today = new Date();
  const startYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  return new Date(startYear, 8, 1, 12, 0, 0, 0);
}

function shortWeekday(date: Date) {
  const labels = ["D", "L", "M", "M", "J", "V", "S"];
  return labels[date.getDay()];
}

function shortMonth(date: Date) {
  return date
    .toLocaleDateString("fr-FR", { month: "short" })
    .replace(".", "")
    .toLocaleUpperCase("fr-FR");
}

function findWeekButton(label: "Semaine précédente" | "Semaine suivante") {
  return document.querySelector<HTMLButtonElement>(
    `.lesson-book-annual-shell button[aria-label="${label}"]`,
  );
}

function findThisWeekButton() {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(".lesson-book-annual-shell button"),
  ).find((button) => button.textContent?.trim() === "Cette semaine");
}

export function AnnualLessonBookTimeline() {
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const [academicStart, setAcademicStart] = useState<Date>(() => fallbackAcademicStart());
  const [academicLabel, setAcademicLabel] = useState("");
  const [selectedMonday, setSelectedMonday] = useState(() => toISODate(weekStart(new Date())));
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        if (!context.school?.id || context.school.id === "local") return;
        const year = await resolveActiveAcademicYear(context.school.id);
        if (!year || cancelled) return;
        setAcademicStart(atNoon(fromISODate(year.starts_on)));
        setAcademicLabel(year.label || "");
      } catch {
        // La frise reste utilisable avec sa borne locale de secours.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const previous = findWeekButton("Semaine précédente");
    const topbar = previous?.closest("header");
    if (!topbar?.parentElement) return;

    const slot = document.createElement("div");
    slot.className = "annual-lesson-timeline-slot";
    topbar.insertAdjacentElement("afterend", slot);
    setPortalHost(slot);

    return () => {
      slot.remove();
      setPortalHost(null);
    };
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (button?.textContent?.trim() === "Cette semaine") {
        setSelectedMonday(toISODate(weekStart(new Date())));
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  const days = useMemo<TimelineDay[]>(() => {
    const todayIso = toISODate(new Date());
    return Array.from({ length: YEAR_DAY_COUNT }, (_, index) => {
      const date = addDays(academicStart, index);
      return {
        date,
        iso: toISODate(date),
        weekStart: toISODate(weekStart(date)),
        weekday: shortWeekday(date),
        dayNumber: date.getDate(),
        month: shortMonth(date),
        beginsMonth: index === 0 || date.getDate() === 1,
        endsWeek: date.getDay() === 0,
        isToday: toISODate(date) === todayIso,
      };
    });
  }, [academicStart]);

  const weeks = useMemo<TimelineWeek[]>(() => {
    const grouped = new Map<string, TimelineDay[]>();
    for (const day of days) {
      const values = grouped.get(day.weekStart) || [];
      values.push(day);
      grouped.set(day.weekStart, values);
    }
    return Array.from(grouped.entries()).map(([key, values], index) => ({
      key,
      index: index + 1,
      days: values,
    }));
  }, [days]);

  useEffect(() => {
    if (!portalHost) return;
    const viewport = viewportRef.current;
    const selected = viewport?.querySelector<HTMLElement>(
      `[data-week-start="${selectedMonday}"]`,
    );
    selected?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [portalHost, selectedMonday, weeks]);

  function openWeek(targetMonday: string) {
    const currentMonday = weekStart(new Date());
    const target = fromISODate(targetMonday);
    const difference = Math.round((target.getTime() - currentMonday.getTime()) / (DAY_MS * 7));

    findThisWeekButton()?.click();
    const direction = difference < 0 ? "Semaine précédente" : "Semaine suivante";
    const button = findWeekButton(direction);
    for (let index = 0; index < Math.abs(difference); index += 1) button?.click();
    setSelectedMonday(targetMonday);
  }

  const selectedRange = formatWeekRange(fromISODate(selectedMonday));
  const endDate = addDays(academicStart, YEAR_DAY_COUNT - 1);
  const resolvedLabel =
    academicLabel || `${academicStart.getFullYear()}-${endDate.getFullYear()}`;

  if (!portalHost) return null;

  return createPortal(
    <section className="annual-lesson-timeline" aria-label="Frise annuelle du cahier de textes">
      <header className="annual-lesson-timeline__header">
        <div>
          <strong>Année scolaire {resolvedLabel}</strong>
          <span>{YEAR_DAY_COUNT} jours · {weeks.length} semaines</span>
        </div>
        <div className="annual-lesson-timeline__selection">
          <span>Semaine affichée</span>
          <strong>{selectedRange}</strong>
        </div>
      </header>

      <div className="annual-lesson-timeline__legend" aria-hidden="true">
        <span><i className="annual-lesson-timeline__legend-day" /> Jour</span>
        <span><i className="annual-lesson-timeline__legend-sunday" /> Dimanche · fin de semaine</span>
        <span><i className="annual-lesson-timeline__legend-outline" /> Semaine sélectionnée</span>
      </div>

      <div className="annual-lesson-timeline__viewport" ref={viewportRef}>
        <div className="annual-lesson-timeline__weeks">
          {weeks.map((week) => (
            <div
              key={week.key}
              className={`annual-lesson-week${week.key === selectedMonday ? " is-selected" : ""}`}
              data-week-start={week.key}
            >
              <div className="annual-lesson-week__label">S{week.index}</div>
              <div className="annual-lesson-week__days">
                {week.days.map((day) => (
                  <button
                    key={day.iso}
                    type="button"
                    className={`annual-lesson-day${day.endsWeek ? " is-week-end" : ""}${day.isToday ? " is-today" : ""}`}
                    onClick={() => openWeek(day.weekStart)}
                    title={`${day.date.toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })} — ouvrir cette semaine`}
                    aria-label={`Ouvrir la semaine du ${day.date.toLocaleDateString("fr-FR")}`}
                  >
                    <span className="annual-lesson-day__month">{day.beginsMonth ? day.month : ""}</span>
                    <span className="annual-lesson-day__weekday">{day.weekday}</span>
                    <strong>{day.dayNumber}</strong>
                    {day.isToday ? <i aria-label="Aujourd’hui" /> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>,
    portalHost,
  );
}
