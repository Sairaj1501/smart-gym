import { Notification, User, Member, Trainer } from '../models/index.js';

/** In-app only. Never claims email/SMS delivery. Duplicate dedupeKey for a user is silently ignored. */
export async function notify(userId, payload) {
  if (!userId) return null;
  try { return await Notification.create({ user: userId, ...payload }); } catch (e) { if (e.code === 11000) return null; throw e; }
}
export async function notifyMember(memberId, payload) {
  const m = await Member.findById(memberId).select('user').lean();
  return m ? notify(m.user, payload) : null;
}
export async function notifyTrainerOf(memberId, payload) {
  const m = await Member.findById(memberId).select('trainer').lean();
  if (!m?.trainer) return null;
  const t = await Trainer.findById(m.trainer).select('user').lean();
  return t ? notify(t.user, payload) : null;
}
export async function notifyRoles(roles, payload) {
  const users = await User.find({ role: { $in: roles }, isActive: true }).select('_id').lean();
  return Promise.all(users.map((u) => notify(u._id, payload)));
}
