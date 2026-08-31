"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { createClient } from "@/lib/supabase/client";
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
  return ["D", "L", "M", "M", "J", "V", "S"][date.getDay()];
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

function findEditorDateInput() {
  return document.querySelector<HTMLInputElement>(
    '.lesson-book-annual-shell input[type="date"]',
  );
}

function setNativeDate(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export function AnnualLessonBookTimeline() {
  const [portalHost, setPortalHost] = useState<HTMLDivElement | null>(null);
  const [academicStart, setAcademicStart] = useState<Date>(() => fallbackAcademicStart());
  const [academicLabel, setAcademicLabel] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));
  const viewportRef = useRef<HTMLDivElement>(null);
  const internalDateChange = useRef(false);
  const internalWeekNavigation = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = await resolveActiveSchoolContext();
        if (!context.school?.id || context.school.id === "local") return;
        let query = createClient()
          .from("academic_years")
          .select("id,label,starts_on")
          .eq("school_id", context.school.id);
        if (context.school.activeAcademicYearId) {
          query = query.eq("id", context.school.activeAcademicYearId);
        } else {
          query = query.order("is_current", { ascending: false }).order("starts_on", { ascending: false }).limit(1);
        }
        const { data, error } = await query.maybeSingle();
        if (error || !data || cancelled) return;
        const row = data as unknown as { label?: string; starts_on?: string };
        if (row.starts_on) setAcademicStart(atNoon(fromISODate(row.starts_on)));
        if (row.label) setAcademicLabel(row.label);
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

    const dateInput = findEditorDateInput();
    if (dateInput?.value) setSelectedDate(dateInput.value);

    return () => {
      slot.remove();
      setPortalHost(null);
    };
  }, []);

  function navigateWeek(targetMondayISO: string) {
    const currentMonday = weekStart(new Date());
    const target = fromISODate(targetMondayISO);
    const difference = Math.round((target.getTime() - currentMonday.getTime()) / (DAY_MS * 7));

    internalWeekNavigation.current = true;
    findThisWeekButton()?.click();
    const direction = difference < 0 ? "Semaine précédente" : "Semaine suivante";
    const button = findWeekButton(direction);
    for (let index = 0; index < Math.abs(difference); index += 1) button?.click();
    queueMicrotask(() => {
      internalWeekNavigation.current = false;
    });
  }

  useEffect(() => {
    const handleDateChange = (event: Event) => {
      const target = event.target;
      const dateInput = findEditorDateInput();
      if (!(target instanceof HTMLInputElement) || target !== dateInput || !target.value) return;
      setSelectedDate(target.value);
      if (!internalDateChange.current) {
        navigateWeek(toISODate(weekStart(fromISODate(target.value))));
      }
      internalDateChange.current = false;
    };

    document.addEventListener("change", handleDateChange, true);
    return () => document.removeEventListener("change", handleDateChange, true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const value = findEditorDateInput()?.value;
      if (value && value !== selectedDate) setSelectedDate(value);
    }, 180);
    return () => window.clearInterval(timer);
  }, [selectedDate]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (internalWeekNavigation.current) return;
      const button = (event.target as HTMLElement | null)?.closest("button");
      if (button?.textContent?.trim() !== "Cette semaine") return;
      const today = toISODate(new Date());
      setSelectedDate(today);
      const input = findEditorDateInput();
      if (!input) return;
      internalDateChange.current = true;
      setNativeDate(input, today);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
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

  const selectedMonday = toISODate(weekStart(fromISODate(selectedDate)));

  useEffect(() => {
    if (!portalHost) return;
    const viewport = viewportRef.current;
    const selected = viewport?.querySelector<HTMLElement>(`[data-date="${selectedDate}"]`);
    selected?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [portalHost, selectedDate, weeks]);

  function openDay(day: TimelineDay) {
    setSelectedDate(day.iso);
    navigateWeek(day.weekStart);
    const input = findEditorDateInput();
    if (!input) return;
    internalDateChange.current = true;
    setNativeDate(input, day.iso);
  }

  const selectedRange = formatWeekRange(fromISODate(selectedMonday));
  const endDate = addDays(academicStart, YEAR_DAY_COUNT - 1);
  const resolvedLabel = academicLabel || `${academicStart.getFullYear()}-${endDate.getFullYear()}`;

  if (!portalHost) return null;

  return createPortal(
    <section className="annual-lesson-timeline" aria-label="Frise annuelle du cahier de textes">
      <header className="annual-lesson-timeline__header">
        <div>
          <strong>Année scolaire {resolvedLabel}</strong>
          <span>{YEAR_DAY_COUNT} jours · {weeks.length} semaines</span>
        </div>
        <div className="annual-lesson-timeline__selection">
          <span>Jour affiché : {fromISODate(selectedDate).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
          <strong>{selectedRange}</strong>
        </div>
      </header>

      <div className="annual-lesson-timeline__legend" aria-hidden="true">
        <span><i className="annual-lesson-timeline__legend-day" /> Jour</span>
        <span><i className="annual-lesson-timeline__legend-sunday" /> Dimanche · fin de semaine</span>
        <span><i className="annual-lesson-timeline__legend-current" /> Aujourd’hui</span>
        <span><i className="annual-lesson-timeline__legend-outline" /> Jour affiché dans l’éditeur</span>
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
                    data-date={day.iso}
                    className={`annual-lesson-day${day.endsWeek ? " is-week-end" : ""}${day.isToday ? " is-today" : ""}${day.iso === selectedDate ? " is-active" : ""}`}
                    onClick={() => openDay(day)}
                    title={`${day.date.toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })} — afficher ce jour dans le cahier`}
                    aria-label={`Afficher le ${day.date.toLocaleDateString("fr-FR")} dans le cahier de textes`}
                    aria-pressed={day.iso === selectedDate}
                  >
                    <span className="annual-lesson-day__month">{day.beginsMonth ? day.month : ""}</span>
                    <span className="annual-lesson-day__weekday">{day.weekday}</span>
                    <strong>{day.dayNumber}</strong>
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
