import { Router } from 'express';
import { z } from 'zod';
import { HealthMetric, Member, Attendance, WorkoutLog } from '../models/index.js';
import { assertMemberAccess, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid, dayKeySchema } from '../utils/http.js';
import { calcBmi, bmiBand, BMI_NOTE } from '../utils/bmi.js';
import { toDayKey, parseDateOnly, addDays, dayKeyOf, diffDays } from '../utils/dates.js';
import { getSettings } from '../services/settings.js';
import { notifyMember } from '../services/notify.js';
import { narrate } from '../services/coach.js';

export const metrics = Router();
export const progress = Router();
const num = (min, max) => z.number().min(min).max(max).optional();
const body = z.object({
  memberId: oid.optional(), measuredAt: dayKeySchema.optional(), weightKg: num(20, 400), heightCm: num(80, 250), bodyFatPct: num(2, 70),
  measurements: z.object({ chestCm: num(30, 250), waistCm: num(30, 250), hipsCm: num(30, 250), armCm: num(10, 100), thighCm: num(20, 150) }).optional(),
  source: z.enum(['self_reported', 'trainer_measured', 'device']).optional(), isAssessment: z.boolean().optional(), observation: z.string().trim().max(1000).optional(),
}).refine((v) => v.weightKg || v.heightCm || v.bodyFatPct || v.measurements, 'Enter at least one measurement');

async function resolveDate(req, key) {
  const s = await getSettings(); const today = toDayKey(new Date(), s.timezone);
  const k = key || today; if (k > today) throw new HttpError(422, 'Measurement date cannot be in the future', 'future_date');
  return parseDateOnly(k);
}
async function lastHeight(memberId) { return (await HealthMetric.findOne({ member: memberId, heightCm: { $exists: true } }).sort({ measuredAt: -1 }).select('heightCm').lean())?.heightCm; }
const present = (m) => ({ ...m, bmiBand: bmiBand(m.bmi) });

metrics.post('/', validate(body), asyncHandler(async (req, res) => {
  const b = req.body; const memberId = req.user.role === 'member' ? req.user.memberId : b.memberId;
  if (!memberId) throw new HttpError(400, 'memberId is required', 'validation_error');
  await assertMemberAccess(req, memberId, { health: true });
  const member = await Member.findById(memberId); if (!member) throw new HttpError(404, 'Member not found', 'not_found');
  if (!member.consent?.healthData) throw new HttpError(403, 'The member has not consented to health tracking yet. Consent is required before storing measurements.', 'consent_required');
  const isMember = req.user.role === 'member';
  const doc = { member: memberId, measuredAt: await resolveDate(req, b.measuredAt), weightKg: b.weightKg, heightCm: b.heightCm, bodyFatPct: b.bodyFatPct, measurements: b.measurements, recordedBy: req.user.id,
    source: isMember ? 'self_reported' : (b.source || 'trainer_measured'), isAssessment: !isMember && !!b.isAssessment, observation: isMember ? undefined : b.observation };
  const h = doc.heightCm || (doc.weightKg ? await lastHeight(memberId) : undefined);
  try { if (doc.weightKg && h) doc.bmi = calcBmi(doc.weightKg, h); } catch (e) { throw new HttpError(422, e.message, 'invalid_measurement'); }
  const rec = await HealthMetric.create(doc);
  if (doc.weightKg && member.targetWeightKg && Math.abs(doc.weightKg - member.targetWeightKg) <= 0.5) await notifyMember(memberId, { category: 'goal', title: 'Goal weight reached', message: `Your recorded weight is within 0.5 kg of your ${member.targetWeightKg} kg goal.`, dedupeKey: `goal:wt:${member.targetWeightKg}` });
  res.status(201).json({ metric: present(rec.toObject()), bmiNote: BMI_NOTE });
}));

metrics.get('/:memberId', validate(z.object({ memberId: oid }), 'params'), validate(z.object({ from: dayKeySchema.optional(), to: dayKeySchema.optional() }), 'query'), asyncHandler(async (req, res) => {
  await assertMemberAccess(req, req.params.memberId, { health: true });
  const f = { member: req.params.memberId };
  if (req.query.from || req.query.to) f.measuredAt = { ...(req.query.from && { $gte: parseDateOnly(req.query.from) }), ...(req.query.to && { $lte: parseDateOnly(req.query.to) }) };
  const items = await HealthMetric.find(f).sort({ measuredAt: -1, createdAt: -1 }).limit(500).lean();
  res.json({ items: items.map(present), bmiNote: BMI_NOTE, sourceNote: 'Each entry shows whether it was self-reported, measured by a trainer, or device-provided.' });
}));

