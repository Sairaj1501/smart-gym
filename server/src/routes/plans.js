import { Router } from 'express';
import { z } from 'zod';
import { Member, WorkoutPlan, DietPlan, WorkoutLog, DietAdherence, HealthMetric } from '../models/index.js';
import { authorize, assertMemberAccess, audit } from '../middleware/auth.js';
import { asyncHandler, validate, HttpError, oid, dayKeySchema } from '../utils/http.js';
import { generateWorkoutPlan, suggestProgression, WorkoutInputError } from '../services/workoutEngine.js';
import { generateDietPlan, DietInputError } from '../services/dietEngine.js';
import { notifyMember, notifyTrainerOf, notifyRoles } from '../services/notify.js';
import { narrate } from '../services/coach.js';
import { getSettings } from '../services/settings.js';
import { ageFromDob, toDayKey } from '../utils/dates.js';

const reviewer = authorize('admin', 'trainer');

function makeRouter(Model, kind, label) {
  const r = Router();
  const target = async (req, bodyMemberId) => {
    const id = req.user.role === 'member' ? req.user.memberId : bodyMemberId;
    if (!id) throw new HttpError(400, 'memberId is required', 'validation_error');
    await assertMemberAccess(req, id, { health: true }); return id;
  };

  r.get('/', validate(z.object({ memberId: oid.optional(), status: z.enum(['pending_review', 'active', 'archived']).optional() }), 'query'), asyncHandler(async (req, res) => {
    if (req.user.role === 'staff') throw new HttpError(403, 'Not available for your role', 'forbidden');
    const f = {}; if (req.query.status) f.status = req.query.status;
    if (req.user.role === 'member') f.member = req.user.memberId;
    else if (req.query.memberId) { await assertMemberAccess(req, req.query.memberId, { health: true }); f.member = req.query.memberId; }
    else if (req.user.role === 'trainer') f.member = { $in: await Member.find({ trainer: req.user.trainerId }).distinct('_id') };
    res.json({ items: await Model.find(f).populate('member', 'fullName memberCode').sort({ createdAt: -1 }).limit(100).lean() });
  }));

  const save = async (req, res, { memberId, plan, inputs, source }) => {
    const prof = !!plan.requiresProfessionalReview;
    const status = req.user.role === 'member' || prof ? 'pending_review' : 'active';
    if (status === 'active') await Model.updateMany({ member: memberId, status: 'active' }, { status: 'archived' });
    const doc = await Model.create({ member: memberId, createdBy: req.user.id, source, status, plan, inputs, requiresProfessionalReview: prof, ...(status === 'active' && { reviewedBy: req.user.id, reviewedAt: new Date() }) });
    if (status === 'pending_review') await Promise.all([notifyTrainerOf(memberId, { category: kind, title: `${label} awaiting your review`, message: 'A generated plan needs trainer review before it becomes active.', link: `/${kind === 'workout' ? 'workouts' : 'diet'}` }), notifyRoles(['admin'], { category: kind, title: `${label} awaiting review`, message: 'A plan is pending review.', link: `/${kind === 'workout' ? 'workouts' : 'diet'}` })]);
    else await notifyMember(memberId, { category: kind, title: `New ${label.toLowerCase()} assigned`, message: 'Open it from the sidebar.' });
    await audit(req, `${kind}.generate`, label, doc._id);
    res.status(201).json({ plan: doc });
  };
  r.get('/:id', validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
    const d = await Model.findById(req.params.id).populate('member', 'fullName memberCode').lean(); if (!d) throw new HttpError(404, 'Plan not found', 'not_found');
    await assertMemberAccess(req, d.member._id, { health: true }); res.json({ plan: d });
  }));
  r.post('/', reviewer, validate(z.object({ memberId: oid, plan: z.object({ days: z.array(z.any()).min(1).max(14) }).passthrough() })), asyncHandler(async (req, res) => {
    await assertMemberAccess(req, req.body.memberId, { health: true });
    await save(req, res, { memberId: req.body.memberId, plan: { ...req.body.plan, requiresProfessionalReview: false }, inputs: {}, source: 'trainer' });
  }));
  r.put('/:id/review', reviewer, validate(z.object({ id: oid }), 'params'), validate(z.object({ action: z.enum(['approve', 'archive']), trainerNotes: z.string().max(1000).optional(), plan: z.object({ days: z.array(z.any()).min(1).max(14) }).passthrough().optional() })), asyncHandler(async (req, res) => {
    const d = await Model.findById(req.params.id); if (!d) throw new HttpError(404, 'Plan not found', 'not_found');
    await assertMemberAccess(req, d.member, { health: true });
    if (req.body.action === 'approve') { await Model.updateMany({ member: d.member, status: 'active', _id: { $ne: d._id } }, { status: 'archived' }); d.status = 'active'; } else d.status = 'archived';
    if (req.body.plan) { d.plan = { ...req.body.plan, disclaimer: d.plan?.disclaimer }; d.source = 'trainer'; d.markModified('plan'); }
    d.trainerNotes = req.body.trainerNotes; d.reviewedBy = req.user.id; d.reviewedAt = new Date(); await d.save();
    if (d.status === 'active') await notifyMember(d.member, { category: kind, title: `Your ${label.toLowerCase()} was ${req.body.plan ? 'updated' : 'approved'}`, message: req.body.trainerNotes || 'Open it from the sidebar.' });
    await audit(req, `${kind}.review`, label, d._id, { action: req.body.action }); res.json({ plan: d });
  }));
  return { r, target, save };
}

