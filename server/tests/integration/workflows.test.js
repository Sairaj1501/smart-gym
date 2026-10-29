// Integration tests: need `npm install` (supertest, mongodb-memory-server). The first run downloads a mongod binary.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.ANTHROPIC_API_KEY = ''; // force the rule-based fallbacks

let app, request, mongod, mongoose, M, dates;
const tok = {}; const ids = {};
const call = (method, path, token, body) => { let r = request(app)[method](path); if (token) r = r.set('Authorization', `Bearer ${token}`); return body ? r.send(body) : r; };
const login = async (email, password) => (await call('post', '/api/auth/login', null, { email, password })).body.token;
const key = () => `key-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const dayOffset = (n) => dates.dayKeyOf(dates.addDays(dates.todayDate(), n));
const newMember = (token, over = {}) => call('post', '/api/members', token, { fullName: 'Test Member', email: `m${Math.random().toString(36).slice(2, 8)}@t.test`, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`, dob: '2000-05-10', ...over });

before(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  request = (await import('supertest')).default;
  mongoose = (await import('mongoose')).default;
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  M = await import('../../src/models/index.js'); dates = await import('../../src/utils/dates.js');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  app = (await import('../../src/app.js')).createApp();
  const { hashPassword } = await import('../../src/utils/password.js');
  await M.User.create({ name: 'Admin', email: 'admin@t.test', role: 'admin', passwordHash: await hashPassword('Admin@1234') });
  tok.admin = await login('admin@t.test', 'Admin@1234');
  await call('post', '/api/auth/register', tok.admin, { name: 'Desk', email: 'staff@t.test', password: 'Staff@1234', role: 'staff' });
  tok.staff = await login('staff@t.test', 'Staff@1234');
  ids.plan = (await call('post', '/api/plans', tok.admin, { name: 'Monthly', durationValue: 1, price: 1500, includesPersonalTraining: false })).body.plan._id;
  ids.shortPlan = (await call('post', '/api/plans', tok.admin, { name: 'OneDay', durationValue: 1, durationUnit: 'days', price: 100 })).body.plan._id;
  const t = await call('post', '/api/trainers', tok.admin, { fullName: 'Coach A', email: 'coach@t.test', phone: '9000000001' });
  ids.trainer = t.body.trainer._id; tok.trainer = await login('coach@t.test', t.body.tempPassword);
  const a = await newMember(tok.staff, { planId: ids.plan, initialPayment: { amount: 1000, method: 'cash' }, idempotencyKey: key() });
  ids.a = a.body.member._id; ids.aMembership = a.body.membership._id; tok.a = await login(a.body.member.email, a.body.tempPassword);
  const b = await newMember(tok.staff, { planId: ids.plan });
  ids.b = b.body.member._id; tok.b = await login(b.body.member.email, b.body.tempPassword);
});
after(async () => { await mongoose?.disconnect(); await mongod?.stop(); });

