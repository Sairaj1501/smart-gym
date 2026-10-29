import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Attendance, Member } from '../models/index.js';
import { authorize, assertMemberAccess } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid, dayKeySchema, paging, pageMeta } from '../utils/http.js';
import { env } from '../config/env.js';
import { getSettings } from '../services/settings.js';
import { currentMembership } from '../services/membershipService.js';
import { engagementReport } from '../services/engagementService.js';
import { membershipStatus, todayDate, toDayKey, parseDateOnly, diffDays } from '../utils/dates.js';

const r = Router();

// Short-lived signed token a member can show as a QR code; staff scan/paste it to check them in.
r.get('/qr-token', authorize('member'), (req, res) => res.json({ token: jwt.sign({ mid: req.user.memberId, typ: 'checkin' }, env.jwtSecret, { expiresIn: '5m' }), expiresInSeconds: 300 }));

r.post('/check-in', authorize('admin', 'staff'), validate(z.object({ memberId: oid.optional(), token: z.string().max(600).optional() }).refine((v) => v.memberId || v.token, 'Provide a memberId or a QR token')), asyncHandler(async (req, res) => {
  let memberId = req.body.memberId, method = 'manual';
  if (req.body.token) {
    try { const p = jwt.verify(req.body.token, env.jwtSecret); if (p.typ !== 'checkin') throw new Error(); memberId = p.mid; method = 'qr'; }
    catch { throw new HttpError(400, 'QR code is invalid or expired. Ask the member to refresh it.', 'bad_qr'); }
  }
  const member = await Member.findById(memberId);
  if (!member || member.status !== 'active') throw new HttpError(404, 'Active member not found', 'not_found');
  const s = await getSettings(); const today = todayDate(s.timezone);
  const cur = await currentMembership(member._id);
  const state = cur ? membershipStatus(cur, today, s.expiryWarningDays) : 'none';
  if (!['active', 'expiring'].includes(state) && !s.allowExpiredCheckIn) throw new HttpError(403, state === 'none' ? 'No membership on file. Assign a plan first.' : `Membership is ${state}. Renew before check-in.`, 'membership_invalid', { state });
  const dayKey = toDayKey(new Date(), s.timezone);
  try {
    const rec = await Attendance.create({ member: member._id, dayKey, checkInAt: new Date(), method, membershipState: state, recordedBy: req.user.id });
    res.status(201).json({ attendance: rec, member: { fullName: member.fullName, memberCode: member.memberCode }, membershipState: state });
  } catch (e) {
    if (e.code === 11000) throw new HttpError(409, `${member.fullName} is already checked in today`, 'duplicate_checkin', { existing: await Attendance.findOne({ member: member._id, dayKey }) });
    throw e;
  }
}));

r.post('/check-out', authorize('admin', 'staff'), validate(z.object({ memberId: oid })), asyncHandler(async (req, res) => {
  const s = await getSettings();
  const rec = await Attendance.findOneAndUpdate({ member: req.body.memberId, dayKey: toDayKey(new Date(), s.timezone), checkOutAt: { $exists: false } }, { checkOutAt: new Date() }, { new: true });
  if (!rec) throw new HttpError(404, 'No open check-in found for today', 'not_found');
  res.json({ attendance: rec });
}));

const q = z.object({ from: dayKeySchema.optional(), to: dayKeySchema.optional(), memberId: oid.optional(), page: z.any().optional(), limit: z.any().optional() });
r.get('/', authorize('admin', 'staff', 'trainer'), validate(q, 'query'), asyncHandler(async (req, res) => {
  const s = await getSettings(); const pg = paging(req.query);
  const f = {};
  if (req.query.from || req.query.to) f.dayKey = { ...(req.query.from && { $gte: req.query.from }), ...(req.query.to && { $lte: req.query.to }) };
  else f.dayKey = toDayKey(new Date(), s.timezone); // default: today's list
  if (req.query.memberId) f.member = req.query.memberId;
  if (req.user.role === 'trainer') { const ids = await Member.find({ trainer: req.user.trainerId }).distinct('_id'); f.member = req.query.memberId ? (ids.map(String).includes(req.query.memberId) ? req.query.memberId : { $in: [] }) : { $in: ids }; }
  const [items, total] = await Promise.all([Attendance.find(f).populate('member', 'fullName memberCode').sort({ checkInAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), Attendance.countDocuments(f)]);
  res.json({ items, ...pageMeta(total, pg) });
}));

r.get('/engagement', authorize('admin', 'staff', 'trainer'), asyncHandler(async (req, res) => {
  res.json(await engagementReport(await getSettings(), req.user.role === 'trainer' ? { trainerId: req.user.trainerId } : {}));
}));

r.get('/member/:memberId', validate(z.object({ memberId: oid }), 'params'), validate(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), 'query'), asyncHandler(async (req, res) => {
  await assertMemberAccess(req, req.params.memberId);
  const s = await getSettings(); const todayKey = toDayKey(new Date(), s.timezone);
  const month = req.query.month || todayKey.slice(0, 7);
  const items = await Attendance.find({ member: req.params.memberId, dayKey: { $gte: `${month}-01`, $lte: `${month}-31` } }).sort({ dayKey: -1 }).lean();
  const first = parseDateOnly(`${month}-01`); const monthEnd = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const last = month === todayKey.slice(0, 7) ? parseDateOnly(todayKey) : monthEnd;
  const elapsed = Math.max(1, diffDays(last, first) + 1);
  // Percentage = distinct days attended / calendar days elapsed in the month (definition shown in the UI).
  res.json({ month, items, summary: { attendedDays: items.length, daysElapsed: elapsed, percentage: Math.round((items.length / elapsed) * 100) } });
}));
export default r;
