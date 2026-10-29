import { Router } from 'express';
import { z } from 'zod';
import { Setting, AuditLog, Feedback, Member, Membership, Attendance, HealthMetric } from '../models/index.js';
import { authorize, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, paging, pageMeta } from '../utils/http.js';
import { getSettings } from '../services/settings.js';
import { chat } from '../services/coach.js';
import { currentMembership, decorate } from '../services/membershipService.js';
import { outstandingForMember } from '../services/paymentService.js';
import { notifyTrainerOf, notifyRoles } from '../services/notify.js';
import { todayDate } from '../utils/dates.js';
import { llmEnabled } from '../services/llm.js';
import mongoose from 'mongoose';

export const settings = Router();
settings.get('/', asyncHandler(async (req, res) => { const s = await getSettings(); res.json({ settings: req.user.role === 'admin' ? s : { gymName: s.gymName, expiryWarningDays: s.expiryWarningDays, demoData: s.demoData, timezone: s.timezone }, aiConfigured: llmEnabled() }); }));
settings.put('/', authorize('admin'), validate(z.object({ gymName: z.string().trim().min(2).max(60), timezone: z.string().max(50).refine((t) => { try { new Intl.DateTimeFormat('en', { timeZone: t }); return true; } catch { return false; } }, 'Unknown timezone'), expiryWarningDays: z.number().int().min(1).max(60), allowExpiredCheckIn: z.boolean(), renewalPolicy: z.enum(['extend', 'fromToday']), inactiveDays: z.number().int().min(3).max(60), declineRatio: z.number().min(0.1).max(0.9) }).partial()), asyncHandler(async (req, res) => {
  const s = await Setting.findOneAndUpdate({ key: 'gym' }, req.body, { new: true, upsert: true, runValidators: true }); await audit(req, 'settings.update', 'Setting', s._id, req.body); res.json({ settings: s });
}));

export const audits = Router();
audits.get('/', authorize('admin'), asyncHandler(async (req, res) => { const pg = paging(req.query); const [items, total] = await Promise.all([AuditLog.find({}).populate('actor', 'name').sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), AuditLog.countDocuments()]); res.json({ items, ...pageMeta(total, pg) }); }));

export const feedback = Router();
feedback.post('/', authorize('member'), validate(z.object({ category: z.enum(['service', 'facility', 'trainer', 'trainer_assistance', 'other']).default('service'), rating: z.number().int().min(1).max(5).optional(), message: z.string().trim().min(3).max(1000) })), asyncHandler(async (req, res) => {
  const f = await Feedback.create({ member: req.user.memberId, ...req.body });
  const m = await Member.findById(req.user.memberId).select('fullName');
  if (req.body.category === 'trainer_assistance') await Promise.all([notifyTrainerOf(req.user.memberId, { category: 'system', title: 'Trainer assistance requested', message: `${m.fullName}: ${req.body.message.slice(0, 120)}`, link: `/members/${req.user.memberId}` }), notifyRoles(['admin'], { category: 'system', title: 'Trainer assistance requested', message: `${m.fullName} asked for help.` })]);
  res.status(201).json({ feedback: f });
}));
feedback.get('/', authorize('admin'), asyncHandler(async (req, res) => res.json({ items: await Feedback.find({}).populate('member', 'fullName memberCode').sort({ createdAt: -1 }).limit(100).lean() })));

export const chatbot = Router();
chatbot.post('/', authorize('member'), validate(z.object({ message: z.string().trim().min(1).max(500), history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1000) })).max(10).default([]) })), asyncHandler(async (req, res) => {
  // Context contains ONLY the authenticated member's own data (taken from the token, never from the request body).
  const s = await getSettings(); const mid = req.user.memberId;
  const [cur, outstanding, wt] = await Promise.all([currentMembership(mid), outstandingForMember(new mongoose.Types.ObjectId(mid)), HealthMetric.findOne({ member: mid, weightKg: { $exists: true } }).sort({ measuredAt: -1 }).lean()]);
  const dm = cur ? decorate(cur, s, todayDate(s.timezone)) : null;
  const ctx = { name: req.user.name, membership: dm && { planName: dm.planSnapshot.name, endDate: dm.endDate.toISOString().slice(0, 10), daysLeft: dm.daysLeft, status: dm.state }, outstanding, latestWeightKg: wt?.weightKg, latestBmi: wt?.bmi };
  res.json(await chat({ message: req.body.message, history: req.body.history, ctx }));
}));
