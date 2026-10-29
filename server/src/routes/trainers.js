import { Router } from 'express';
import { z } from 'zod';
import { Trainer, User, Member, PTSession, nextCode } from '../models/index.js';
import { authorize, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid } from '../utils/http.js';
import { hashPassword, genTempPassword } from '../utils/password.js';
import { parseDateOnly, todayDate } from '../utils/dates.js';
import { getSettings } from '../services/settings.js';

const r = Router();
const phone = z.string().trim().regex(/^\+?[\d\s-]{8,15}$/, 'Enter a valid phone number').transform((s) => s.replace(/[\s-]/g, ''));
const avail = z.array(z.object({ day: z.number().int().min(0).max(6), from: z.string().regex(/^\d{2}:\d{2}$/), to: z.string().regex(/^\d{2}:\d{2}$/) })).max(14);
// Update schema has NO defaults: .partial() + .default() would silently wipe omitted fields (e.g. when only toggling status).
const fields = z.object({ fullName: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email(), phone, specialization: z.string().trim().max(80), experienceYears: z.number().int().min(0).max(60), certifications: z.array(z.string().trim().max(80)).max(10), availability: avail });
const createSchema = fields.extend({ specialization: z.string().trim().max(80).default('General fitness'), experienceYears: z.number().int().min(0).max(60).default(0), certifications: z.array(z.string().trim().max(80)).max(10).default([]), availability: avail.default([]) });
const updateSchema = fields.partial().extend({ employmentStatus: z.enum(['active', 'inactive']).optional() });

r.get('/', authorize('admin', 'staff'), asyncHandler(async (req, res) => {
  const s = await getSettings(); const monthStart = parseDateOnly(`${todayDate(s.timezone).toISOString().slice(0, 7)}-01`);
  const items = await Trainer.find(req.query.all === '1' ? {} : { employmentStatus: 'active' }).sort({ fullName: 1 }).lean();
  const out = await Promise.all(items.map(async (t) => ({ ...t,
    assignedMembers: await Member.countDocuments({ trainer: t._id, status: 'active' }),
    sessionsThisMonth: await PTSession.countDocuments({ trainer: t._id, status: { $ne: 'cancelled' }, start: { $gte: monthStart } }),
    upcomingSessions: await PTSession.countDocuments({ trainer: t._id, status: 'scheduled', start: { $gte: new Date() } }) })));
  res.json({ items: out });
}));

r.post('/', authorize('admin'), validate(createSchema), asyncHandler(async (req, res) => {
  const temp = genTempPassword(); let user, trainer;
  try {
    user = await User.create({ name: req.body.fullName, email: req.body.email, role: 'trainer', passwordHash: await hashPassword(temp), mustChangePassword: true });
    const { email, ...rest } = req.body;
    trainer = await Trainer.create({ ...rest, trainerCode: await nextCode('TRN'), user: user._id });
    await User.updateOne({ _id: user._id }, { trainerId: trainer._id });
  } catch (e) { if (user && !trainer) await User.deleteOne({ _id: user._id }); throw e; }
  await audit(req, 'trainer.create', 'Trainer', trainer._id);
  res.status(201).json({ trainer, tempPassword: temp, note: 'Share securely; shown only once.' });
}));

r.put('/:id', authorize('admin'), validate(z.object({ id: oid }), 'params'), validate(updateSchema), asyncHandler(async (req, res) => {
  const { email, ...rest } = req.body;
  const t = await Trainer.findByIdAndUpdate(req.params.id, rest, { new: true, runValidators: true });
  if (!t) throw new HttpError(404, 'Trainer not found', 'not_found');
  const upd = {}; if (email) upd.email = email; if (rest.fullName) upd.name = rest.fullName; if (rest.employmentStatus) upd.isActive = rest.employmentStatus === 'active';
  if (Object.keys(upd).length) await User.updateOne({ _id: t.user }, upd);
  await audit(req, 'trainer.update', 'Trainer', t._id, req.body);
  res.json({ trainer: t });
}));
export default r;
