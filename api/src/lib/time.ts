/**
 * Service days, in Cameroon time.
 *
 * The access fee is charged once per service day a driver actually worked, so
 * "which day is it" is a money question, not a display question. Cameroon is
 * UTC+1 all year with no daylight saving, which is why a fixed offset is exact
 * here rather than an approximation — and why this file pulls in no timezone
 * library to get it right.
 *
 * Using UTC instead would charge a driver who goes online at half past midnight
 * for the day before, and would put his late-evening trips in tomorrow's
 * earnings. Both are the kind of small wrongness a driver notices immediately
 * and never forgets.
 */

/** West Africa Time. Cameroon does not observe daylight saving. */
export const WAT_OFFSET_MINUTES = 60;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * The service date a moment belongs to, as UTC midnight of that Cameroon day.
 *
 * Stored in a `@db.Date` column, so what matters is that the calendar day is
 * right; the time component is always zero.
 */
export function serviceDate(at: Date = new Date()): Date {
  const local = new Date(at.getTime() + WAT_OFFSET_MINUTES * MS_PER_MINUTE);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** `2026-09-15` — the form both the API and the apps speak. */
export function serviceDateKey(at: Date = new Date()): string {
  return serviceDate(at).toISOString().slice(0, 10);
}

/** The instant a Cameroon calendar day begins, in real UTC. */
export function startOfServiceDay(at: Date = new Date()): Date {
  return new Date(serviceDate(at).getTime() - WAT_OFFSET_MINUTES * MS_PER_MINUTE);
}

/** The instant the next Cameroon calendar day begins, in real UTC. */
export function endOfServiceDay(at: Date = new Date()): Date {
  return new Date(startOfServiceDay(at).getTime() + MS_PER_DAY);
}

/**
 * Monday, because the earnings screen reads "Mon 7 to Sun 13 Sept" and because
 * the ghost-town Monday is the whole point of showing the week at all.
 */
export function startOfServiceWeek(at: Date = new Date()): Date {
  const date = serviceDate(at);
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  return new Date(date.getTime() - daysSinceMonday * MS_PER_DAY);
}

/** Every service date from `from` to `to` inclusive, as `YYYY-MM-DD`. */
export function serviceDateRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  for (let t = serviceDate(from).getTime(); t <= serviceDate(to).getTime(); t += MS_PER_DAY) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}

/** Is this service date a Monday? The day the numbers must not punish. */
export function isMonday(dateKey: string): boolean {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay() === 1;
}
