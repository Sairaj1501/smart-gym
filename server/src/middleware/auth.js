import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User, Member, AuditLog } from '../models/index.js';
import { HttpError, asyncHandler } from '../utils/http.js';

export const signToken = (user) => jwt.sign({ sub: String(user._id), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const authenticate = asyncHandler(async (req, _res, next) => {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required', 'unauthenticated');
  let payload;
  try { payload = jwt.verify(h.slice(7), env.jwtSecret); } catch { throw new HttpError(401, 'Session expired or invalid. Please sign in again.', 'invalid_token'); }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new HttpError(401, 'Account is disabled or no longer exists', 'inactive_user');
  req.user = { id: String(user._id), role: user.role, name: user.name, memberId: user.memberId ? String(user.memberId) : null, trainerId: user.trainerId ? String(user.trainerId) : null };
  next();
});

export const authorize = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'You do not have permission to do this', 'forbidden'));

/**
 * Server-side object-level authorization. NEVER trust a memberId from the client.
 * health:true  -> receptionists are excluded (they have no need for health data).
 */
export async function assertMemberAccess(req, memberId, { health = false } = {}) {
  const { role, memberId: ownId, trainerId, id } = req.user;
  if (role === 'admin') {
    if (health) await AuditLog.create({ actor: id, actorRole: role, action: 'health.view', entity: 'Member', entityId: String(memberId), ip: req.ip });
    return;
  }
  if (role === 'staff' && !health) return;
  if (role === 'member' && ownId === String(memberId)) return;
  if (role === 'trainer' && trainerId && (await Member.exists({ _id: memberId, trainer: trainerId }))) return;
  throw new HttpError(403, 'You are not authorized to access this member\'s records', 'forbidden');
}

export const audit = (req, action, entity, entityId, meta) =>
  AuditLog.create({ actor: req.user?.id, actorRole: req.user?.role, action, entity, entityId: entityId ? String(entityId) : undefined, meta, ip: req.ip }).catch(() => {});
