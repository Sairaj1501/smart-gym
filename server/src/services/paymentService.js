import { Membership, Payment, nextCode } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import { round2 } from './membershipService.js';
import { notifyMember } from './notify.js';

export async function outstandingForMember(memberId) {
  const [r] = await Membership.aggregate([
    { $match: { member: memberId, status: { $ne: 'cancelled' } } },
    { $group: { _id: null, due: { $sum: '$amountDue' }, paid: { $sum: '$amountPaid' } } },
  ]);
  return r ? Math.max(0, round2(r.due - r.paid)) : 0;
}

/**
 * Overpayment-proof and duplicate-proof WITHOUT multi-document transactions (which need a Mongo replica set):
 *  1. idempotencyKey makes retries return the original payment.
 *  2. A guarded atomic $inc on the membership refuses any amount above the outstanding balance, even under concurrency.
 *  3. If the payment insert fails afterwards, the $inc is rolled back (compensating action).
 */
export async function recordPayment({ memberId, membershipId, amount, method, kind = 'membership', note, idempotencyKey, actorId, paidAt }) {
  amount = round2(amount);
  if (!(amount > 0)) throw new HttpError(422, 'Amount must be greater than zero', 'invalid_amount');
  if (idempotencyKey) {
    const existing = await Payment.findOne({ idempotencyKey });
    if (existing) return { payment: existing, duplicate: true };
  }
  let target = null;
  if (kind === 'membership') {
    const filter = { member: memberId, status: { $ne: 'cancelled' }, $expr: { $lt: ['$amountPaid', '$amountDue'] } };
    if (membershipId) filter._id = membershipId;
    const candidate = await Membership.findOne(filter).sort({ startDate: 1 });
    if (!candidate) throw new HttpError(422, 'This member has no outstanding membership balance', 'nothing_due');
    target = await Membership.findOneAndUpdate(
      { _id: candidate._id, $expr: { $lte: [{ $add: ['$amountPaid', amount] }, { $add: ['$amountDue', 0.001] }] } },
      { $inc: { amountPaid: amount } }, { new: true });
    if (!target) throw new HttpError(422, `Amount exceeds the outstanding balance of ${round2(candidate.amountDue - candidate.amountPaid)}`, 'overpayment');
  }
  try {
    const payment = await Payment.create({ receiptNo: await nextCode('RCPT'), member: memberId, membership: target?._id, kind, amount, method, note, idempotencyKey, recordedBy: actorId, paidAt: paidAt || new Date(), source: 'manual' });
    await notifyMember(memberId, { category: 'payment', title: 'Payment recorded', message: `A payment of ${amount} (${method}) was recorded. Receipt ${payment.receiptNo}.` });
    return { payment, duplicate: false, balance: target ? round2(target.amountDue - target.amountPaid) : undefined };
  } catch (e) {
    if (target) await Membership.updateOne({ _id: target._id }, { $inc: { amountPaid: -amount } });
    if (e.code === 11000 && idempotencyKey) {
      const existing = await Payment.findOne({ idempotencyKey });
      if (existing) return { payment: existing, duplicate: true };
    }
    throw e;
  }
}

export async function refundPayment(paymentId) {
  const p = await Payment.findOneAndUpdate({ _id: paymentId, status: 'paid' }, { status: 'refunded' }, { new: true });
  if (!p) throw new HttpError(409, 'Payment not found or already refunded', 'not_refundable');
  if (p.membership) await Membership.updateOne({ _id: p.membership }, { $inc: { amountPaid: -p.amount } });
  return p;
}
