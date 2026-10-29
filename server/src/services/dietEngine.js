// Rule-based diet planner. No AI model involved. Numbers come only from this file + data/foods.js.
import { FOODS } from '../data/foods.js';

export const DISCLAIMER =
  'This plan is general, informational guidance with approximate nutrition estimates. It is not medical nutrition therapy. ' +
  'If you have a medical or dietary condition, are pregnant, or take medication, consult a doctor or registered dietitian.';

export class DietInputError extends Error {
  constructor(message, code = 'invalid_input') { super(message); this.code = code; }
}

const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const GOAL_ADJ = { general_fitness: 0, weight_management: -0.1, muscle_building: 0.1, strength: 0.05, consistency: 0, maintain: 0 };
const PROTEIN_PER_KG = { muscle_building: 1.8, strength: 1.6, weight_management: 1.6 };
const LEVEL = { v: 0, g: 1, e: 2, n: 3 };
const MEMBER_LEVEL = { vegan: 0, vegetarian: 1, eggetarian: 2, non_vegetarian: 3 };
const SLOTS = {
  3: [['Breakfast', 'breakfast', 0.3], ['Lunch', 'lunch', 0.4], ['Dinner', 'dinner', 0.3]],
  4: [['Breakfast', 'breakfast', 0.27], ['Lunch', 'lunch', 0.33], ['Evening snack', 'snack', 0.13], ['Dinner', 'dinner', 0.27]],
  5: [['Breakfast', 'breakfast', 0.25], ['Mid-morning snack', 'snack', 0.1], ['Lunch', 'lunch', 0.3], ['Evening snack', 'snack', 0.1], ['Dinner', 'dinner', 0.25]],
};
const TEMPLATE = { breakfast: ['carb', 'protein', 'fruit'], lunch: ['carb', 'protein', 'veg', 'side'], dinner: ['carb', 'protein', 'veg'], snack: ['snack', 'fruit'] };
const SCALABLE = new Set(['carb', 'protein', 'snack']);

const SYNONYMS = {
  milk: ['dairy'], lactose: ['dairy'], dairy: ['dairy'], curd: ['dairy'], paneer: ['dairy'], cheese: ['dairy'],
  egg: ['egg'], eggs: ['egg'], gluten: ['gluten'], wheat: ['gluten'], peanut: ['peanut'], peanuts: ['peanut'],
  nuts: ['peanut', 'tree_nut'], 'tree nuts': ['tree_nut'], almond: ['tree_nut'], almonds: ['tree_nut'], cashew: ['tree_nut'],
  soy: ['soy'], soya: ['soy'], fish: ['fish'], shellfish: ['shellfish'], prawn: ['shellfish'], sesame: ['sesame'],
};
const r1 = (n) => Math.round(n * 10) / 10;

export function normalizeAvoidances(list = []) {
  const keys = new Set(); const names = []; const unrecognized = [];
  for (const raw of list) {
    const t = String(raw).trim().toLowerCase();
    if (!t) continue;
    if (SYNONYMS[t]) SYNONYMS[t].forEach((k) => keys.add(k));
    else unrecognized.push(t);
    names.push(t);
  }
  return { keys, names, unrecognized };
}

export function calcTargets({ age, gender, heightCm, weightKg, activityLevel, goal }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const bmr = base + (gender === 'male' ? 5 : gender === 'female' ? -161 : -78);
  const tdee = bmr * (ACTIVITY[activityLevel] ?? 1.375);
  const floor = gender === 'male' ? 1500 : 1200;
  const kcal = Math.round(Math.max(floor, tdee * (1 + (GOAL_ADJ[goal] ?? 0))) / 10) * 10;
  const proteinG = Math.round(Math.min(weightKg * (PROTEIN_PER_KG[goal] ?? 1.2), (kcal * 0.35) / 4));
  const fatG = Math.round((kcal * 0.27) / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, proteinG, carbsG, fatG, formula: 'Mifflin-St Jeor', floorApplied: kcal === floor };
}

function allowed(food, level, avoid) {
  if (LEVEL[food.level] > level) return false;
  if (food.allergens.some((a) => avoid.keys.has(a))) return false;
  const name = food.name.toLowerCase();
  return !avoid.names.some((n) => name.includes(n));
}

