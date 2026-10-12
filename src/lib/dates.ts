// Week maths in India time. A brief's week runs Monday 00:00 IST -> next Monday 00:00 IST.

const IST_MS = 5.5 * 3600_000;
const DAY = 864e5;

/** "YYYY-MM-DD" (an IST calendar day) -> the instant that day starts in IST. */
export function istDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - IST_MS);
}

/** The IST calendar day containing `d`, as "YYYY-MM-DD". */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Monday (IST) of the week containing `d`, as "YYYY-MM-DD". */
export function istMonday(d: Date): string {
  const local = new Date(d.getTime() + IST_MS);
  const back = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - back * DAY).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

export const isDay = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
