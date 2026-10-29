// Demo data ONLY. Everything created here is flagged isDemo and Settings.demoData=true (the UI shows a banner).
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { User, Member, Trainer, Plan, Membership, Attendance, Payment, HealthMetric, WorkoutPlan, DietPlan, WorkoutLog, PTSession, Setting, nextCode } from './models/index.js';
import { hashPassword } from './utils/password.js';
import { addDays, computeEndDate, dayKeyOf, todayDate, parseDateOnly } from './utils/dates.js';
import { calcBmi } from './utils/bmi.js';
import { generateWorkoutPlan } from './services/workoutEngine.js';
import { generateDietPlan } from './services/dietEngine.js';
import { runReminders } from './services/reminders.js';

if (env.nodeEnv === 'production' && !process.argv.includes('--force')) { console.error('Refusing to seed in production. Pass --force if you really mean it.'); process.exit(1); }
let seed = 42; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)]; const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));

await mongoose.connect(env.mongoUri);
console.log('Resetting database:', mongoose.connection.name);
await mongoose.connection.dropDatabase();
await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

const today = todayDate('Asia/Kolkata');
await Setting.create({ key: 'gym', gymName: 'Smart Gym (Demo)', demoData: true });
const mkUser = async (name, email, role, pw, extra = {}) => User.create({ name, email, role, passwordHash: await hashPassword(pw), isDemo: true, ...extra });
await mkUser('Demo Owner', 'admin@smartgym.demo', 'admin', 'Admin@123');
await mkUser('Demo Receptionist', 'staff@smartgym.demo', 'staff', 'Staff@123');

const trainers = [];
for (const [i, [name, spec]] of [['Rohit Kale', 'Strength & muscle building'], ['Neha Joshi', 'Weight management & cardio'], ['Amit Pawar', 'Functional fitness']].entries()) {
  const u = await mkUser(name, `trainer${i + 1}@smartgym.demo`, 'trainer', 'Trainer@123');
  const t = await Trainer.create({ trainerCode: await nextCode('TRN'), user: u._id, fullName: name, phone: `98000000${10 + i}`, specialization: spec, experienceYears: 3 + i * 2, certifications: [], availability: [1, 2, 3, 4, 5, 6].map((day) => ({ day, from: '06:00', to: '12:00' })), isDemo: true });
  await User.updateOne({ _id: u._id }, { trainerId: t._id }); trainers.push(t);
}
const plans = await Plan.insertMany([
  { name: 'Monthly', durationValue: 1, price: 1500, description: 'Gym floor access', facilities: ['Gym floor', 'Lockers'] },
  { name: 'Quarterly', durationValue: 3, price: 4000, description: 'Save over monthly', facilities: ['Gym floor', 'Lockers'] },
  { name: 'Half-Yearly', durationValue: 6, price: 7500, facilities: ['Gym floor', 'Lockers', 'Group classes'] },
  { name: 'Annual', durationValue: 12, price: 13000, facilities: ['Gym floor', 'Lockers', 'Group classes'] },
  { name: 'Student Monthly', durationValue: 1, price: 1000, description: 'With valid student ID', facilities: ['Gym floor'] },
  { name: 'Personal Training Monthly', durationValue: 1, price: 5000, includesPersonalTraining: true, facilities: ['Gym floor', '12 PT sessions'] },
]);
const snap = (p) => ({ name: p.name, price: p.price, durationValue: p.durationValue, durationUnit: p.durationUnit, includesPersonalTraining: p.includesPersonalTraining });

