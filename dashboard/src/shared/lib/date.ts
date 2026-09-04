export function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function periodDate(period: string): number | null {
  if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(period)) return null;
  const value = new Date(`${period.length === 7 ? `${period}-01` : period.slice(0, 10)}T12:00:00`).valueOf();
  return Number.isFinite(value) ? value : null;
}
