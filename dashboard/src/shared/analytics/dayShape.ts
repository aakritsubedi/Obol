import type { DayJournal } from "@shared/api";

export interface HourLoad {
  hour: number;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface DayShape {
  hours: HourLoad[];
  activeMinutes: number;
  startedAt: string | null;
  endedAt: string | null;
  peakHour: number | null;
}

function hourLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes < 1) return 0;
  if (minutes <= 15) return 1;
  if (minutes <= 30) return 2;
  if (minutes <= 45) return 3;
  return 4;
}

export function dayShape(journal: DayJournal | null): DayShape {
  const minutes = Array.from({ length: 24 }, () => 0);
  const empty: DayShape = {
    hours: minutes.map((_, hour) => ({ hour, minutes: 0, level: 0 as const })),
    activeMinutes: 0,
    startedAt: null,
    endedAt: null,
    peakHour: null,
  };
  if (!journal) return empty;

  const midnight = new Date(`${journal.date}T00:00:00`);
  if (Number.isNaN(midnight.valueOf())) return empty;
  const bounds = Array.from({ length: 25 }, (_, hour) => {
    const edge = new Date(midnight);
    edge.setHours(hour, 0, 0, 0);
    return edge.valueOf();
  });

  for (const session of journal.sessions ?? []) {
    const active = Math.max(0, session.activeMinutes ?? 0);
    if (active <= 0) continue;
    const start = Date.parse(session.startedAt);
    if (!Number.isFinite(start)) continue;
    const parsedEnd = Date.parse(session.endedAt);
    const end = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd : start;
    const overlaps = bounds.slice(0, 24).map((from, hour) => {
      const to = bounds[hour + 1];
      return Math.max(0, Math.min(end, to) - Math.max(start, from));
    });
    const covered = overlaps.reduce((sum, span) => sum + span, 0);
    if (covered <= 0) {
      const hour = Math.min(23, Math.max(0, new Date(start).getHours()));
      minutes[hour] += active;
      continue;
    }
    for (let hour = 0; hour < 24; hour++) {
      if (overlaps[hour] > 0) minutes[hour] += active * (overlaps[hour] / covered);
    }
  }

  const hours = minutes.map((value, hour) => {
    const capped = Math.min(60, value);
    return { hour, minutes: capped, level: hourLevel(capped) };
  });
  const busiest = hours.reduce((best, entry) => (entry.minutes > best.minutes ? entry : best), hours[0]);
  return {
    hours,
    activeMinutes: journal.activeMinutes ?? 0,
    startedAt: journal.firstEventAt,
    endedAt: journal.lastEventAt,
    peakHour: busiest.minutes > 0 ? busiest.hour : null,
  };
}

export function formatClock(iso: string | null, locale?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function formatHourLabel(hour: number, locale?: string): string {
  const date = new Date(2000, 0, 1, hour);
  return new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(date);
}
