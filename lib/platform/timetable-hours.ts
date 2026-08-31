export const TIMETABLE_DAY_END = "14:30";

export const TIMETABLE_PERIODS = [
  { label: "07h30", start: "07:30", end: "08:25" },
  { label: "08h25", start: "08:25", end: "09:20" },
  { label: "09h30", start: "09:30", end: "10:25" },
  { label: "10h25", start: "10:25", end: "11:20" },
  { label: "11h30", start: "11:30", end: "12:25" },
  { label: "12h25", start: "12:25", end: "13:15" },
  { label: "13h15", start: "13:15", end: "14:10" },
] as const;

export function isTimetableSlotWithinDay(startsAt: string, endsAt: string) {
  return Boolean(startsAt) && Boolean(endsAt) && startsAt < TIMETABLE_DAY_END && endsAt <= TIMETABLE_DAY_END;
}

export function clampTimetableDayEnd(value?: string) {
  const requested = String(value || TIMETABLE_DAY_END);
  return requested > TIMETABLE_DAY_END ? TIMETABLE_DAY_END : requested;
}