metrics.put('/:id', validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
  const rec = await HealthMetric.findById(req.params.id); if (!rec) throw new HttpError(404, 'Record not found', 'not_found');
  await assertMemberAccess(req, rec.member, { health: true });
  const parsed = body.safeParse({ ...rec.toObject(), ...req.body, memberId: undefined, measuredAt: undefined }); // corrections: same validation as create
  if (!parsed.success) throw parsed.error;
  for (const k of ['weightKg', 'heightCm', 'bodyFatPct', 'measurements']) if (req.body[k] !== undefined) rec[k] = parsed.data[k];
  if (req.user.role !== 'member' && req.body.observation !== undefined) rec.observation = String(req.body.observation).slice(0, 1000);
  const h = rec.heightCm || (rec.weightKg ? await lastHeight(rec.member) : undefined);
  rec.bmi = rec.weightKg && h ? calcBmi(rec.weightKg, h) : undefined;
  await rec.save(); await audit(req, 'health.correct', 'HealthMetric', rec._id);
  res.json({ metric: present(rec.toObject()) });
}));
metrics.delete('/:id', validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
  const rec = await HealthMetric.findById(req.params.id); if (!rec) throw new HttpError(404, 'Record not found', 'not_found');
  await assertMemberAccess(req, rec.member, { health: true });
  await rec.deleteOne(); await audit(req, 'health.delete', 'HealthMetric', rec._id); res.json({ deleted: true });
}));

progress.get('/:memberId', validate(z.object({ memberId: oid }), 'params'), validate(z.object({ from: dayKeySchema.optional(), to: dayKeySchema.optional(), narrative: z.enum(['0', '1']).optional() }), 'query'), asyncHandler(async (req, res) => {
  await assertMemberAccess(req, req.params.memberId, { health: true });
  const member = await Member.findById(req.params.memberId).lean(); if (!member) throw new HttpError(404, 'Member not found', 'not_found');
  const s = await getSettings(); const todayKey = toDayKey(new Date(), s.timezone); const today = parseDateOnly(todayKey);
  const f = { member: member._id };
  if (req.query.from || req.query.to) f.measuredAt = { ...(req.query.from && { $gte: parseDateOnly(req.query.from) }), ...(req.query.to && { $lte: parseDateOnly(req.query.to) }) };
  const series = await HealthMetric.find(f).sort({ measuredAt: 1 }).lean();
  const w = series.filter((x) => x.weightKg);
  const first = w[0], latest = w[w.length - 1];
  let goal = null;
  if (member.targetWeightKg && first && latest) {
    const total = first.weightKg - member.targetWeightKg;
    goal = { targetWeightKg: member.targetWeightKg, startKg: first.weightKg, currentKg: latest.weightKg, percent: total === 0 ? 100 : Math.max(0, Math.min(100, Math.round(((first.weightKg - latest.weightKg) / total) * 100))) };
  }
  const weeks = Array.from({ length: 12 }, (_, i) => { const end = addDays(today, -7 * (11 - i)); return { start: dayKeyOf(addDays(end, -6)), end: dayKeyOf(end) }; });
  const [att, logs] = await Promise.all([Attendance.find({ member: member._id, dayKey: { $gte: weeks[0].start } }).select('dayKey').lean(), WorkoutLog.find({ member: member._id, dayKey: { $gte: weeks[0].start } }).select('dayKey').lean()]);
  const inWeek = (arr, w2) => arr.filter((a) => a.dayKey >= w2.start && a.dayKey <= w2.end).length;
  const out = {
    weight: w.map((x) => ({ date: dayKeyOf(x.measuredAt), weightKg: x.weightKg, bmi: x.bmi, source: x.source })),
    measurements: series.filter((x) => x.measurements && Object.keys(x.measurements).length).map((x) => ({ date: dayKeyOf(x.measuredAt), ...x.measurements })),
    bodyFat: series.filter((x) => x.bodyFatPct).map((x) => ({ date: dayKeyOf(x.measuredAt), bodyFatPct: x.bodyFatPct, source: x.source })),
    assessments: series.filter((x) => x.isAssessment).map((x) => ({ date: dayKeyOf(x.measuredAt), observation: x.observation, source: x.source })),
    comparison: first && latest && first !== latest ? { from: dayKeyOf(first.measuredAt), to: dayKeyOf(latest.measuredAt), weightChangeKg: Math.round((latest.weightKg - first.weightKg) * 10) / 10, daysBetween: diffDays(latest.measuredAt, first.measuredAt) } : null,
    goal, attendanceByWeek: weeks.map((w2) => ({ weekEnding: w2.end, visits: inWeek(att, w2) })), workoutsByWeek: weeks.map((w2) => ({ weekEnding: w2.end, workouts: inWeek(logs, w2) })),
    bmiNote: BMI_NOTE,
  };
  if (req.query.narrative === '1') out.narrative = await narrate('progress summary', { weight: out.weight.slice(-6), comparison: out.comparison, goal, attendanceByWeek: out.attendanceByWeek.slice(-4) });
  res.json(out);
}));