test('login: valid works, wrong password and unknown email give the same 401', async () => {
  assert.ok(tok.admin);
  const bad = await call('post', '/api/auth/login', null, { email: 'admin@t.test', password: 'nope' });
  const unknown = await call('post', '/api/auth/login', null, { email: 'x@t.test', password: 'nope' });
  assert.equal(bad.status, 401); assert.equal(unknown.status, 401); assert.equal(bad.body.error, unknown.body.error);
});
test('protected routes: no token 401; member on staff route 403; staff cannot change settings', async () => {
  assert.equal((await call('get', '/api/members')).status, 401);
  assert.equal((await call('get', '/api/members', tok.a)).status, 403);
  assert.equal((await call('put', '/api/settings', tok.staff, { gymName: 'Hacked' })).status, 403);
});
test('public registration of privileged users is impossible', async () => assert.equal((await call('post', '/api/auth/register', null, { name: 'Evil', email: 'e@t.test', password: 'Evil@1234', role: 'admin' })).status, 401));
test('member validation errors are field-level; duplicate phone/email rejected', async () => {
  const bad = await newMember(tok.staff, { email: 'not-an-email', phone: '12' });
  assert.equal(bad.status, 400); assert.ok(bad.body.fields.email && bad.body.fields.phone);
  const a = (await call('get', `/api/members/${ids.a}`, tok.staff)).body.member;
  assert.equal((await newMember(tok.staff, { phone: a.phone })).status, 409);
  assert.equal((await newMember(tok.staff, { email: a.email })).status, 409);
});
test('registration assigns membership with correct expiry and outstanding balance', async () => {
  const r = (await call('get', `/api/members/${ids.a}`, tok.staff)).body;
  const start = dates.parseDateOnly(r.currentMembership.startDate.slice(0, 10));
  assert.equal(r.currentMembership.endDate.slice(0, 10), dates.dayKeyOf(dates.computeEndDate(start, 1, 'months')));
  assert.equal(r.outstanding, 500);
});
test('payments: overpayment rejected; exact payment accepted; same idempotency key never double-counts', async () => {
  assert.equal((await call('post', '/api/payments', tok.staff, { memberId: ids.a, amount: 501, method: 'cash', idempotencyKey: key() })).status, 422);
  const k = key();
  const p1 = await call('post', '/api/payments', tok.staff, { memberId: ids.a, amount: 200, method: 'upi', idempotencyKey: k });
  const p2 = await call('post', '/api/payments', tok.staff, { memberId: ids.a, amount: 200, method: 'upi', idempotencyKey: k });
  assert.equal(p1.status, 201); assert.equal(p2.status, 200); assert.equal(p2.body.duplicate, true); assert.equal(p1.body.payment._id, p2.body.payment._id);
  assert.equal(p2.body.outstanding, 300);
  assert.equal((await call('post', '/api/payments', tok.staff, { memberId: ids.a, amount: 0, method: 'cash' })).status, 400);
});
test('payments: concurrent payments cannot exceed the balance', async () => {
  const rs = await Promise.all([1, 2, 3, 4].map(() => call('post', '/api/payments', tok.staff, { memberId: ids.a, amount: 150, method: 'cash', idempotencyKey: key() })));
  assert.equal(rs.filter((r) => r.status === 201).length, 2); // only 300 outstanding
  assert.equal((await call('get', `/api/members/${ids.a}`, tok.staff)).body.outstanding, 0);
});
test('renewal keeps history and continues from the old end date', async () => {
  const before = (await call('get', `/api/members/${ids.a}`, tok.staff)).body.currentMembership;
  const r = await call('post', `/api/memberships/${ids.aMembership}/renew`, tok.staff, {});
  assert.equal(r.status, 201);
  const after = (await call('get', `/api/members/${ids.a}`, tok.staff)).body;
  assert.equal(after.membershipHistory.length, 2);
  const old = after.membershipHistory.find((m) => m._id === before._id);
  assert.equal(old.endDate, before.endDate); // original untouched
  assert.equal(dates.dayKeyOf(dates.addDays(new Date(before.endDate), 1)), r.body.membership.startDate.slice(0, 10));
  assert.equal((await call('post', `/api/memberships/${ids.aMembership}/renew`, tok.staff, {})).status, 409); // not the latest any more
});
test('attendance: first check-in ok, second the same day is a 409', async () => {
  assert.equal((await call('post', '/api/attendance/check-in', tok.staff, { memberId: ids.a })).status, 201);
  assert.equal((await call('post', '/api/attendance/check-in', tok.staff, { memberId: ids.a })).status, 409);
});
test('attendance: expired membership cannot check in (default rule)', async () => {
  const m = await newMember(tok.staff, { planId: ids.shortPlan, startDate: dayOffset(-10) });
  assert.equal(m.status, 201);
  const r = await call('post', '/api/attendance/check-in', tok.staff, { memberId: m.body.member._id });
  assert.equal(r.status, 403); assert.equal(r.body.code, 'membership_invalid');
});
test('QR token flow: member token checks them in; garbage token rejected', async () => {
  const q = await call('get', '/api/attendance/qr-token', tok.b);
  assert.equal((await call('post', '/api/attendance/check-in', tok.staff, { token: q.body.token })).status, 201);
  assert.equal((await call('post', '/api/attendance/check-in', tok.staff, { token: 'abc' })).status, 400);
});
test('object-level authorization: members cannot read each other; staff cannot read health data', async () => {
  assert.equal((await call('get', `/api/members/${ids.a}`, tok.b)).status, 403);
  assert.equal((await call('get', `/api/payments/member/${ids.a}`, tok.b)).status, 403);
  assert.equal((await call('get', `/api/health-metrics/${ids.a}`, tok.b)).status, 403);
  assert.equal((await call('get', `/api/health-metrics/${ids.a}`, tok.staff)).status, 403);
  assert.equal((await call('get', `/api/health-metrics/${ids.a}`, tok.trainer)).status, 403); // not assigned yet
});
test('health: consent required; BMI computed server-side; invalid values rejected; trainer access follows assignment', async () => {
  assert.equal((await call('post', '/api/health-metrics', tok.a, { weightKg: 70, heightCm: 175 })).body.code, 'consent_required');
  assert.equal((await call('put', `/api/members/${ids.a}`, tok.a, { consentHealth: true })).status, 200);
  const ok = await call('post', '/api/health-metrics', tok.a, { weightKg: 70, heightCm: 175, bmi: 999 });
  assert.equal(ok.status, 201); assert.equal(ok.body.metric.bmi, 22.9); assert.equal(ok.body.metric.source, 'self_reported');
  assert.equal((await call('post', '/api/health-metrics', tok.a, { weightKg: 5 })).status, 400);
  assert.equal((await call('post', '/api/health-metrics', tok.a, { weightKg: 70, measuredAt: dayOffset(3) })).status, 422);
  await call('put', `/api/members/${ids.a}`, tok.staff, { trainerId: ids.trainer });
  const t = await call('get', `/api/health-metrics/${ids.a}`, tok.trainer); assert.equal(t.status, 200); assert.equal(t.body.items.length, 1);
  assert.ok((await call('get', `/api/fitness-progress/${ids.a}`, tok.a)).body.weight.length === 1);
});
test('diet planner works with no AI key, never includes a declared allergen, needs review', async () => {
  const r = await call('post', '/api/diet-plans/generate', tok.a, { dietType: 'vegetarian', allergies: ['dairy', 'nuts'], mealsPerDay: 4, goal: 'general_fitness' });
  assert.equal(r.status, 201); assert.equal(r.body.plan.status, 'pending_review'); assert.equal(r.body.plan.plan.approximate, true);
  const { FOODS } = await import('../../src/data/foods.js'); const by = Object.fromEntries(FOODS.map((f) => [f.id, f]));
  for (const d of r.body.plan.plan.days) for (const m of d.meals) for (const i of m.items) assert.ok(!by[i.foodId].allergens.some((x) => ['dairy', 'peanut', 'tree_nut'].includes(x)));
});
test('workout: member-generated plan waits for trainer approval, then becomes active', async () => {
  const g = await call('post', '/api/workout-plans/generate', tok.a, { goal: 'general_fitness', level: 'beginner', daysPerWeek: 3, durationMin: 45, equipment: 'gym' });
  assert.equal(g.status, 201); assert.equal(g.body.plan.status, 'pending_review');
  assert.equal((await call('put', `/api/workout-plans/${g.body.plan._id}/review`, tok.a, { action: 'approve' })).status, 403); // members cannot self-approve
  const ap = await call('put', `/api/workout-plans/${g.body.plan._id}/review`, tok.trainer, { action: 'approve' });
  assert.equal(ap.body.plan.status, 'active');
  const log = await call('post', `/api/workout-plans/${g.body.plan._id}/log`, tok.a, { dayNumber: 1, exercises: [{ name: 'Leg press', setsDone: 3, minReps: 10, discomfort: true }] });
  assert.equal(log.status, 201); assert.match(log.body.safetyNote, /Stop that exercise/);
});
test('notifications: payment created one for the member; can be marked read', async () => {
  const n = await call('get', '/api/notifications', tok.a); assert.ok(n.body.items.some((x) => x.category === 'payment')); assert.ok(n.body.unreadCount > 0);
  assert.equal((await call('put', '/api/notifications/read-all', tok.a)).status, 200);
  assert.equal((await call('get', '/api/notifications?unread=1', tok.a)).body.items.length, 0);
  assert.equal((await call('get', '/api/notifications', tok.b)).body.items.some((x) => /Receipt/.test(x.message || '')), false); // never sees A's receipts
});
test('reports: staff gets payments CSV but not revenue; respects permissions', async () => {
  const csv = await call('get', '/api/reports/payments?format=csv', tok.staff); assert.equal(csv.status, 200); assert.match(csv.headers['content-type'], /text\/csv/);
  assert.equal((await call('get', '/api/reports/revenue', tok.staff)).status, 403);
  assert.equal((await call('get', '/api/reports/revenue', tok.admin)).status, 200);
});
test('dashboard numbers come from the database; staff does not receive revenue', async () => {
  const a = (await call('get', '/api/analytics/dashboard', tok.admin)).body; const s = (await call('get', '/api/analytics/dashboard', tok.staff)).body;
  assert.ok(a.kpis.totalMembers >= 3); assert.ok(a.kpis.monthRevenue >= 1500); assert.equal(s.kpis.monthRevenue, undefined);
});
test('chatbot: rule-based fallback answers from the caller\'s own membership only', async () => {
  const r = await call('post', '/api/chat', tok.a, { message: 'when does my membership expire?' });
  assert.equal(r.body.source, 'rules'); assert.match(r.body.reply, /Monthly/);
  assert.match((await call('post', '/api/chat', tok.a, { message: 'my knee pain is severe' })).body.reply, /cannot give medical advice/);
});
test('health data deletion: member can erase own records', async () => {
  const d = await call('delete', `/api/members/${ids.a}/health-data`, tok.a); assert.equal(d.status, 200); assert.equal(d.body.deleted, 1);
  assert.equal((await call('delete', `/api/members/${ids.a}/health-data`, tok.b)).status, 403);
});

