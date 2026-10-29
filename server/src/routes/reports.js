import { Router } from 'express';
import { z } from 'zod';
import { Member, Membership, Attendance, Payment, Trainer, PTSession, HealthMetric } from '../models/index.js';
import { authorize } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, dayKeySchema, paging, pageMeta } from '../utils/http.js';
import { toCsv } from '../utils/csv.js';
import { dayKeyOf } from '../utils/dates.js';
import { getSettings } from '../services/settings.js';
import { memberStates } from '../services/membershipService.js';
import { todayDate } from '../utils/dates.js';

const r = Router();
const d = (x) => (x ? dayKeyOf(new Date(x)) : '');
const rng = (field, from, to, asDate) => (from || to ? { [field]: { ...(from && { $gte: asDate ? new Date(`${from}T00:00:00+05:30`) : from }), ...(to && { $lte: asDate ? new Date(`${to}T23:59:59+05:30`) : to }) } } : {});

// Each builder returns { columns, rows }. Permissions are enforced per report type below.
const BUILDERS = {
  members: async (q, s) => { const st = await memberStates(s); const rows = (await Member.find({}).populate('trainer', 'fullName').sort({ memberCode: 1 }).lean()).map((m) => ({ code: m.memberCode, name: m.fullName, phone: m.phone, email: m.email, joined: d(m.joiningDate), trainer: m.trainer?.fullName || '', status: m.status, membership: st.get(String(m._id))?.state || 'none', validUntil: d(st.get(String(m._id))?.endDate) })); return { columns: ['code:Member ID', 'name:Name', 'phone:Phone', 'email:Email', 'joined:Joined', 'trainer:Trainer', 'status:Account', 'membership:Membership', 'validUntil:Valid until'], rows }; },
  memberships: async (q, s) => { const t = todayDate(s.timezone); const rows = (await Membership.find({ ...rng('startDate', q.from, q.to, true) }).populate('member', 'fullName memberCode').sort({ startDate: -1 }).lean()).map((m) => ({ code: m.member?.memberCode, name: m.member?.fullName, plan: m.planSnapshot?.name, kind: m.kind, start: d(m.startDate), end: d(m.endDate), status: m.status, due: m.amountDue, paid: m.amountPaid, outstanding: Math.round((m.amountDue - m.amountPaid) * 100) / 100 })); return { columns: ['code:Member ID', 'name:Name', 'plan:Plan', 'kind:Type', 'start:Start', 'end:End', 'status:Record status', 'due:Amount due', 'paid:Paid', 'outstanding:Outstanding'], rows }; },
  renewals: async (q, s) => { const rows = (await Membership.find({ kind: 'renewal', ...rng('startDate', q.from, q.to, true) }).populate('member', 'fullName memberCode').sort({ startDate: -1 }).lean()).map((m) => ({ code: m.member?.memberCode, name: m.member?.fullName, plan: m.planSnapshot?.name, start: d(m.startDate), end: d(m.endDate), amount: m.amountDue })); return { columns: ['code:Member ID', 'name:Name', 'plan:Plan', 'start:New start', 'end:New end', 'amount:Amount due'], rows }; },
  attendance: async (q, s, user) => { const f = { ...rng('dayKey', q.from, q.to, false) }; if (user.role === 'trainer') f.member = { $in: await Member.find({ trainer: user.trainerId }).distinct('_id') }; const rows = (await Attendance.find(f).populate('member', 'fullName memberCode').sort({ dayKey: -1, checkInAt: -1 }).lean()).map((a) => ({ date: a.dayKey, code: a.member?.memberCode, name: a.member?.fullName, in: a.checkInAt?.toISOString(), out: a.checkOutAt?.toISOString() || '', method: a.method })); return { columns: ['date:Date', 'code:Member ID', 'name:Name', 'in:Check-in (UTC)', 'out:Check-out (UTC)', 'method:Method'], rows }; },
  payments: async (q) => { const rows = (await Payment.find({ ...rng('paidAt', q.from, q.to, true) }).populate('member', 'fullName memberCode').sort({ paidAt: -1 }).lean()).map((p) => ({ receipt: p.receiptNo, date: d(p.paidAt), code: p.member?.memberCode, name: p.member?.fullName, kind: p.kind, amount: p.amount, method: p.method, status: p.status, source: p.source })); return { columns: ['receipt:Receipt', 'date:Date', 'code:Member ID', 'name:Name', 'kind:Type', 'amount:Amount', 'method:Method', 'status:Status', 'source:Verification'], rows }; },
  pending: async () => { const rows = (await Membership.find({ status: { $ne: 'cancelled' }, $expr: { $lt: ['$amountPaid', '$amountDue'] } }).populate('member', 'fullName memberCode phone').lean()).map((m) => ({ code: m.member?.memberCode, name: m.member?.fullName, phone: m.member?.phone, plan: m.planSnapshot?.name, due: m.amountDue, paid: m.amountPaid, outstanding: Math.round((m.amountDue - m.amountPaid) * 100) / 100 })); return { columns: ['code:Member ID', 'name:Name', 'phone:Phone', 'plan:Plan', 'due:Amount due', 'paid:Paid', 'outstanding:Outstanding'], rows }; },
  revenue: async (q) => { const rows = await Payment.aggregate([{ $match: { status: 'paid', ...rng('paidAt', q.from, q.to, true) } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paidAt', timezone: 'Asia/Kolkata' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]); return { columns: ['month:Month', 'total:Revenue', 'count:Payments'], rows: rows.map((x) => ({ month: x._id, total: x.total, count: x.count })) }; },
  trainers: async () => { const ts = await Trainer.find({}).lean(); const rows = await Promise.all(ts.map(async (t) => ({ code: t.trainerCode, name: t.fullName, specialization: t.specialization, status: t.employmentStatus, members: await Member.countDocuments({ trainer: t._id, status: 'active' }) }))); return { columns: ['code:Trainer ID', 'name:Name', 'specialization:Specialization', 'status:Status', 'members:Assigned members'], rows }; },
  sessions: async (q) => { const rows = (await PTSession.find({ ...rng('start', q.from, q.to, true) }).populate('member', 'fullName memberCode').populate('trainer', 'fullName').sort({ start: -1 }).lean()).map((x) => ({ start: x.start.toISOString(), mins: Math.round((x.end - x.start) / 60000), member: x.member?.fullName, trainer: x.trainer?.fullName, status: x.status })); return { columns: ['start:Start (UTC)', 'mins:Minutes', 'member:Member', 'trainer:Trainer', 'status:Status'], rows }; },
  'fitness-progress': async (q, s, user) => { const f = user.role === 'trainer' ? { trainer: user.trainerId } : {}; const ms = await Member.find({ ...f, 'consent.healthData': true }).select('fullName memberCode').lean(); const rows = (await Promise.all(ms.map(async (m) => { const w = await HealthMetric.find({ member: m._id, weightKg: { $exists: true } }).sort({ measuredAt: 1 }).lean(); if (!w.length) return null; return { code: m.memberCode, name: m.fullName, first: d(w[0].measuredAt), startKg: w[0].weightKg, latest: d(w[w.length - 1].measuredAt), latestKg: w[w.length - 1].weightKg, changeKg: Math.round((w[w.length - 1].weightKg - w[0].weightKg) * 10) / 10, entries: w.length }; }))).filter(Boolean); return { columns: ['code:Member ID', 'name:Name', 'first:First entry', 'startKg:Start kg', 'latest:Latest entry', 'latestKg:Latest kg', 'changeKg:Change kg', 'entries:Entries'], rows }; },
};
const ACCESS = { admin: Object.keys(BUILDERS), staff: ['members', 'memberships', 'renewals', 'attendance', 'payments', 'pending'], trainer: ['attendance', 'fitness-progress'] };

r.get('/:type', authorize('admin', 'staff', 'trainer'), validate(z.object({ from: dayKeySchema.optional(), to: dayKeySchema.optional(), format: z.enum(['json', 'csv']).default('json'), sort: z.string().max(30).optional(), dir: z.enum(['asc', 'desc']).default('asc'), page: z.any().optional(), limit: z.any().optional() }), 'query'), asyncHandler(async (req, res) => {
  const { type } = req.params; const b = BUILDERS[type];
  if (!b) throw new HttpError(404, 'Unknown report', 'not_found');
  if (!ACCESS[req.user.role].includes(type)) throw new HttpError(403, 'You do not have access to this report', 'forbidden');
  const s = await getSettings(); const out = await b(req.query, s, req.user);
  const cols = out.columns.map((c) => { const [key, label] = c.split(':'); return { key, label }; });
  let rows = out.rows;
  if (req.query.sort && cols.some((c) => c.key === req.query.sort)) { const k = req.query.sort; const m = req.query.dir === 'desc' ? -1 : 1; rows = [...rows].sort((a, c) => (a[k] > c[k] ? 1 : a[k] < c[k] ? -1 : 0) * m); }
  if (req.query.format === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.csv"`); return res.send('\uFEFF' + toCsv(cols, rows)); }
  const pg = paging(req.query);
  res.json({ type, columns: cols, items: rows.slice(pg.skip, pg.skip + pg.limit), ...pageMeta(rows.length, pg) });
}));
export default r;
