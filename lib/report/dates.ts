/** India-time date helpers for reports (pure, unit-tested). */
const IST_MS = 5.5 * 3600_000;

/** "2026-10-11" for the India-time calendar day of `d`. */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Midnight India time `daysAgo` days back, as a UTC Date. */
export function istMidnight(daysAgo = 0, now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_MS - daysAgo * 86_400_000);
}

/** Monday (India time) of the week containing `d`, as "2026-10-05". */
export function istWeekStart(d: Date): string {
  const ist = new Date(d.getTime() + IST_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - dow);
  return ist.toISOString().slice(0, 10);
}

/** Every day from `from` to `to` inclusive (India-time dates). */
export function dayRange(from: Date, to: Date): string[] {
  const days: string[] = [];
  for (let t = istMidnight(0, from).getTime(); t <= to.getTime(); t += 86_400_000)
    days.push(istDay(new Date(t)));
  return [...new Set(days)];
}