export function generateDietPlan(input) {
  const { age, gender = 'other', heightCm, weightKg, goal = 'general_fitness', activityLevel = 'light', dietType = 'vegetarian', mealsPerDay = 4, days = 7 } = input;
  if (!(age >= 18)) throw new DietInputError('Automated diet plans are available for adults (18+) only. Please speak to a registered dietitian.', 'age_restricted');
  if (!(heightCm >= 120 && heightCm <= 230) || !(weightKg >= 30 && weightKg <= 300)) throw new DietInputError('Height or weight is outside the supported range.');
  if (!(goal in GOAL_ADJ)) throw new DietInputError('Unsupported goal.');
  if (!(dietType in MEMBER_LEVEL)) throw new DietInputError('Unsupported diet preference.');
  if (!SLOTS[mealsPerDay]) throw new DietInputError('Meals per day must be 3, 4 or 5.');

  const level = MEMBER_LEVEL[dietType];
  const avoid = normalizeAvoidances([...(input.allergies || []), ...(input.intolerances || []), ...(input.dislikedFoods || [])]);
  const pool = FOODS.filter((x) => allowed(x, level, avoid));
  const targets = calcTargets({ age, gender, heightCm, weightKg, activityLevel, goal });
  const warnings = [];
  if (targets.floorApplied) warnings.push('Calorie target was raised to a safe minimum; this tool never plans below it.');
  if (avoid.unrecognized.length) warnings.push(`Not recognised as a standard allergen: ${avoid.unrecognized.join(', ')}. Foods were excluded by name only; please verify with a dietitian.`);
  if (age >= 65) warnings.push('Nutrition needs change with age; please review this plan with a healthcare professional.');
  if (!pool.some((x) => x.role === 'protein')) warnings.push('Your restrictions left no protein foods in the sample database; a dietitian should build this plan.');

  const plan = [];
  for (let d = 0; d < days; d++) {
    const meals = SLOTS[mealsPerDay].map(([slotName, kind, share], si) => {
      const picks = [];
      for (const role of TEMPLATE[kind]) {
        const options = pool.filter((x) => x.role === role && x.meals.includes(kind));
        if (options.length) picks.push({ food: options[(d + si * 2) % options.length], role });
      }
      const fixed = picks.filter((p) => !SCALABLE.has(p.role)).reduce((s, p) => s + p.food.kcal, 0);
      const flex = picks.filter((p) => SCALABLE.has(p.role)).reduce((s, p) => s + p.food.kcal, 0);
      let factor = flex > 0 ? (targets.kcal * share - fixed) / flex : 1;
      factor = Math.min(2.5, Math.max(0.5, Math.round(factor * 2) / 2));
      const items = picks.map(({ food, role }) => {
        const s = SCALABLE.has(role) ? factor : 1;
        return { foodId: food.id, name: food.name, serving: food.serving, servings: s, kcal: Math.round(food.kcal * s), proteinG: r1(food.proteinG * s), carbsG: r1(food.carbsG * s), fatG: r1(food.fatG * s) };
      });
      return { slot: slotName, items, totals: sum(items) };
    });
    plan.push({ day: d + 1, meals, totals: sum(meals.flatMap((m) => m.items)) });
  }
  return {
    approximate: true, targets, days: plan, warnings, disclaimer: DISCLAIMER,
    hydration: 'Drink water regularly through the day; roughly 2-3 litres is a common general range, adjusted for climate, activity and your doctor\'s advice.',
    requiresProfessionalReview: Boolean(input.hasHealthConsiderations) || age >= 65,
    dataNote: 'Food values are approximate sample data for demonstration.',
  };
}

function sum(items) {
  const t = items.reduce((a, i) => ({ kcal: a.kcal + i.kcal, proteinG: a.proteinG + i.proteinG, carbsG: a.carbsG + i.carbsG, fatG: a.fatG + i.fatG }), { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  return { kcal: t.kcal, proteinG: r1(t.proteinG), carbsG: r1(t.carbsG), fatG: r1(t.fatG) };
}
