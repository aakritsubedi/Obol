export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "UTC";
}

export interface TimeSource {
  now: () => Date;
  timeZone: () => string;
}

export const systemTime: TimeSource = {
  now: () => new Date(),
  timeZone: systemTimeZone,
};

export function dateForTimeZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDate(date: string, days: number, timezone: string): string {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return dateForTimeZone(shifted, timezone);
}
