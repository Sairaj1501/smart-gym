// Date-only helpers. Membership dates are calendar dates stored as UTC midnight.
const MS_DAY = 86400000;

export function toDayKey(date = new Date(), tz = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function parseDateOnly(input) {
  if (input instanceof Date) return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input));
  if (!m) throw new Error('Invalid date, expected YYYY-MM-DD');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) throw new Error('Invalid calendar date');
  return d;
}

export const todayDate = (tz = 'Asia/Kolkata', now = new Date()) => parseDateOnly(toDayKey(now, tz));
export const addDays = (d, n) => new Date(d.getTime() + n * MS_DAY);
export const diffDays = (a, b) => Math.round((a.getTime() - b.getTime()) / MS_DAY);
export const dayKeyOf = (d) => d.toISOString().slice(0, 10);

export function addMonths(d, n) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

/** Inclusive end date: a 1-month plan starting 2026-01-15 ends 2026-02-14. */
export function computeEndDate(start, value, unit) {
  if (!Number.isInteger(value) || value < 1) throw new Error('Duration must be a positive integer');
  return unit === 'days' ? addDays(start, value - 1) : addDays(addMonths(start, value), -1);
}

/** upcoming | active | expiring | expired ('expiring' is active and within warnDays of the end). */
export function membershipStatus({ startDate, endDate }, today, warnDays = 7) {
  if (today < startDate) return 'upcoming';
  if (today > endDate) return 'expired';
  return diffDays(endDate, today) <= warnDays ? 'expiring' : 'active';
}

/** policy 'extend': renewing before expiry continues from the old end date; after expiry restarts today. */
export function renewalStart(currentEnd, today, policy = 'extend') {
  if (policy === 'extend' && currentEnd && currentEnd >= today) return addDays(currentEnd, 1);
  return today;
}

export function ageFromDob(dob, today = new Date()) {
  const d = new Date(dob);
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age--;
  return age;
}