test('regression: partial PUT never resets omitted fields (trainer status toggle, plan price edit)', async () => {
  await call('put', `/api/trainers/${ids.trainer}`, tok.admin, { specialization: 'Powerlifting', experienceYears: 7, certifications: ['ACE'] });
  assert.equal((await call('put', `/api/trainers/${ids.trainer}`, tok.admin, { employmentStatus: 'inactive' })).status, 200);
  const t = (await call('get', '/api/trainers?all=1', tok.admin)).body.items.find((x) => x._id === ids.trainer);
  assert.equal(t.specialization, 'Powerlifting'); assert.equal(t.experienceYears, 7); assert.deepEqual(t.certifications, ['ACE']);
  await call('put', `/api/trainers/${ids.trainer}`, tok.admin, { employmentStatus: 'active' });
  await call('put', `/api/plans/${ids.plan}`, tok.admin, { includesPersonalTraining: true, facilities: ['Lockers'] });
  await call('put', `/api/plans/${ids.plan}`, tok.admin, { price: 1600 });
  const pl = (await call('get', '/api/plans', tok.admin)).body.items.find((x) => x._id === ids.plan);
  assert.equal(pl.price, 1600); assert.equal(pl.includesPersonalTraining, true); assert.deepEqual(pl.facilities, ['Lockers']);
});
