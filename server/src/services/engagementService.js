import { Member, Attendance } from '../models/index.js';
import { analyzeEngagement } from '../utils/engagement.js';
import { toDayKey, parseDateOnly, addDays, dayKeyOf } from '../utils/dates.js';
import { memberStates } from './membershipService.js';

/** Real attendance records only. Members with expired/no membership are skipped (not "disengaged", just not current). */
export async function engagementReport(settings, { trainerId } = {}) {
  const todayKey = toDayKey(new Date(), settings.timezone);
  const since = dayKeyOf(addDays(parseDateOnly(todayKey), -70));
  const members = await Member.find({ status: 'active', ...(trainerId ? { trainer: trainerId } : {}) }).select('fullName memberCode joiningDate trainer').lean();
  const [att, states] = await Promise.all([
    Attendance.find({ member: { $in: members.map((m) => m._id) }, dayKey: { $gte: since } }).select('member dayKey').lean(),
    memberStates(settings),
  ]);
  const byMember = new Map();
  for (const a of att) (byMember.get(String(a.member)) || byMember.set(String(a.member), []).get(String(a.member))).push(a.dayKey);
  const out = [];
  for (const m of members) {
    const st = states.get(String(m._id));
    if (!st || st.state === 'expired' || st.state === 'upcoming') continue;
    const r = analyzeEngagement({ visitDayKeys: byMember.get(String(m._id)) || [], todayKey, joinedKey: dayKeyOf(m.joiningDate), cfg: { inactiveDays: settings.inactiveDays, declineRatio: settings.declineRatio } });
    out.push({ memberId: m._id, memberCode: m.memberCode, fullName: m.fullName, trainer: m.trainer, ...r });
  }
  const order = { inactive: 0, declining: 1, engaged: 2, new: 3 };
  out.sort((a, b) => order[a.status] - order[b.status] || b.daysSinceLastVisit - a.daysSinceLastVisit);
  return { todayKey, items: out, counts: out.reduce((c, x) => ({ ...c, [x.status]: (c[x.status] || 0) + 1 }), {}) };
}
