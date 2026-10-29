import { Router } from 'express';
import { z } from 'zod';
import { PTSession, Member, Trainer } from '../models/index.js';
import { authorize, assertMemberAccess, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid, dayKeySchema } from '../utils/http.js';
import { getSettings } from '../services/settings.js';
import { currentMembership } from '../services/membershipService.js';
import { notifyMember, notify } from '../services/notify.js';
import { membershipStatus, todayDate } from '../utils/dates.js';

const r = Router();
r.get('/', validate(z.object({ from: dayKeySchema.optional(), to: dayKeySchema.optional(), status: z.enum(['scheduled', 'completed', 'cancelled']).optional() }), 'query'), asyncHandler(async (req, res) => {
  const f = {}; const { from, to, status } = req.query;
  if (from || to) f.start = { ...(from && { $gte: new Date(`${from}T00:00:00+05:30`) }), ...(to && { $lte: new Date(`${to}T23:59:59+05:30`) }) };
  if (status) f.status = status;
  if (req.user.role === 'member') f.member = req.user.memberId; else if (req.user.role === 'trainer') f.trainer = req.user.trainerId;
  res.json({ items: await PTSession.find(f).populate('member', 'fullName memberCode').populate('trainer', 'fullName').sort({ start: 1 }).limit(300).lean() });
}));

r.post('/', authorize('admin', 'staff', 'trainer'), validate(z.object({ memberId: oid, trainerId: oid.optional(), start: z.coerce.date(), durationMin: z.number().int().min(15).max(180).default(60), notes: z.string().max(300).optional() })), asyncHandler(async (req, res) => {
  const b = req.body; const trainerId = req.user.role === 'trainer' ? req.user.trainerId : b.trainerId;
  if (!trainerId) throw new HttpError(400, 'trainerId is required', 'validation_error');
  if (b.start <= new Date()) throw new HttpError(422, 'Session must start in the future', 'past_time');
  const [member, trainer] = await Promise.all([Member.findOne({ _id: b.memberId, status: 'active' }), Trainer.findOne({ _id: trainerId, employmentStatus: 'active' })]);
  if (!member) throw new HttpError(404, 'Active member not found', 'not_found'); if (!trainer) throw new HttpError(404, 'Active trainer not found', 'not_found');
  if (req.user.role === 'trainer' && String(member.trainer) !== req.user.trainerId) throw new HttpError(403, 'You can only schedule sessions for your assigned members', 'forbidden');
  const s = await getSettings(); const cur = await currentMembership(member._id);
  if (!cur || !['active', 'expiring'].includes(membershipStatus(cur, todayDate(s.timezone), s.expiryWarningDays))) throw new HttpError(422, 'Member has no valid membership', 'membership_invalid');
  if (!cur.planSnapshot?.includesPersonalTraining) throw new HttpError(422, 'The member\'s plan does not include personal training', 'pt_not_included');
  const end = new Date(b.start.getTime() + b.durationMin * 60000);
  const clash = (who) => PTSession.exists({ ...who, status: 'scheduled', start: { $lt: end }, end: { $gt: b.start } });
  if (await clash({ trainer: trainer._id })) throw new HttpError(409, 'The trainer already has a session that overlaps this time', 'trainer_clash');
  if (await clash({ member: member._id })) throw new HttpError(409, 'The member already has a session that overlaps this time', 'member_clash');
  const ps = await PTSession.create({ member: member._id, trainer: trainer._id, start: b.start, end, notes: b.notes, createdBy: req.user.id });
  await Promise.all([notifyMember(member._id, { category: 'session', title: 'Training session scheduled', message: `With ${trainer.fullName} on ${b.start.toISOString().slice(0, 16).replace('T', ' ')} UTC.` }), notify(trainer.user, { category: 'session', title: 'Session scheduled', message: `${member.fullName} on ${b.start.toISOString().slice(0, 16).replace('T', ' ')} UTC.` })]);
  await audit(req, 'session.create', 'PTSession', ps._id); res.status(201).json({ session: ps });
}));

async function load(req) {
  const ps = await PTSession.findById(req.params.id); if (!ps) throw new HttpError(404, 'Session not found', 'not_found');
  if (req.user.role === 'trainer' && String(ps.trainer) !== req.user.trainerId) throw new HttpError(403, 'Not your session', 'forbidden');
  if (req.user.role === 'member') await assertMemberAccess(req, ps.member);
  if (ps.status !== 'scheduled') throw new HttpError(409, `Session is already ${ps.status}`, 'not_scheduled');
  return ps;
}
r.put('/:id/complete', authorize('admin', 'trainer'), validate(z.object({ id: oid }), 'params'), validate(z.object({ notes: z.string().max(500).optional() })), asyncHandler(async (req, res) => {
  const ps = await load(req); if (ps.start > new Date()) throw new HttpError(422, 'Cannot complete a session that has not started', 'not_started');
  ps.status = 'completed'; if (req.body.notes) ps.notes = req.body.notes; await ps.save(); res.json({ session: ps });
}));
r.put('/:id/cancel', validate(z.object({ id: oid }), 'params'), validate(z.object({ reason: z.string().trim().max(200).optional() })), asyncHandler(async (req, res) => {
  const ps = await load(req); ps.status = 'cancelled'; ps.cancelReason = req.body.reason; await ps.save();
  const t = await Trainer.findById(ps.trainer).select('user');
  await Promise.all([notifyMember(ps.member, { category: 'session', title: 'Session cancelled', message: req.body.reason || 'Your session was cancelled.' }), notify(t.user, { category: 'session', title: 'Session cancelled', message: req.body.reason || 'A session was cancelled.' })]);
  res.json({ session: ps });
}));
export default r;
