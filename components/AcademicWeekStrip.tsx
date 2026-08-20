"use client";

type AcademicWeekEntry = {
  key: string;
  label: string;
  month: string;
  week?: number;
  break?: boolean;
};

const ACADEMIC_WEEKS: AcademicWeekEntry[] = [
  { key: "36", label: "36", month: "septembre", week: 36 },
  { key: "37", label: "37", month: "septembre", week: 37 },
  { key: "38", label: "38", month: "septembre", week: 38 },
  { key: "39", label: "39", month: "septembre", week: 39 },
  { key: "40", label: "40", month: "octobre", week: 40 },
  { key: "41", label: "41", month: "octobre", week: 41 },
  { key: "42", label: "42", month: "octobre", week: 42 },
  { key: "43", label: "43", month: "octobre", week: 43 },
  { key: "44", label: "44", month: "novembre", week: 44 },
  { key: "45", label: "45", month: "novembre", week: 45 },
  { key: "46", label: "46", month: "novembre", week: 46 },
  { key: "break-1", label: "F", month: "novembre", break: true },
  { key: "48", label: "48", month: "décembre", week: 48 },
  { key: "49", label: "49", month: "décembre", week: 49 },
  { key: "50", label: "50", month: "décembre", week: 50 },
  { key: "51", label: "51", month: "décembre", week: 51 },
  { key: "break-2", label: "F", month: "janvier", break: true },
  { key: "1", label: "1", month: "janvier", week: 1 },
  { key: "2", label: "2", month: "janvier", week: 2 },
  { key: "3", label: "3", month: "janvier", week: 3 },
  { key: "4", label: "4", month: "janvier", week: 4 },
  { key: "5", label: "5", month: "février", week: 5 },
  { key: "6", label: "6", month: "février", week: 6 },
  { key: "7", label: "7", month: "février", week: 7 },
  { key: "8", label: "8", month: "février", week: 8 },
  { key: "break-3", label: "F", month: "mars", break: true },
  { key: "9", label: "9", month: "mars", week: 9 },
  { key: "10", label: "10", month: "mars", week: 10 },
  { key: "11", label: "11", month: "mars", week: 11 },
  { key: "12", label: "12", month: "mars", week: 12 },
  { key: "13", label: "13", month: "avril", week: 13 },
  { key: "14", label: "14", month: "avril", week: 14 },
  { key: "break-4", label: "F", month: "avril", break: true },
  { key: "15", label: "15", month: "avril", week: 15 },
  { key: "16", label: "16", month: "avril", week: 16 },
  { key: "17", label: "17", month: "mai", week: 17 },
  { key: "18", label: "18", month: "mai", week: 18 },
  { key: "19", label: "19", month: "mai", week: 19 },
  { key: "20", label: "20", month: "mai", week: 20 },
  { key: "21", label: "21", month: "mai", week: 21 },
  { key: "22", label: "22", month: "juin", week: 22 },
  { key: "23", label: "23", month: "juin", week: 23 },
  { key: "24", label: "24", month: "juin", week: 24 },
  { key: "25", label: "25", month: "juin", week: 25 },
  { key: "26", label: "26", month: "juin", week: 26 },
  { key: "27", label: "27", month: "juillet", week: 27 },
  { key: "28", label: "28", month: "juillet", week: 28 },
  { key: "29", label: "29", month: "juillet", week: 29 },
  { key: "30", label: "30", month: "juillet", week: 30 },
  { key: "31", label: "31", month: "juillet", week: 31 },
];

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

export function AcademicWeekStrip({
  selectedWeek,
  onSelect,
  compact = false,
  title = "Repère des semaines",
}: {
  selectedWeek?: number;
  onSelect?: (week: number) => void;
  compact?: boolean;
  title?: string;
}) {
  const activeWeek = selectedWeek || fallbackCurrentAcademicWeek();

  return (
    <section className={`academic-week-strip ${compact ? "compact" : ""}`}>
      <div className="academic-week-title">
        <b>{title}</b>
        <span>Année scolaire · semaines, mois et vacances</span>
      </div>
      <div className="academic-week-scroll" role="list" aria-label="Semaines de l’année scolaire">
        {ACADEMIC_WEEKS.map((entry) => {
          const active = entry.week === activeWeek;
          const content = (
            <>
              <strong>{entry.label}</strong>
              {!compact && <small>{entry.month}</small>}
            </>
          );

          if (!entry.week || entry.break) {
            return (
              <span className="academic-week-cell break" key={entry.key} role="listitem" title="Vacances">
                {content}
              </span>
            );
          }

          return (
            <button
              className={`academic-week-cell ${active ? "active" : ""}`}
              key={entry.key}
              type="button"
              onClick={() => onSelect?.(entry.week!)}
              aria-pressed={active}
            >
              {content}
            </button>
          );
        })}
      </div>
    </section>
  );
}
