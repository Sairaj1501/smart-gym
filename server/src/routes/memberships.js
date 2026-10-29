import { Router } from 'express';
import { z } from 'zod';
import { Plan, Membership, Member } from '../models/index.js';
import { authorize, assertMemberAccess, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid, dayKeySchema, paging, pageMeta } from '../utils/http.js';
import { getSettings } from '../services/settings.js';
import { assignMembership, renewMembership, changePlan, decorate } from '../services/membershipService.js';
import { notifyMember } from '../services/notify.js';
import { todayDate } from '../utils/dates.js';

export const plans = Router();
export const memberships = Router();

// Update schema has NO defaults: .partial() + .default() would silently reset omitted fields on PUT.
const planFields = z.object({
  name: z.string().trim().min(2).max(60), durationValue: z.number().int().min(1).max(60), durationUnit: z.enum(['months', 'days']),
  price: z.number().min(0).max(1000000), description: z.string().max(300), facilities: z.array(z.string().max(60)).max(15),
  includesPersonalTraining: z.boolean(), isActive: z.boolean(),
});
const planCreate = planFields.extend({ durationUnit: z.enum(['months', 'days']).default('months'), description: z.string().max(300).optional(), facilities: z.array(z.string().max(60)).max(15).default([]), includesPersonalTraining: z.boolean().default(false), isActive: z.boolean().default(true) });
const planUpdate = planFields.partial();
plans.get('/', asyncHandler(async (req, res) => {
  const all = req.user.role === 'admin' && req.query.all === '1';
  res.json({ items: await Plan.find(all ? {} : { isActive: true }).sort({ price: 1 }).lean() });
}));
plans.post('/', authorize('admin'), validate(planCreate), asyncHandler(async (req, res) => { const p = await Plan.create(req.body); await audit(req, 'plan.create', 'Plan', p._id); res.status(201).json({ plan: p }); }));
plans.put('/:id', authorize('admin'), validate(z.object({ id: oid }), 'params'), validate(planUpdate), asyncHandler(async (req, res) => {
  // Editing a plan never changes existing memberships: each membership stores its own price/duration snapshot.
  const p = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!p) throw new HttpError(404, 'Plan not found', 'not_found');
  await audit(req, 'plan.update', 'Plan', p._id, req.body); res.json({ plan: p });
}));

const staff = authorize('admin', 'staff');
const listQ = z.object({ state: z.enum(['active', 'expiring', 'expired', 'upcoming']).optional(), memberId: oid.optional(), page: z.any().optional(), limit: z.any().optional() });
memberships.get('/', staff, validate(listQ, 'query'), asyncHandler(async (req, res) => {
  const s = await getSettings(); const today = todayDate(s.timezone); const pg = paging(req.query);
  const f = { status: { $ne: 'cancelled' } }; if (req.query.memberId) f.member = req.query.memberId;
  const rows = await Membership.find(f).populate('member', 'fullName memberCode').sort({ endDate: 1 }).lean();
  const all = rows.map((m) => decorate(m, s, today)).filter((m) => !req.query.state || (req.query.state === 'active' ? m.state === 'active' || m.state === 'expiring' : m.state === req.query.state));
  res.json({ items: all.slice(pg.skip, pg.skip + pg.limit), ...pageMeta(all.length, pg) });
}));
memberships.get('/member/:memberId', validate(z.object({ memberId: oid }), 'params'), asyncHandler(async (req, res) => {
  await assertMemberAccess(req, req.params.memberId);
  const s = await getSettings(); const today = todayDate(s.timezone);
  res.json({ items: (await Membership.find({ member: req.params.memberId }).sort({ startDate: -1 })).map((m) => decorate(m, s, today)) });
}));

const assignSchema = z.object({ memberId: oid, planId: oid, startDate: dayKeySchema.optional(), discount: z.number().min(0).default(0) });
const after = async (req, res, m, verb) => {
  await audit(req, `membership.${verb}`, 'Membership', m._id, { member: m.member, plan: m.planSnapshot?.name });
  await notifyMember(m.member, { category: 'membership', title: `Membership ${verb}`, message: `${m.planSnapshot.name}: ${m.startDate.toISOString().slice(0, 10)} to ${m.endDate.toISOString().slice(0, 10)}.` });
  const s = await getSettings(); res.status(201).json({ membership: decorate(m, s, todayDate(s.timezone)) });
};
memberships.post('/', staff, validate(assignSchema), asyncHandler(async (req, res) => {
  if (!(await Member.exists({ _id: req.body.memberId, status: 'active' }))) throw new HttpError(404, 'Active member not found', 'not_found');
  await after(req, res, await assignMembership({ ...req.body, actorId: req.user.id }), 'assigned');
}));
memberships.post('/:id/renew', staff, validate(z.object({ id: oid }), 'params'), validate(z.object({ planId: oid.optional(), discount: z.number().min(0).default(0) })), asyncHandler(async (req, res) => {
  const old = await Membership.findById(req.params.id); if (!old) throw new HttpError(404, 'Membership not found', 'not_found');
  const latest = await Membership.findOne({ member: old.member, status: 'active' }).sort({ endDate: -1 });
  if (!latest || String(latest._id) !== String(old._id)) throw new HttpError(409, 'Only the member\'s latest membership can be renewed', 'not_latest');
  await after(req, res, await renewMembership({ memberId: old.member, planId: req.body.planId, discount: req.body.discount, actorId: req.user.id }), 'renewed');
}));
memberships.post('/member/:memberId/change-plan', staff, validate(z.object({ memberId: oid }), 'params'), validate(z.object({ planId: oid, discount: z.number().min(0).default(0) })), asyncHandler(async (req, res) =>
  after(req, res, await changePlan({ memberId: req.params.memberId, ...req.body, actorId: req.user.id }), 'plan changed')));
