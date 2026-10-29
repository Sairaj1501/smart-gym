import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { User } from '../models/index.js';
import { signToken, authenticate, authorize, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError } from '../utils/http.js';
import { hashPassword, verifyPassword, DUMMY_HASH, passwordSchema } from '../utils/password.js';
import { env } from '../config/env.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, skip: () => env.nodeEnv === 'test', message: { error: 'Too many attempts. Try again in a few minutes.', code: 'rate_limited' } });
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, memberId: u.memberId, trainerId: u.trainerId, mustChangePassword: u.mustChangePassword });

r.post('/login', limiter, validate(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) })), asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const ok = await verifyPassword(req.body.password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok || !user.isActive) throw new HttpError(401, 'Incorrect email or password', 'bad_credentials');
  user.lastLoginAt = new Date(); await user.save();
  res.json({ token: signToken(user), user: pub(user) });
}));

r.get('/me', authenticate, asyncHandler(async (req, res) => res.json({ user: pub(await User.findById(req.user.id)) })));

// Deliberately NOT public: an open register endpoint that accepts a role is a privilege-escalation hole.
// Members are created by staff (POST /api/members) and trainers by admin (POST /api/trainers).
r.post('/register', authenticate, authorize('admin'), validate(z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), password: passwordSchema, role: z.enum(['admin', 'staff']) })), asyncHandler(async (req, res) => {
  const u = await User.create({ name: req.body.name, email: req.body.email, role: req.body.role, passwordHash: await hashPassword(req.body.password) });
  await audit(req, 'user.create', 'User', u._id, { role: u.role });
  res.status(201).json({ user: pub(u) });
}));

r.post('/change-password', authenticate, validate(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema })), asyncHandler(async (req, res) => {
  const u = await User.findById(req.user.id).select('+passwordHash');
  if (!(await verifyPassword(req.body.currentPassword, u.passwordHash))) throw new HttpError(400, 'Current password is incorrect', 'bad_password');
  u.passwordHash = await hashPassword(req.body.newPassword); u.mustChangePassword = false; await u.save();
  res.json({ ok: true });
}));
export default r;
