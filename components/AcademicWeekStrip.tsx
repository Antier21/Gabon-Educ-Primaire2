"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveActiveSchoolContext } from "@/lib/active-school";
import { createClient } from "@/lib/supabase/client";
import styles from "./AcademicWeekStrip.module.css";

type DayEntry = {
  iso: string;
  date: Date;
  week: number;
  weekKey: string;
  weekday: string;
  dayNumber: number;
  month: string;
  beginsMonth: boolean;
  endsWeek: boolean;
  today: boolean;
};

type WeekEntry = {
  key: string;
  week: number;
  days: DayEntry[];
};

const YEAR_DAY_COUNT = 365;

function localISO(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function fromISO(value: string) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function addDays(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12, 0, 0, 0);
}

function mondayOf(date: Date) {
  const day = date.getDay();
  const back = day === 0 ? 6 : day - 1;
  return addDays(date, -back);
}

function isoWeekNumber(date: Date) {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const day = target.getDay() || 7;
  target.setDate(target.getDate() + 4 - day);
  const yearStart = new Date(target.getFullYear(), 0, 1, 12, 0, 0, 0);
  return Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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
  return date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "").toUpperCase();
}

export function AcademicWeekStrip({
  selectedWeek,
  onSelect,
  compact = false,
  title = "Repère annuel",
}: {
  selectedWeek?: number;
  onSelect?: (week: number) => void;
  compact?: boolean;
  title?: string;
}) {
  const [academicStart, setAcademicStart] = useState<Date>(() => fallbackAcademicStart());
  const [academicLabel, setAcademicLabel] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayISO = localISO(new Date());

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
        if (row.starts_on) setAcademicStart(fromISO(row.starts_on));
        if (row.label) setAcademicLabel(row.label);
      } catch {
        // La frise reste utilisable avec la borne scolaire locale de secours.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const days = useMemo<DayEntry[]>(() =>
    Array.from({ length: YEAR_DAY_COUNT }, (_, index) => {
      const date = addDays(academicStart, index);
      return {
        iso: localISO(date),
        date,
        week: isoWeekNumber(date),
        weekKey: localISO(mondayOf(date)),
        weekday: shortWeekday(date),
        dayNumber: date.getDate(),
        month: shortMonth(date),
        beginsMonth: index === 0 || date.getDate() === 1,
        endsWeek: date.getDay() === 0,
        today: localISO(date) === todayISO,
      };
    }), [academicStart, todayISO]);

  const weeks = useMemo<WeekEntry[]>(() => {
    const grouped = new Map<string, DayEntry[]>();
    for (const day of days) {
      const values = grouped.get(day.weekKey) || [];
      values.push(day);
      grouped.set(day.weekKey, values);
    }
    return Array.from(grouped.entries()).map(([key, values]) => ({
      key,
      week: values[0]?.week || 1,
      days: values,
    }));
  }, [days]);

  const activeWeek = selectedWeek || isoWeekNumber(new Date());

  useEffect(() => {
    const active = scrollRef.current?.querySelector<HTMLElement>(`[data-week="${activeWeek}"]`);
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeWeek, weeks]);

  const end = addDays(academicStart, YEAR_DAY_COUNT - 1);
  const label = academicLabel || `${academicStart.getFullYear()}-${end.getFullYear()}`;

  return (
    <section className={`${styles.strip} ${compact ? styles.compact : ""}`}>
      <div className={styles.header}>
        <div>
          <b>{title}</b>
          <span>Année scolaire {label} · {YEAR_DAY_COUNT} jours · {weeks.length} semaines</span>
        </div>
        <small>Cliquer sur un jour pour positionner la semaine</small>
      </div>

      <div className={styles.legend} aria-hidden="true">
        <span><i /> Jour</span>
        <span><i className={styles.weekEndKey} /> Dimanche · fin de semaine</span>
        <span><i className={styles.todayKey} /> Jour en cours</span>
      </div>

      <div className={styles.scroll} ref={scrollRef}>
        <div className={styles.weeks} role="list" aria-label="365 jours de l’année scolaire">
          {weeks.map((week) => (
            <div
              key={week.key}
              data-week={week.week}
              className={`${styles.week} ${week.week === activeWeek ? styles.weekActive : ""}`}
            >
              <div className={styles.weekLabel}>S{week.week}</div>
              <div className={styles.days}>
                {week.days.map((day) => (
                  <button
                    key={day.iso}
                    type="button"
                    className={`${styles.day} ${day.endsWeek ? styles.weekEnd : ""} ${day.today ? styles.today : ""}`}
                    onClick={() => onSelect?.(day.week)}
                    title={`${day.date.toLocaleDateString("fr-FR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })} · semaine ${day.week}`}
                    aria-label={`Semaine ${day.week}, ${day.date.toLocaleDateString("fr-FR")}`}
                  >
                    <span className={styles.month}>{day.beginsMonth ? day.month : ""}</span>
                    <span className={styles.weekday}>{day.weekday}</span>
                    <strong>{day.dayNumber}</strong>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
