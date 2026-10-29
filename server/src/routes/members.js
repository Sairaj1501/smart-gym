import { Router } from 'express';
import { z } from 'zod';
import { Member, User, Trainer, Membership, Payment, Attendance, HealthMetric, nextCode } from '../models/index.js';
import { authorize, assertMemberAccess, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid, dayKeySchema, paging, pageMeta, escapeRegex } from '../utils/http.js';
import { hashPassword, genTempPassword } from '../utils/password.js';
import { parseDateOnly, ageFromDob, todayDate, toDayKey, dayKeyOf, addDays } from '../utils/dates.js';
import { getSettings } from '../services/settings.js';
import { assignMembership, memberStates, decorate, currentMembership } from '../services/membershipService.js';
import { recordPayment, outstandingForMember } from '../services/paymentService.js';
import { notify } from '../services/notify.js';

const r = Router();
const GOALS = ['general_fitness', 'weight_management', 'muscle_building', 'strength', 'consistency', 'maintain'];
const LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const phone = z.string().trim().regex(/^\+?[\d\s-]{8,15}$/, 'Enter a valid phone number').transform((s) => s.replace(/[\s-]/g, ''));
const dob = dayKeySchema.refine((s) => { try { const a = ageFromDob(parseDateOnly(s)); return a >= 14 && a <= 100; } catch { return false; } }, 'Member must be between 14 and 100 years old');
const emergency = z.object({ name: z.string().trim().max(80).optional(), phone: z.string().trim().max(20).optional() });

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), phone, dob,
  gender: z.enum(['male', 'female', 'other', 'unspecified']).default('unspecified'), emergencyContact: emergency.optional(),
  fitnessGoal: z.enum(GOALS).optional(), activityLevel: z.enum(LEVELS).optional(), trainerId: oid.optional(),
  planId: oid.optional(), startDate: dayKeySchema.optional(), discount: z.number().min(0).default(0),
  healthConsent: z.boolean().default(false),
  initialPayment: z.object({ amount: z.number().positive(), method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other']) }).optional(),
  idempotencyKey: z.string().max(80).optional(),
}).refine((v) => !v.initialPayment || v.planId, { message: 'Choose a plan before recording a payment', path: ['planId'] });

r.post('/', authorize('admin', 'staff'), validate(createSchema), asyncHandler(async (req, res) => {
  const b = req.body; const settings = await getSettings();
  if (b.trainerId && !(await Trainer.exists({ _id: b.trainerId, employmentStatus: 'active' }))) throw new HttpError(422, 'Selected trainer is not available', 'trainer_unavailable');
  const temp = genTempPassword(); const made = {};
  try {
    made.user = await User.create({ name: b.fullName, email: b.email, role: 'member', passwordHash: await hashPassword(temp), mustChangePassword: true });
    made.member = await Member.create({
      memberCode: await nextCode('GYM'), user: made.user._id, fullName: b.fullName, email: b.email, phone: b.phone, dob: parseDateOnly(b.dob),
      gender: b.gender, joiningDate: todayDate(settings.timezone), emergencyContact: b.emergencyContact, trainer: b.trainerId,
      fitnessGoal: b.fitnessGoal, activityLevel: b.activityLevel,
      consent: b.healthConsent ? { healthData: true, recordedAt: new Date(), recordedBy: req.user.id } : undefined,
    });
    await User.updateOne({ _id: made.user._id }, { memberId: made.member._id });
    if (b.planId) made.membership = await assignMembership({ memberId: made.member._id, planId: b.planId, startDate: b.startDate, discount: b.discount, actorId: req.user.id });
    if (b.initialPayment) made.payment = (await recordPayment({ memberId: made.member._id, membershipId: made.membership._id, ...b.initialPayment, idempotencyKey: b.idempotencyKey, actorId: req.user.id })).payment;
  } catch (e) { // compensating cleanup so a half-created member never remains
    if (made.member) await Promise.all([Payment.deleteMany({ member: made.member._id }), Membership.deleteMany({ member: made.member._id }), Member.deleteOne({ _id: made.member._id })]);
    if (made.user) await User.deleteOne({ _id: made.user._id });
    throw e;
  }
  if (b.trainerId) { const t = await Trainer.findById(b.trainerId).select('user'); await notify(t.user, { category: 'system', title: 'New member assigned', message: `${b.fullName} was assigned to you.`, link: `/members/${made.member._id}` }); }
  await audit(req, 'member.create', 'Member', made.member._id);
  res.status(201).json({ member: made.member, membership: made.membership, payment: made.payment, tempPassword: temp, note: 'Share the temporary password securely. The member must change it at first sign-in. It is shown only once.' });
}));

