import mongoose from 'mongoose';
import { Router } from 'express';
import { Member, Membership, Attendance, WorkoutPlan, DietPlan, PTSession, HealthMetric, Notification } from '../models/index.js';
import { authorize } from '../middleware/auth.js';
import { asyncHandler, HttpError } from '../utils/http.js';
import { getSettings } from '../services/settings.js';
import { dashboard } from '../services/analytics.js';
import { engagementReport } from '../services/engagementService.js';
import { memberStates, currentMembership, decorate } from '../services/membershipService.js';
import { outstandingForMember } from '../services/paymentService.js';
import { toDayKey, todayDate, parseDateOnly, addDays, dayKeyOf } from '../utils/dates.js';

const r = Router();
const staff = authorize('admin', 'staff');
r.get('/dashboard', staff, asyncHandler(async (req, res) => res.json(await dashboard(await getSettings(), req.user.role))));
r.get('/attendance', staff, asyncHandler(async (req, res) => { const d = await dashboard(await getSettings(), req.user.role); res.json({ asOf: d.asOf, kpis: { today: d.kpis.todayAttendance, week: d.kpis.weekAttendance, month: d.kpis.monthAttendance }, byWeekday: d.charts.attendanceByWeekday, daily: d.charts.attendanceDaily, peakHours: d.charts.peakHours }); }));
r.get('/revenue', authorize('admin'), asyncHandler(async (req, res) => { const d = await dashboard(await getSettings(), 'admin'); res.json({ asOf: d.asOf, monthRevenue: d.kpis.monthRevenue, annualRevenue: d.kpis.annualRevenue, outstanding: d.kpis.outstandingPayments, byMonth: d.charts.revenue }); }));
r.get('/membership', staff, asyncHandler(async (req, res) => { const d = await dashboard(await getSettings(), req.user.role); res.json({ asOf: d.asOf, distribution: d.charts.planDistribution, renewals: d.charts.renewals, registrations: d.charts.registrations, renewalsDue: d.renewalsDue, counts: { active: d.kpis.activeMemberships, expiring: d.kpis.expiringSoon, expired: d.kpis.expired } }); }));

r.get('/trainer', authorize('trainer'), asyncHandler(async (req, res) => {
  const s = await getSettings(); const states = await memberStates(s);
  const members = await Member.find({ trainer: req.user.trainerId, status: 'active' }).select('fullName memberCode fitnessGoal').lean();
  const ids = members.map((m) => m._id); const eng = await engagementReport(s, { trainerId: req.user.trainerId });
  const engMap = new Map(eng.items.map((e) => [String(e.memberId), e]));
  const [pendingWorkouts, pendingDiets, sessions] = await Promise.all([WorkoutPlan.countDocuments({ member: { $in: ids }, status: 'pending_review' }), DietPlan.countDocuments({ member: { $in: ids }, status: 'pending_review' }), PTSession.find({ trainer: req.user.trainerId, status: 'scheduled', start: { $gte: new Date() } }).populate('member', 'fullName').sort({ start: 1 }).limit(10).lean()]);
  const withPlan = new Set((await WorkoutPlan.find({ member: { $in: ids }, status: 'active' }).distinct('member')).map(String));
  res.json({ members: members.map((m) => ({ ...m, membership: states.get(String(m._id)) || null, engagement: engMap.get(String(m._id)) || null, hasActiveWorkoutPlan: withPlan.has(String(m._id)) })), pendingReviews: { workouts: pendingWorkouts, diets: pendingDiets }, upcomingSessions: sessions, lessActive: eng.items.filter((e) => ['inactive', 'declining'].includes(e.status)) });
}));

r.get('/me', authorize('member'), asyncHandler(async (req, res) => {
  const s = await getSettings(); const today = todayDate(s.timezone); const mid = req.user.memberId; const todayKey = toDayKey(new Date(), s.timezone);
  const monthStart = `${todayKey.slice(0, 7)}-01`;
  const [cur, outstanding, monthVisits, recent, wt, workout, diet, sessions, unread] = await Promise.all([
    currentMembership(mid), outstandingForMember(new mongoose.Types.ObjectId(mid)),
    Attendance.countDocuments({ member: mid, dayKey: { $gte: monthStart } }), Attendance.find({ member: mid, dayKey: { $gte: dayKeyOf(addDays(parseDateOnly(todayKey), -41)) } }).select('dayKey').lean(),
    HealthMetric.findOne({ member: mid, weightKg: { $exists: true } }).sort({ measuredAt: -1 }).lean(),
    WorkoutPlan.findOne({ member: mid, status: 'active' }).lean(), DietPlan.findOne({ member: mid, status: 'active' }).select('plan.targets plan.disclaimer createdAt').lean(),
    PTSession.find({ member: mid, status: 'scheduled', start: { $gte: new Date() } }).populate('trainer', 'fullName').sort({ start: 1 }).limit(5).lean(),
    Notification.countDocuments({ user: req.user.id, isRead: false }),
  ]);
  const days = new Set(recent.map((x) => x.dayKey)); let streak = 0;
  for (let i = 0; i < 42; i++) { if (days.has(dayKeyOf(addDays(parseDateOnly(todayKey), -i)))) streak++; else if (i > 0) break; }
  const m = await Member.findById(mid).select('consent targetWeightKg fitnessGoal').lean();
  res.json({ membership: cur ? decorate(cur, s, today) : null, outstanding, attendance: { thisMonth: monthVisits, currentStreakDays: streak }, latestWeight: wt ? { weightKg: wt.weightKg, bmi: wt.bmi, date: dayKeyOf(wt.measuredAt), source: wt.source } : null, workoutPlan: workout ? { id: workout._id, title: workout.plan.title, days: workout.plan.days.map((d) => ({ dayNumber: d.dayNumber, label: d.label, weekday: d.weekday })) } : null, dietPlan: diet ? { id: diet._id, targets: diet.plan.targets } : null, upcomingSessions: sessions, unreadNotifications: unread, healthConsent: !!m.consent?.healthData, targetWeightKg: m.targetWeightKg });
}));
export default r;
