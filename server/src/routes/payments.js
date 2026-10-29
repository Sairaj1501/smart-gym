import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Payment, Member, Membership } from '../models/index.js';
import { authorize, assertMemberAccess, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid, dayKeySchema, paging, pageMeta } from '../utils/http.js';
import { recordPayment, refundPayment, outstandingForMember } from '../services/paymentService.js';
import { getSettings } from '../services/settings.js';
import { toDayKey } from '../utils/dates.js';

const r = Router();
const staff = authorize('admin', 'staff');
const range = (tz, from, to) => ({ $gte: new Date(`${from}T00:00:00+05:30`), $lte: new Date(`${to}T23:59:59.999+05:30`) });

r.get('/', staff, validate(z.object({ from: dayKeySchema.optional(), to: dayKeySchema.optional(), memberId: oid.optional(), method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other']).optional(), status: z.enum(['paid', 'refunded']).optional(), page: z.any().optional(), limit: z.any().optional() }), 'query'), asyncHandler(async (req, res) => {
  const pg = paging(req.query); const f = {};
  const { from, to, memberId, method, status } = req.query;
  if (from || to) f.paidAt = range(null, from || '1970-01-01', to || '2999-12-31');
  if (memberId) f.member = memberId; if (method) f.method = method; if (status) f.status = status;
  const [items, total] = await Promise.all([Payment.find(f).populate('member', 'fullName memberCode').populate('recordedBy', 'name').sort({ paidAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), Payment.countDocuments(f)]);
  res.json({ items, ...pageMeta(total, pg) });
}));

r.post('/', staff, validate(z.object({
  memberId: oid, membershipId: oid.optional(), amount: z.number().positive().max(1000000), method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other']),
  kind: z.enum(['membership', 'personal_training', 'other']).default('membership'), note: z.string().max(200).optional(), idempotencyKey: z.string().min(8).max(80).optional(),
})), asyncHandler(async (req, res) => {
  if (!(await Member.exists({ _id: req.body.memberId }))) throw new HttpError(404, 'Member not found', 'not_found');
  const out = await recordPayment({ ...req.body, actorId: req.user.id });
  await audit(req, 'payment.record', 'Payment', out.payment._id, { amount: out.payment.amount });
  res.status(out.duplicate ? 200 : 201).json({ payment: out.payment, duplicate: out.duplicate, balance: out.balance, outstanding: await outstandingForMember(out.payment.member) });
}));

r.get('/daily-summary', staff, validate(z.object({ date: dayKeySchema.optional() }), 'query'), asyncHandler(async (req, res) => {
  const s = await getSettings(); const d = req.query.date || toDayKey(new Date(), s.timezone);
  const rows = await Payment.aggregate([{ $match: { status: 'paid', paidAt: range(null, d, d) } }, { $group: { _id: '$method', total: { $sum: '$amount' }, count: { $sum: 1 } } }]);
  res.json({ date: d, byMethod: rows.map((x) => ({ method: x._id, total: x.total, count: x.count })), total: rows.reduce((a, x) => a + x.total, 0) });
}));

r.get('/member/:memberId', validate(z.object({ memberId: oid }), 'params'), asyncHandler(async (req, res) => {
  await assertMemberAccess(req, req.params.memberId);
  res.json({ items: await Payment.find({ member: req.params.memberId }).sort({ paidAt: -1 }).lean(), outstanding: await outstandingForMember(new mongoose.Types.ObjectId(req.params.memberId)) });
}));

r.get('/:id/receipt', validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
  const p = await Payment.findById(req.params.id).populate('member', 'fullName memberCode phone').populate('recordedBy', 'name').populate('membership', 'planSnapshot startDate endDate amountDue amountPaid').lean();
  if (!p) throw new HttpError(404, 'Payment not found', 'not_found');
  await assertMemberAccess(req, p.member._id);
  const s = await getSettings();
  res.json({ receipt: { gymName: s.gymName, receiptNo: p.receiptNo, date: p.paidAt, member: p.member, amount: p.amount, method: p.method, status: p.status, kind: p.kind, plan: p.membership?.planSnapshot?.name, validity: p.membership ? { from: p.membership.startDate, to: p.membership.endDate } : undefined, balanceAfter: p.membership ? Math.max(0, Math.round((p.membership.amountDue - p.membership.amountPaid) * 100) / 100) : undefined, recordedBy: p.recordedBy?.name, verification: p.source === 'manual' ? 'Manually recorded by staff (not verified by a payment gateway)' : 'Verified by payment gateway' } });
}));

r.post('/:id/refund', authorize('admin'), validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
  const p = await refundPayment(req.params.id); await audit(req, 'payment.refund', 'Payment', p._id, { amount: p.amount }); res.json({ payment: p });
}));
export default r;