const listSchema = z.object({ q: z.string().max(60).optional(), status: z.enum(['active', 'inactive']).optional(), membership: z.enum(['active', 'expiring', 'expired', 'none']).optional(), trainerId: oid.optional(), page: z.any().optional(), limit: z.any().optional() });
r.get('/', authorize('admin', 'staff', 'trainer'), validate(listSchema, 'query'), asyncHandler(async (req, res) => {
  const { q, status, membership, trainerId } = req.query; const settings = await getSettings(); const pg = paging(req.query);
  const filter = {};
  if (req.user.role === 'trainer') filter.trainer = req.user.trainerId; else if (trainerId) filter.trainer = trainerId;
  if (status) filter.status = status;
  if (q) { const rx = new RegExp(escapeRegex(q), 'i'); filter.$or = [{ fullName: rx }, { memberCode: rx }, { phone: rx }, { email: rx }]; }
  const states = await memberStates(settings);
  if (membership) {
    const ok = (s) => (membership === 'active' ? ['active', 'expiring'].includes(s.state) : s.state === membership);
    if (membership === 'none') filter._id = { $nin: [...states.keys()] };
    else filter._id = { $in: [...states.entries()].filter(([, s]) => ok(s)).map(([id]) => id) };
  }
  const sel = req.user.role === 'staff' ? '-healthConsiderations' : '';
  const [items, total] = await Promise.all([Member.find(filter).select(sel).populate('trainer', 'fullName').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), Member.countDocuments(filter)]);
  const dues = await Membership.aggregate([{ $match: { member: { $in: items.map((m) => m._id) }, status: { $ne: 'cancelled' } } }, { $group: { _id: '$member', due: { $sum: { $subtract: ['$amountDue', '$amountPaid'] } } } }]);
  const dueMap = new Map(dues.map((d) => [String(d._id), Math.max(0, Math.round(d.due * 100) / 100)]));
  res.json({ items: items.map((m) => ({ ...m, membership: states.get(String(m._id)) || null, outstanding: dueMap.get(String(m._id)) || 0 })), ...pageMeta(total, pg) });
}));

