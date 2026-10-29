import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDietPlan, calcTargets, normalizeAvoidances, DietInputError } from '../../src/services/dietEngine.js';
import { generateWorkoutPlan, suggestProgression, WorkoutInputError } from '../../src/services/workoutEngine.js';
import { ruleBasedReply } from '../../src/services/chatbotRules.js';
import { FOODS } from '../../src/data/foods.js';

const base = { age: 25, gender: 'male', heightCm: 175, weightKg: 70, goal: 'general_fitness', activityLevel: 'moderate', dietType: 'vegetarian', mealsPerDay: 4 };
const allItems = (plan) => plan.days.flatMap((d) => d.meals.flatMap((m) => m.items));
const byId = Object.fromEntries(FOODS.map((f) => [f.id, f]));

test('Mifflin-St Jeor known value (male 25y 175cm 70kg)', () => assert.equal(calcTargets({ ...base }).bmr, 1674));
test('weight management target is a modest deficit, never below floor', () => {
  const t = calcTargets({ ...base, goal: 'weight_management' }); const maintain = calcTargets({ ...base });
  assert.ok(t.kcal < maintain.kcal && t.kcal >= maintain.kcal * 0.85);
  const tiny = calcTargets({ age: 60, gender: 'female', heightCm: 150, weightKg: 40, activityLevel: 'sedentary', goal: 'weight_management' });
  assert.equal(tiny.kcal, 1200); assert.equal(tiny.floorApplied, true);
});
test('plan has 7 days, requested meal count, approximate flag and disclaimer', () => {
  const p = generateDietPlan(base);
  assert.equal(p.days.length, 7); assert.equal(p.days[0].meals.length, 4); assert.equal(p.approximate, true); assert.match(p.disclaimer, /not medical nutrition therapy/);
});
test('daily totals land within 20% of target kcal', () => {
  const p = generateDietPlan(base);
  for (const d of p.days) assert.ok(Math.abs(d.totals.kcal - p.targets.kcal) / p.targets.kcal < 0.2, `day ${d.day}: ${d.totals.kcal} vs ${p.targets.kcal}`);
});
test('ALLERGEN SAFETY: no food containing a declared allergen ever appears', () => {
  for (const [declared, key] of [['dairy', 'dairy'], ['nuts', 'peanut'], ['nuts', 'tree_nut'], ['gluten', 'gluten'], ['soy', 'soy'], ['egg', 'egg']]) {
    const p = generateDietPlan({ ...base, dietType: 'non_vegetarian', allergies: [declared] });
    for (const i of allItems(p)) assert.ok(!byId[i.foodId].allergens.includes(key), `${i.name} contains ${key}`);
  }
});
test('diet type respected: vegan plan has no dairy/egg/meat; vegetarian has no egg/meat', () => {
  for (const i of allItems(generateDietPlan({ ...base, dietType: 'vegan' }))) assert.equal(byId[i.foodId].level, 'v');
  for (const i of allItems(generateDietPlan(base))) assert.ok(['v', 'g'].includes(byId[i.foodId].level));
});
test('disliked food excluded by name; unknown allergen produces a warning', () => {
  const p = generateDietPlan({ ...base, dislikedFoods: ['banana'], allergies: ['kiwi'] });
  assert.ok(!allItems(p).some((i) => /banana/i.test(i.name)));
  assert.ok(p.warnings.some((w) => /kiwi/.test(w)));
});
test('minors and bad inputs are refused', () => {
  assert.throws(() => generateDietPlan({ ...base, age: 16 }), (e) => e instanceof DietInputError && e.code === 'age_restricted');
  assert.throws(() => generateDietPlan({ ...base, weightKg: 5 }), DietInputError);
  assert.throws(() => generateDietPlan({ ...base, mealsPerDay: 9 }), DietInputError);
});
test('health considerations force professional review', () => assert.equal(generateDietPlan({ ...base, hasHealthConsiderations: true }).requiresProfessionalReview, true));
test('synonym mapping', () => assert.deepEqual([...normalizeAvoidances(['Milk', 'nuts']).keys].sort(), ['dairy', 'peanut', 'tree_nut']));

const wbase = { goal: 'muscle_building', level: 'intermediate', daysPerWeek: 4, durationMin: 60, equipment: 'gym' };
test('workout: right number of days, weekdays and exercises', () => {
  const p = generateWorkoutPlan(wbase);
  assert.equal(p.days.length, 4); assert.deepEqual(p.days.map((d) => d.weekday), [1, 2, 4, 5]);
  for (const d of p.days) assert.ok(d.exercises.length >= 3 && d.exercises.length <= 9);
  assert.match(p.disclaimer, /not replace professional medical advice|does not replace/i);
});
test('bodyweight equipment never yields dumbbell/gym moves; beginner gets no advanced moves', () => {
  const p = generateWorkoutPlan({ ...wbase, equipment: 'bodyweight', level: 'beginner' });
  const ids = p.days.flatMap((d) => d.exercises.map((e) => e.exerciseId));
  for (const id of ids) assert.ok(!['db-bench', 'leg-press', 'lat-pulldown', 'back-squat', 'pullup', 'bb-bench'].includes(id), id);
  for (const e of p.days.flatMap((d) => d.exercises)) assert.equal(e.difficulty, 'beginner');
});
test('no exercise repeats within one day', () => { for (const d of generateWorkoutPlan({ ...wbase, daysPerWeek: 6 }).days) { const ids = d.exercises.map((e) => e.exerciseId); assert.equal(new Set(ids).size, ids.length); } });
test('limitations/red flags force trainer review and a visible note', () => {
  const p = generateWorkoutPlan({ ...wbase, limitations: 'recent knee injury' });
  assert.equal(p.requiresProfessionalReview, true); assert.ok(p.notes.some((n) => /does not adapt/i.test(n)));
  assert.equal(generateWorkoutPlan(wbase).requiresProfessionalReview, false);
});
test('invalid workout input rejected', () => { assert.throws(() => generateWorkoutPlan({ ...wbase, daysPerWeek: 9 }), WorkoutInputError); assert.throws(() => generateWorkoutPlan({ ...wbase, goal: 'x' }), WorkoutInputError); });
test('progression: discomfort holds, two clean top-range sessions increase', () => {
  const ok = { setsDone: 3, targetSets: 3, minReps: 12, targetRepsMax: 12, discomfort: false };
  assert.equal(suggestProgression([ok, { ...ok, discomfort: true }]).action, 'hold');
  assert.equal(suggestProgression([ok, ok]).action, 'increase');
  assert.equal(suggestProgression([ok]).action, 'maintain');
});

test('chatbot refuses medical, self-harm and extreme-diet questions', () => {
  assert.match(ruleBasedReply('my knee pain is bad what should I take'), /cannot give medical advice/);
  assert.match(ruleBasedReply('I want to kill myself'), /emergency services/);
  assert.match(ruleBasedReply('how to starve to lose weight'), /cannot help with extreme/);
});
test('chatbot answers from the caller-supplied context only', () => {
  const r = ruleBasedReply('when does my membership expire?', { membership: { planName: 'Quarterly', endDate: '2026-12-01', daysLeft: 34 } });
  assert.match(r, /Quarterly.*2026-12-01.*34 day/);
  assert.match(ruleBasedReply('when does my membership expire?', {}), /could not find an active membership/);
  assert.match(ruleBasedReply('what is a rep?'), /repetition/);
});
