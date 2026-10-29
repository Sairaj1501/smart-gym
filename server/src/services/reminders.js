import { Membership, PTSession, Member, Trainer } from '../models/index.js';
import { getSettings } from './settings.js';
import { memberStates } from './membershipService.js';
import { engagementReport } from './engagementService.js';
import { notify, notifyMember, notifyRoles } from './notify.js';
import { toDayKey, parseDateOnly } from '../utils/dates.js';

/** Idempotent: dedupeKeys prevent repeat notifications, so it is safe to run as often as you like. */
export async function runReminders() {
  const s = await getSettings();
  const todayKey = toDayKey(new Date(), s.timezone);
  const week = Math.floor(parseDateOnly(todayKey).getTime() / (7 * 86400000));
  const created = { membership: 0, payment: 0, session: 0, attendance: 0 };
  const count = (key, r) => { if (r) created[key]++; };

  const states = await memberStates(s);
  for (const [memberId, st] of states) {
    if (st.state === 'expiring') count('membership', await notifyMember(memberId, { category: 'membership', title: 'Membership expiring soon', message: `Your ${st.planName} membership ends in ${st.daysLeft} day(s). Visit the front desk to renew.`, dedupeKey: `exp:${st.membershipId}` }));
    if (st.state === 'expired') count('membership', await notifyMember(memberId, { category: 'membership', title: 'Membership expired', message: `Your ${st.planName} membership has expired. Renew to keep checking in.`, dedupeKey: `expd:${st.membershipId}` }));
  }
  const dues = await Membership.find({ status: { $ne: 'cancelled' }, $expr: { $lt: ['$amountPaid', '$amountDue'] } }).select('member amountDue amountPaid').lean();
  for (const d of dues) count('payment', await notifyMember(d.member, { category: 'payment', title: 'Payment pending', message: `You have a pending balance of ${Math.round((d.amountDue - d.amountPaid) * 100) / 100}.`, dedupeKey: `due:${d._id}:${week}` }));

  const soon = await PTSession.find({ status: 'scheduled', start: { $gte: new Date(), $lte: new Date(Date.now() + 24 * 3600 * 1000) } }).lean();
  for (const ps of soon) {
    const msg = { category: 'session', title: 'Training session coming up', message: `Session at ${ps.start.toISOString().slice(0, 16).replace('T', ' ')} UTC.`, dedupeKey: `pt:${ps._id}` };
    count('session', await notifyMember(ps.member, msg));
    const t = await Trainer.findById(ps.trainer).select('user').lean();
    if (t) await notify(t.user, msg);
  }

  const eng = await engagementReport(s);
  for (const e of eng.items.filter((x) => x.status === 'inactive' || x.status === 'declining')) {
    const payload = { category: 'attendance', title: e.status === 'inactive' ? 'Member inactive' : 'Attendance declining', message: `${e.fullName} (${e.memberCode}): ${e.message}`, link: `/members/${e.memberId}`, dedupeKey: `eng:${e.memberId}:${e.status}:${week}` };
    count('attendance', (await notifyRoles(['admin', 'staff'], payload)).some(Boolean));
    if (e.trainer) { const t = await Trainer.findById(e.trainer).select('user').lean(); if (t) await notify(t.user, payload); }
  }
  return created;
}
export { Member };