// ---------- Workouts ----------
const w = makeRouter(WorkoutPlan, 'workout', 'Workout plan');
export const workouts = w.r;
const wSchema = z.object({ memberId: oid.optional(), goal: z.enum(['strength', 'muscle_building', 'general_fitness', 'weight_management', 'cardio', 'flexibility']).default('general_fitness'), level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'), daysPerWeek: z.number().int().min(2).max(6).default(3), durationMin: z.number().int().min(20).max(120).default(45), equipment: z.enum(['bodyweight', 'dumbbells', 'gym']).default('gym'), limitations: z.string().trim().max(300).optional(), useAI: z.boolean().default(false) });
workouts.post('/generate', validate(wSchema), asyncHandler(async (req, res) => {
  const memberId = await w.target(req, req.body.memberId); const { useAI, memberId: _m, ...inputs } = req.body;
  let plan; try { plan = generateWorkoutPlan(inputs); } catch (e) { if (e instanceof WorkoutInputError) throw new HttpError(422, e.message, 'invalid_input'); throw e; }
  if (useAI) plan.coachNote = await narrate('workout plan', { goal: plan.goal, level: plan.level, daysPerWeek: plan.daysPerWeek, days: plan.days.map((d) => ({ label: d.label, exercises: d.exercises.map((e) => e.name) })) });
  await w.save(req, res, { memberId, plan, inputs, source: 'rule_engine' });
}));
const logSchema = z.object({ dayNumber: z.number().int().min(1).max(14), notes: z.string().max(500).optional(), exercises: z.array(z.object({ name: z.string().max(80), exerciseId: z.string().max(40).optional(), targetSets: z.number().int().min(0).max(20).optional(), targetRepsMax: z.number().int().min(0).max(100).optional(), setsDone: z.number().int().min(0).max(20), minReps: z.number().int().min(0).max(200).optional(), weightKg: z.number().min(0).max(600).optional(), discomfort: z.boolean().default(false) })).min(1).max(15) });
workouts.post('/:id/log', validate(z.object({ id: oid }), 'params'), validate(logSchema), asyncHandler(async (req, res) => {
  const plan = await WorkoutPlan.findById(req.params.id); if (!plan) throw new HttpError(404, 'Plan not found', 'not_found');
  await assertMemberAccess(req, plan.member, { health: true });
  if (plan.status !== 'active') throw new HttpError(409, 'Only an approved, active plan can be logged against', 'plan_not_active');
  if (!plan.plan.days.some((d) => d.dayNumber === req.body.dayNumber)) throw new HttpError(422, 'That day does not exist in this plan', 'invalid_day');
  const s = await getSettings(); const discomfort = req.body.exercises.filter((e) => e.discomfort).map((e) => e.name);
  const log = await WorkoutLog.create({ member: plan.member, workoutPlan: plan._id, dayNumber: req.body.dayNumber, dayKey: toDayKey(new Date(), s.timezone), exercises: req.body.exercises, notes: req.body.notes, hadDiscomfort: discomfort.length > 0 });
  if (discomfort.length) await notifyTrainerOf(plan.member, { category: 'workout', title: 'Member reported discomfort', message: `Discomfort reported during: ${discomfort.join(', ')}.`, link: `/members/${plan.member}` });
  const total = await WorkoutLog.countDocuments({ member: plan.member });
  if ([10, 25, 50, 100].includes(total)) await notifyMember(plan.member, { category: 'goal', title: `${total} workouts logged`, message: 'Nice consistency. Keep going.', dedupeKey: `goal:wk:${total}` });
  res.status(201).json({ log, safetyNote: discomfort.length ? 'You reported discomfort. Stop that exercise, do not push through pain, and speak to your trainer or a doctor.' : undefined });
}));
workouts.get('/member/:memberId/logs', validate(z.object({ memberId: oid }), 'params'), asyncHandler(async (req, res) => {
  await assertMemberAccess(req, req.params.memberId, { health: true });
  res.json({ items: await WorkoutLog.find({ member: req.params.memberId }).sort({ createdAt: -1 }).limit(100).lean() });
}));
workouts.get('/member/:memberId/progression', validate(z.object({ memberId: oid }), 'params'), asyncHandler(async (req, res) => {
  await assertMemberAccess(req, req.params.memberId, { health: true });
  const logs = await WorkoutLog.find({ member: req.params.memberId }).sort({ createdAt: 1 }).limit(300).lean();
  const by = new Map(); for (const l of logs) for (const e of l.exercises) { if (!by.has(e.name)) by.set(e.name, []); by.get(e.name).push({ setsDone: e.setsDone, targetSets: e.targetSets ?? e.setsDone, minReps: e.minReps ?? 0, targetRepsMax: e.targetRepsMax ?? 0, discomfort: e.discomfort }); }
  res.json({ items: [...by.entries()].map(([exercise, entries]) => ({ exercise, sessions: entries.length, ...suggestProgression(entries) })), note: 'Rule-based suggestions, not medical or coaching advice. Your trainer has the final say.' });
}));

// ---------- Diet ----------
const d = makeRouter(DietPlan, 'diet', 'Diet plan');
export const diets = d.r;
const dSchema = z.object({ memberId: oid.optional(), heightCm: z.number().optional(), weightKg: z.number().optional(), age: z.number().int().optional(), gender: z.enum(['male', 'female', 'other']).optional(), goal: z.enum(['general_fitness', 'weight_management', 'muscle_building', 'strength', 'consistency', 'maintain']).optional(), activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']).optional(), dietType: z.enum(['vegan', 'vegetarian', 'eggetarian', 'non_vegetarian']).default('vegetarian'), allergies: z.array(z.string().max(40)).max(15).default([]), intolerances: z.array(z.string().max(40)).max(15).default([]), dislikedFoods: z.array(z.string().max(40)).max(20).default([]), mealsPerDay: z.number().int().min(3).max(5).default(4), useAI: z.boolean().default(false) });
diets.post('/generate', validate(dSchema), asyncHandler(async (req, res) => {
  const memberId = await d.target(req, req.body.memberId); const m = await Member.findById(memberId).lean();
  const last = await HealthMetric.findOne({ member: memberId, weightKg: { $exists: true } }).sort({ measuredAt: -1 }).lean();
  const lastH = await HealthMetric.findOne({ member: memberId, heightCm: { $exists: true } }).sort({ measuredAt: -1 }).lean();
  const b = req.body;
  const inputs = { age: b.age ?? ageFromDob(m.dob), gender: b.gender ?? (['male', 'female'].includes(m.gender) ? m.gender : 'other'), heightCm: b.heightCm ?? lastH?.heightCm, weightKg: b.weightKg ?? last?.weightKg, goal: b.goal ?? m.fitnessGoal, activityLevel: b.activityLevel ?? m.activityLevel, dietType: b.dietType, allergies: b.allergies, intolerances: b.intolerances, dislikedFoods: b.dislikedFoods, mealsPerDay: b.mealsPerDay };
  if (!inputs.heightCm || !inputs.weightKg) throw new HttpError(422, 'Height and weight are needed. Enter them in the form or record them under Health & Progress.', 'missing_inputs');
  let plan; try { plan = generateDietPlan({ ...inputs, hasHealthConsiderations: !!m.healthConsiderations?.trim() }); } catch (e) { if (e instanceof DietInputError) throw new HttpError(422, e.message, e.code); throw e; }
  if (b.useAI) plan.coachNote = await narrate('diet plan', { targets: plan.targets, day1: plan.days[0].meals.map((x) => ({ slot: x.slot, items: x.items.map((i) => i.name) })), warnings: plan.warnings });
  await d.save(req, res, { memberId, plan, inputs, source: 'rule_engine' });
}));
diets.post('/:id/adherence', validate(z.object({ id: oid }), 'params'), validate(z.object({ dayKey: dayKeySchema.optional(), slot: z.string().max(40), followed: z.boolean() })), asyncHandler(async (req, res) => {
  const p = await DietPlan.findById(req.params.id); if (!p) throw new HttpError(404, 'Plan not found', 'not_found');
  await assertMemberAccess(req, p.member, { health: true });
  if (p.status !== 'active') throw new HttpError(409, 'Only the active plan can be tracked', 'plan_not_active');
  if (!p.plan.days[0].meals.some((x) => x.slot === req.body.slot)) throw new HttpError(422, 'Unknown meal slot', 'invalid_slot');
  const s = await getSettings(); const dayKey = req.body.dayKey || toDayKey(new Date(), s.timezone);
  if (dayKey > toDayKey(new Date(), s.timezone)) throw new HttpError(422, 'Cannot mark future meals', 'future_date');
  const rec = await DietAdherence.findOneAndUpdate({ dietPlan: p._id, dayKey, slot: req.body.slot }, { member: p.member, followed: req.body.followed }, { upsert: true, new: true, setDefaultsOnInsert: true });
  res.json({ adherence: rec });
}));
diets.get('/:id/adherence', validate(z.object({ id: oid }), 'params'), asyncHandler(async (req, res) => {
  const p = await DietPlan.findById(req.params.id); if (!p) throw new HttpError(404, 'Plan not found', 'not_found');
  await assertMemberAccess(req, p.member, { health: true });
  const items = await DietAdherence.find({ dietPlan: p._id }).sort({ dayKey: -1 }).lean();
  const perDay = p.plan.days[0].meals.length; const days = [...new Set(items.map((i) => i.dayKey))];
  const followed = items.filter((i) => i.followed).length;
  res.json({ items, summary: { daysTracked: days.length, mealsFollowed: followed, mealsLogged: items.length, percentFollowed: items.length ? Math.round((followed / (days.length * perDay)) * 100) : 0, note: 'Unlogged meals count as not followed.' } });
}));
