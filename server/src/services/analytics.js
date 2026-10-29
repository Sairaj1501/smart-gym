import { Member, Membership, Attendance, Payment, PTSession, Trainer, WorkoutLog } from '../models/index.js';
import { toDayKey, parseDateOnly, addDays, dayKeyOf, addMonths } from '../utils/dates.js';
import { memberStates } from './membershipService.js';
import { engagementReport } from './engagementService.js';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const monthKeys = (todayKey, n) => {
  const t = parseDateOnly(todayKey); const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  return Array.from({ length: n }, (_, i) => dayKeyOf(addMonths(first, i - (n - 1))).slice(0, 7));
};
const fill = (keys, rows, field = 'v') => { const m = new Map(rows.map((r) => [r._id, r[field]])); return keys.map((k) => ({ key: k, value: m.get(k) || 0 })); };

export async function dashboard(settings, role) {
  const tz = settings.timezone;
  const todayKey = toDayKey(new Date(), tz);
  const today = parseDateOnly(todayKey);
  const monthStartKey = `${todayKey.slice(0, 7)}-01`;
  const weekAgo = dayKeyOf(addDays(today, -6));
  const months = monthKeys(todayKey, 12);
  const monthStart = parseDateOnly(months[0] + '-01');

  const [states, totalMembers, activeMembers, newThisMonth, todayAtt, weekAtt, monthAtt, outstandingAgg, regRows, planRows, wdRows, dailyRows, hourRows, renewRows, upcomingPT, workoutLogs, trainers, eng] = await Promise.all([
    memberStates(settings, today),
    Member.countDocuments(), Member.countDocuments({ status: 'active' }),
    Member.countDocuments({ joiningDate: { $gte: parseDateOnly(monthStartKey) } }),
    Attendance.countDocuments({ dayKey: todayKey }),
    Attendance.countDocuments({ dayKey: { $gte: weekAgo } }),
    Attendance.countDocuments({ dayKey: { $gte: monthStartKey } }),
    Membership.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: null, due: { $sum: { $subtract: ['$amountDue', '$amountPaid'] } } } }]),
    Member.aggregate([{ $match: { joiningDate: { $gte: monthStart } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$joiningDate' } }, v: { $sum: 1 } } }]),
    Membership.aggregate([{ $match: { status: 'active', startDate: { $lte: today }, endDate: { $gte: today } } }, { $group: { _id: '$planSnapshot.name', v: { $sum: 1 } } }, { $sort: { v: -1 } }]),
    Attendance.aggregate([{ $match: { dayKey: { $gte: dayKeyOf(addDays(today, -90)) } } }, { $group: { _id: { $dayOfWeek: { $dateFromString: { dateString: '$dayKey' } } }, v: { $sum: 1 } } }]),
    Attendance.aggregate([{ $match: { dayKey: { $gte: dayKeyOf(addDays(today, -29)) } } }, { $group: { _id: '$dayKey', v: { $sum: 1 } } }]),
    Attendance.aggregate([{ $match: { dayKey: { $gte: dayKeyOf(addDays(today, -60)) } } }, { $group: { _id: { $hour: { date: '$checkInAt', timezone: tz } }, v: { $sum: 1 } } }]),
    Membership.aggregate([{ $match: { kind: 'renewal', startDate: { $gte: monthStart } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$startDate' } }, v: { $sum: 1 } } }]),
    PTSession.countDocuments({ status: 'scheduled', start: { $gte: new Date() } }),
    WorkoutLog.countDocuments({ dayKey: { $gte: monthStartKey } }),
    Trainer.find({ employmentStatus: 'active' }).select('fullName').lean(),
    engagementReport(settings),
  ]);

  const counts = { active: 0, expiring: 0, expired: 0, upcoming: 0 };
  for (const s of states.values()) counts[s.state]++;
  const withPlan = states.size;
  const dueSoon = [...states.entries()].filter(([, s]) => s.state === 'expiring').map(([id, s]) => ({ memberId: id, endDate: s.endDate, daysLeft: s.daysLeft, planName: s.planName }));

  const workload = await Promise.all(trainers.map(async (t) => ({
    trainer: t.fullName,
    members: await Member.countDocuments({ trainer: t._id, status: 'active' }),
    sessionsThisMonth: await PTSession.countDocuments({ trainer: t._id, status: { $ne: 'cancelled' }, start: { $gte: parseDateOnly(monthStartKey) } }),
  })));

  const data = {
    asOf: todayKey, demoData: settings.demoData,
    kpis: {
      totalMembers, activeMembers, newThisMonth,
      activeMemberships: counts.active + counts.expiring, expiringSoon: counts.expiring, expired: counts.expired,
      noMembership: Math.max(0, activeMembers - withPlan),
      todayAttendance: todayAtt, weekAttendance: weekAtt, monthAttendance: monthAtt,
      outstandingPayments: Math.round((outstandingAgg[0]?.due || 0) * 100) / 100,
      upcomingSessions: upcomingPT, workoutsLoggedThisMonth: workoutLogs,
      inactiveMembers: eng.counts.inactive || 0, decliningMembers: eng.counts.declining || 0,
    },
    charts: {
      registrations: fill(months, regRows),
      planDistribution: planRows.map((r) => ({ name: r._id, value: r.v })),
      attendanceByWeekday: WEEK.map((d, i) => ({ name: d, value: wdRows.find((r) => r._id === i + 1)?.v || 0 })),
      attendanceDaily: Array.from({ length: 30 }, (_, i) => { const k = dayKeyOf(addDays(today, i - 29)); return { key: k, value: dailyRows.find((r) => r._id === k)?.v || 0 }; }),
      peakHours: Array.from({ length: 24 }, (_, h) => ({ name: `${String(h).padStart(2, '0')}:00`, value: hourRows.find((r) => r._id === h)?.v || 0 })).filter((x) => x.value > 0),
      renewals: fill(months, renewRows),
    },
    trainerWorkload: workload,
    renewalsDue: dueSoon.slice(0, 20),
  };
  if (role === 'admin') {
    const rev = await Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: monthStart } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: tz } }, v: { $sum: '$amount' } } }]);
    const yearStart = new Date(`${todayKey.slice(0, 4)}-01-01T00:00:00Z`);
    const [yr] = await Payment.aggregate([{ $match: { status: 'paid', paidAt: { $gte: yearStart } } }, { $group: { _id: null, v: { $sum: '$amount' } } }]);
    data.charts.revenue = fill(months, rev);
    data.kpis.monthRevenue = data.charts.revenue[11].value;
    data.kpis.annualRevenue = yr?.v || 0;
  }
  return data;
}
