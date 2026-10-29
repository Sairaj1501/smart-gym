import { Plan, Membership, Member } from '../models/index.js';
import { HttpError } from '../utils/http.js';
import { computeEndDate, membershipStatus, renewalStart, parseDateOnly, todayDate, diffDays, dayKeyOf } from '../utils/dates.js';
import { getSettings } from './settings.js';

export const currentMembership = (memberId) => Membership.findOne({ member: memberId, status: 'active' }).sort({ endDate: -1 });

export function decorate(m, settings, today) {
  const o = m.toObject ? m.toObject() : m;
  return { ...o, state: membershipStatus(o, today, settings.expiryWarningDays), daysLeft: diffDays(o.endDate, today), outstanding: Math.max(0, round2(o.amountDue - o.amountPaid)) };
}
export const round2 = (n) => Math.round(n * 100) / 100;

async function loadPlan(planId) {
  const plan = await Plan.findById(planId);
  if (!plan) throw new HttpError(404, 'Membership plan not found', 'plan_not_found');
  if (!plan.isActive) throw new HttpError(422, 'This plan is no longer offered', 'plan_inactive');
  return plan;
}
function build({ member, plan, kind, start, discount = 0, previous, actorId }) {
  if (discount > plan.price) throw new HttpError(422, 'Discount cannot exceed the plan price', 'invalid_discount');
  return {
    member, plan: plan._id, kind, startDate: start, endDate: computeEndDate(start, plan.durationValue, plan.durationUnit),
    discount, amountDue: round2(plan.price - discount), previous, createdBy: actorId,
    planSnapshot: { name: plan.name, price: plan.price, durationValue: plan.durationValue, durationUnit: plan.durationUnit, includesPersonalTraining: plan.includesPersonalTraining },
  };
}

export async function assignMembership({ memberId, planId, startDate, discount = 0, actorId }) {
  const settings = await getSettings();
  const today = todayDate(settings.timezone);
  const plan = await loadPlan(planId);
  const cur = await currentMembership(memberId);
  if (cur && membershipStatus(cur, today) !== 'expired') throw new HttpError(409, 'Member already has a valid membership. Use renew or change plan.', 'membership_exists');
  const start = startDate ? parseDateOnly(startDate) : today;
  return Membership.create(build({ member: memberId, plan, kind: 'new', start, discount, previous: cur?._id, actorId }));
}

export async function renewMembership({ memberId, planId, discount = 0, actorId }) {
  const settings = await getSettings();
  const today = todayDate(settings.timezone);
  const cur = await currentMembership(memberId);
  if (!cur) throw new HttpError(404, 'No previous membership to renew. Assign a plan first.', 'no_membership');
  // Guard against a double click creating two back-to-back renewals.
  if (await Membership.exists({ member: memberId, kind: 'renewal', createdAt: { $gt: new Date(Date.now() - 10000) } })) throw new HttpError(409, 'A renewal was just recorded for this member', 'duplicate_renewal');
  const plan = await loadPlan(planId || cur.plan);
  const start = renewalStart(cur.endDate, today, settings.renewalPolicy);
  return Membership.create(build({ member: memberId, plan, kind: 'renewal', start, discount, previous: cur._id, actorId }));
}

/** Old record is kept (marked superseded). No proration: any unpaid balance on it stays owed. */
export async function changePlan({ memberId, planId, discount = 0, actorId }) {
  const settings = await getSettings();
  const today = todayDate(settings.timezone);
  const plan = await loadPlan(planId);
  const cur = await currentMembership(memberId);
  if (!cur) return assignMembership({ memberId, planId, discount, actorId });
  const created = await Membership.create(build({ member: memberId, plan, kind: 'plan_change', start: today, discount, previous: cur._id, actorId }));
  await Membership.updateOne({ _id: cur._id }, { status: 'superseded' });
  return created;
}

/** Map<memberId string, { state, endDate, membershipId }> using each member's latest valid membership. */
export async function memberStates(settings, today = todayDate(settings.timezone)) {
  const rows = await Membership.aggregate([
    { $match: { status: 'active' } }, { $sort: { endDate: -1 } },
    { $group: { _id: '$member', membershipId: { $first: '$_id' }, startDate: { $first: '$startDate' }, endDate: { $first: '$endDate' }, planName: { $first: '$planSnapshot.name' } } },
  ]);
  const map = new Map();
  for (const r of rows) map.set(String(r._id), { state: membershipStatus(r, today, settings.expiryWarningDays), endDate: r.endDate, membershipId: r.membershipId, planName: r.planName, daysLeft: diffDays(r.endDate, today) });
  return map;
}
export const activeMembers = (filter = {}) => Member.find({ status: 'active', ...filter });
export { dayKeyOf };