const names = ['Aarav Patil', 'Sneha Deshmukh', 'Vikram More', 'Pooja Shinde', 'Rahul Jadhav', 'Anjali Kulkarni', 'Siddharth Gaikwad', 'Priya Bhosale', 'Karan Thakur', 'Meera Pawar', 'Omkar Salunke', 'Divya Chavan', 'Harsh Wagh', 'Tanvi Nikam', 'Yash Dalvi', 'Isha Sonawane', 'Nikhil Kadam', 'Ritu Mahajan', 'Aditya Joshi', 'Kavya Naik', 'Pranav Bhoir', 'Shreya Ghodke', 'Varun Kale', 'Nisha Raut', 'Sahil Mane', 'Riya Jagtap', 'Tejas Borse', 'Aditi Ahire', 'Mayur Gawande', 'Komal Pagar', 'Jay Hire', 'Sakshi Kolhe', 'Dhruv Bhamare', 'Janhavi Khairnar', 'Atharv Shirsath', 'Mrunal Aher'];
const patterns = ['inactive', 'declining', 'regular', 'regular', 'moderate', 'regular', 'light', 'declining', 'moderate', 'regular'];
const members = [];
for (const [i, name] of names.entries()) {
  const email = `member${i + 1}@smartgym.demo`; const pattern = i < 3 ? ['inactive', 'declining', 'regular'][i] : pick(patterns);
  const u = await mkUser(name, email, 'member', 'Member@123');
  const joined = addDays(today, -between(50, 200));
  const m = await Member.create({ memberCode: await nextCode('GYM'), user: u._id, fullName: name, email, phone: `97${String(10000000 + i * 7919).slice(0, 8)}`, dob: new Date(Date.UTC(between(1988, 2005), between(0, 11), between(1, 28))), gender: i % 2 ? 'female' : 'male', joiningDate: joined, trainer: pick(trainers)._id, fitnessGoal: pick(['general_fitness', 'weight_management', 'muscle_building', 'strength']), activityLevel: pick(['light', 'moderate']), consent: { healthData: i % 3 !== 2, recordedAt: new Date() }, targetWeightKg: 60 + (i % 5) * 4, isDemo: true });
  await User.updateOne({ _id: u._id }, { memberId: m._id });
  // membership history: first plan from joining date, then renewals; ~15% left expired, a few expiring soon
  let start = joined; const hist = []; const wantExpired = i % 7 === 3; const wantExpiring = i % 7 === 5;
  while (true) {
    const plan = i % 6 === 0 ? plans[5] : pick(plans.slice(0, 5));
    const end = computeEndDate(start, plan.durationValue, plan.durationUnit);
    hist.push({ plan, start, end }); start = addDays(end, 1);
    if (start > today) break;
    if (wantExpired && hist.length >= 1 && end < addDays(today, -3)) break;
  }
  if (wantExpiring) { const last = hist[hist.length - 1]; const shift = Math.round((last.end - addDays(today, 4)) / 86400000); last.start = addDays(last.start, -shift); last.end = addDays(last.end, -shift); }
  let prev;
  for (const [k, h] of hist.entries()) {
    const latest = k === hist.length - 1; const due = h.plan.price; const unpaid = latest && i % 9 === 4; const partial = latest && i % 11 === 6;
    const paid = unpaid ? 0 : partial ? Math.round(due / 2) : due;
    const ms = await Membership.create({ member: m._id, plan: h.plan._id, planSnapshot: snap(h.plan), kind: k ? 'renewal' : 'new', startDate: h.start, endDate: h.end, amountDue: due, amountPaid: paid, previous: prev });
    prev = ms._id;
    if (paid > 0) await Payment.create({ receiptNo: await nextCode('RCPT'), member: m._id, membership: ms._id, amount: paid, method: pick(['cash', 'upi', 'upi', 'card']), paidAt: new Date(h.start.getTime() + 36e5 * 10), source: 'manual' });
  }
  // attendance generated only inside membership validity
  const days = new Set(); const first = parseDateOnly(dayKeyOf(joined)); const lastEnd = hist[hist.length - 1].end;
  for (let d = addDays(today, -90); d <= today; d = addDays(d, 1)) {
    if (d < first || d > lastEnd) continue; const age = Math.round((today - d) / 86400000); let p;
    if (pattern === 'regular') p = 0.62; else if (pattern === 'moderate') p = 0.4; else if (pattern === 'light') p = 0.2;
    else if (pattern === 'declining') p = age > 21 ? 0.6 : 0.1; else p = age > 12 ? 0.55 : 0;
    if (d.getUTCDay() === 0) p *= 0.4; if (rnd() < p) days.add(dayKeyOf(d));
  }
  if (days.size) await Attendance.insertMany([...days].map((k) => ({ member: m._id, dayKey: k, checkInAt: new Date(`${k}T${String(pick([6, 7, 8, 18, 19, 20])).padStart(2, '0')}:${String(between(0, 59)).padStart(2, '0')}:00+05:30`), method: 'manual' })));
  if (m.consent.healthData) {
    const h = between(155, 185); let w = between(55, 95); const rows = [];
    for (let wk = 8; wk >= 0; wk--) { w = Math.round((w + (rnd() - 0.55) * 0.9) * 10) / 10; rows.push({ member: m._id, measuredAt: addDays(today, -wk * 7), weightKg: w, heightCm: h, bmi: calcBmi(w, h), source: wk % 4 === 0 ? 'trainer_measured' : 'self_reported' }); }
    await HealthMetric.insertMany(rows);
  }
  members.push(m);
}
// plans
for (const m of members.slice(0, 10)) {
  const wp = generateWorkoutPlan({ goal: m.fitnessGoal === 'weight_management' ? 'weight_management' : m.fitnessGoal === 'muscle_building' ? 'muscle_building' : m.fitnessGoal === 'strength' ? 'strength' : 'general_fitness', level: pick(['beginner', 'intermediate']), daysPerWeek: pick([3, 4]), durationMin: 60, equipment: 'gym' });
  const wdoc = await WorkoutPlan.create({ member: m._id, plan: wp, inputs: {}, status: m._id === members[8]._id ? 'pending_review' : 'active', source: 'rule_engine' });
  if (wdoc.status === 'active' && m.consent.healthData) await WorkoutLog.create({ member: m._id, workoutPlan: wdoc._id, dayNumber: 1, dayKey: dayKeyOf(addDays(today, -2)), exercises: wp.days[0].exercises.slice(0, 3).map((e) => ({ name: e.name, exerciseId: e.exerciseId, targetSets: e.sets, targetRepsMax: 12, setsDone: e.sets, minReps: 12 })) });
}
for (const [i, m] of members.slice(0, 5).entries()) {
  const last = await HealthMetric.findOne({ member: m._id }).sort({ measuredAt: -1 });
  if (!last) continue;
  const dp = generateDietPlan({ age: 25 + i, gender: i % 2 ? 'female' : 'male', heightCm: last.heightCm, weightKg: last.weightKg, goal: m.fitnessGoal, activityLevel: m.activityLevel, dietType: pick(['vegetarian', 'non_vegetarian', 'vegan']), allergies: i === 1 ? ['peanuts'] : [], mealsPerDay: 4 });
  await DietPlan.create({ member: m._id, plan: dp, inputs: {}, status: 'active', source: 'rule_engine' });
}
const ptMember = members.find((m, i) => i % 6 === 0 && i > 0);
if (ptMember) for (let d = 1; d <= 3; d++) { await PTSession.create({ member: ptMember._id, trainer: ptMember.trainer, start: new Date(addDays(today, d).getTime() + 13 * 36e5), end: new Date(addDays(today, d).getTime() + 14 * 36e5) }); }
console.log('Reminders:', await runReminders());
console.log(`\nSeeded ${members.length} demo members.\nLogin (demo only):\n  admin@smartgym.demo / Admin@123\n  staff@smartgym.demo / Staff@123\n  trainer1@smartgym.demo / Trainer@123\n  member1@smartgym.demo / Member@123 (member1 = inactive pattern, member2 = declining pattern)\n`);
await mongoose.disconnect();