r.get('/:id', validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
  await assertMemberAccess(req, req.params.id);
  const settings = await getSettings(); const today = todayDate(settings.timezone);
  const m = await Member.findById(req.params.id).select(req.user.role === 'staff' ? '-healthConsiderations' : '').populate('trainer', 'fullName trainerCode').lean();
  if (!m) throw new HttpError(404, 'Member not found', 'not_found');
  const since = toDayKey(addDays(new Date(), -30), settings.timezone);
  const [cur, history, outstanding, visits, last] = await Promise.all([
    currentMembership(m._id), Membership.find({ member: m._id }).sort({ startDate: -1 }), outstandingForMember(m._id),
    Attendance.countDocuments({ member: m._id, dayKey: { $gte: since } }), Attendance.findOne({ member: m._id }).sort({ dayKey: -1 }).select('dayKey').lean(),
  ]);
  res.json({ member: m, currentMembership: cur ? decorate(cur, settings, today) : null, membershipHistory: history.map((h) => decorate(h, settings, today)), outstanding, attendanceLast30Days: visits, lastVisit: last?.dayKey || null });
}));

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), phone, dob, gender: z.enum(['male', 'female', 'other', 'unspecified']),
  emergencyContact: emergency, fitnessGoal: z.enum(GOALS), activityLevel: z.enum(LEVELS), trainerId: oid.nullable(),
  targetWeightKg: z.number().min(20).max(400).nullable(), healthConsiderations: z.string().trim().max(500), consentHealth: z.boolean(),
}).partial();
const ALLOWED = { admin: ['fullName', 'email', 'phone', 'dob', 'gender', 'emergencyContact', 'fitnessGoal', 'activityLevel', 'trainerId'], staff: ['fullName', 'email', 'phone', 'dob', 'gender', 'emergencyContact', 'fitnessGoal', 'activityLevel', 'trainerId'], member: ['phone', 'emergencyContact', 'fitnessGoal', 'activityLevel', 'targetWeightKg', 'healthConsiderations', 'consentHealth'] };
r.put('/:id', validate(z.object({ id: oid }), 'params'), validate(updateSchema), asyncHandler(async (req, res) => {
  const allowed = ALLOWED[req.user.role]; if (!allowed) throw new HttpError(403, 'You cannot edit member details', 'forbidden');
  await assertMemberAccess(req, req.params.id);
  const m = await Member.findById(req.params.id); if (!m) throw new HttpError(404, 'Member not found', 'not_found');
  const b = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const prevTrainer = String(m.trainer || '');
  if (b.trainerId !== undefined) {
    if (b.trainerId && !(await Trainer.exists({ _id: b.trainerId, employmentStatus: 'active' }))) throw new HttpError(422, 'Selected trainer is not available', 'trainer_unavailable');
    m.trainer = b.trainerId || undefined; delete b.trainerId;
  }
  if (b.dob) b.dob = parseDateOnly(b.dob);
  if (b.consentHealth !== undefined) { m.consent = { healthData: b.consentHealth, recordedAt: new Date(), recordedBy: req.user.id }; delete b.consentHealth; }
  if (b.email) await User.updateOne({ _id: m.user }, { email: b.email, name: b.fullName || m.fullName });
  m.set(b); await m.save();
  if (String(m.trainer || '') !== prevTrainer && m.trainer) { const t = await Trainer.findById(m.trainer).select('user'); await notify(t.user, { category: 'system', title: 'New member assigned', message: `${m.fullName} was assigned to you.`, link: `/members/${m._id}` }); }
  await audit(req, 'member.update', 'Member', m._id, { fields: Object.keys(req.body) });
  res.json({ member: m });
}));

async function setStatus(req, res, active) {
  const m = await Member.findByIdAndUpdate(req.params.id, { status: active ? 'active' : 'inactive' }, { new: true });
  if (!m) throw new HttpError(404, 'Member not found', 'not_found');
  await User.updateOne({ _id: m.user }, { isActive: active });
  await audit(req, active ? 'member.activate' : 'member.deactivate', 'Member', m._id);
  res.json({ member: m });
}
r.post('/:id/activate', authorize('admin'), validate(z.object({ id: oid }), 'params'), asyncHandler((req, res) => setStatus(req, res, true)));
// Soft delete: payment, membership and attendance history must survive.
r.delete('/:id', authorize('admin'), validate(z.object({ id: oid }), 'params'), asyncHandler((req, res) => setStatus(req, res, false)));

r.delete('/:id/health-data', validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
  if (!(req.user.role === 'admin' || (req.user.role === 'member' && req.user.memberId === req.params.id))) throw new HttpError(403, 'Only the member or an administrator can delete health records', 'forbidden');
  const d = await HealthMetric.deleteMany({ member: req.params.id });
  await audit(req, 'health.delete_all', 'Member', req.params.id, { deleted: d.deletedCount });
  res.json({ deleted: d.deletedCount });
}));
export default r;
