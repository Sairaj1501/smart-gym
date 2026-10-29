import { parseDateOnly, diffDays } from './dates.js';

export const ENGAGEMENT_DEFAULTS = { inactiveDays: 10, recentDays: 14, baselineWeeks: 4, declineRatio: 0.5, minBaselinePerWeek: 2, newMemberDays: 21 };

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Pure analysis of real attendance records. Never infers health status.
 * status: new | engaged | declining | inactive
 */
export function analyzeEngagement({ visitDayKeys, todayKey, joinedKey, cfg = {} }) {
  const c = { ...ENGAGEMENT_DEFAULTS, ...cfg };
  const today = parseDateOnly(todayKey);
  const joined = parseDateOnly(joinedKey);
  const days = [...new Set(visitDayKeys)].sort();
  const last = days.length ? days[days.length - 1] : null;
  const sinceJoin = diffDays(today, joined);
  const daysSinceLastVisit = last ? diffDays(today, parseDateOnly(last)) : sinceJoin;

  const ageOf = (k) => diffDays(today, parseDateOnly(k));
  const recent = days.filter((k) => ageOf(k) < c.recentDays).length;
  const baseline = days.filter((k) => ageOf(k) >= c.recentDays && ageOf(k) < c.recentDays + c.baselineWeeks * 7).length;
  const recentPerWeek = round1(recent / (c.recentDays / 7));
  const baselinePerWeek = round1(baseline / c.baselineWeeks);

  let status = 'engaged';
  let message = `Averaging ${recentPerWeek} visits/week over the last ${c.recentDays} days.`;
  if (sinceJoin < c.newMemberDays) {
    status = 'new';
    message = 'Joined recently; not enough history to judge a trend.';
  } else if (daysSinceLastVisit >= c.inactiveDays) {
    status = 'inactive';
    message = last
      ? `No visit for ${daysSinceLastVisit} days (last visit ${last}).`
      : `No visits recorded since joining ${sinceJoin} days ago.`;
    if (baselinePerWeek >= c.minBaselinePerWeek) message += ` Previously averaged ${baselinePerWeek} visits/week.`;
  } else if (baselinePerWeek >= c.minBaselinePerWeek && recentPerWeek <= baselinePerWeek * c.declineRatio) {
    status = 'declining';
    message = `Averaged ${baselinePerWeek} visits/week in the prior ${c.baselineWeeks} weeks, but ${recentPerWeek} in the last ${c.recentDays} days.`;
  }
  return { status, daysSinceLastVisit, recentPerWeek, baselinePerWeek, lastVisit: last, message };
}
