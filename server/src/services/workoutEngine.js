// Rule-based workout planner (no AI model). General fitness only; never prescribes rehabilitation.
export const DISCLAIMER =
  'General fitness suggestion only. It does not replace professional medical advice. Stop any exercise that causes pain, dizziness or unusual discomfort and tell your trainer.';

export class WorkoutInputError extends Error {}

// m = muscle group, e = equipment tier (bw < db < gym), d = difficulty 1-3, t = 'reps' | 'time'
const ex = (id, name, m, e, d, how, t = 'reps') => ({ id, name, muscle: m, equipment: e, difficulty: d, instructions: how, type: t });
export const EXERCISES = [
  ex('bw-squat', 'Bodyweight squat', 'quads', 'bw', 1, 'Feet shoulder-width, sit hips back and down, chest up, drive through heels.'),
  ex('goblet-squat', 'Goblet squat', 'quads', 'db', 1, 'Hold a dumbbell at your chest, squat to comfortable depth, keep knees tracking over toes.'),
  ex('leg-press', 'Leg press', 'quads', 'gym', 1, 'Feet shoulder-width on the platform, lower under control, press without locking knees.'),
  ex('back-squat', 'Barbell back squat', 'quads', 'gym', 3, 'Bar on upper back, brace core, squat to depth you control, drive up. Use a spotter or rack safeties.'),
  ex('lunge', 'Walking lunge', 'quads', 'bw', 2, 'Step forward, lower back knee toward the floor, push through the front heel.'),
  ex('rdl', 'Romanian deadlift', 'hamstrings', 'db', 2, 'Soft knees, push hips back with a flat back, lower dumbbells along legs, squeeze glutes to stand.'),
  ex('glute-bridge', 'Glute bridge', 'glutes', 'bw', 1, 'Lie on your back, feet flat, lift hips until shoulders-hips-knees align, pause, lower.'),
  ex('leg-curl', 'Seated leg curl', 'hamstrings', 'gym', 1, 'Adjust pad above heels, curl smoothly, return slowly.'),
  ex('calf-raise', 'Standing calf raise', 'calves', 'bw', 1, 'Rise onto toes, pause at the top, lower slowly.'),
  ex('incline-pushup', 'Incline push-up', 'chest', 'bw', 1, 'Hands on a bench, body in a straight line, lower chest to the bench and press.'),
  ex('pushup', 'Push-up', 'chest', 'bw', 2, 'Hands under shoulders, body straight, lower chest near the floor, press up.'),
  ex('db-bench', 'Dumbbell bench press', 'chest', 'db', 2, 'Press dumbbells from chest level to above shoulders, control the way down.'),
  ex('chest-press', 'Machine chest press', 'chest', 'gym', 1, 'Set seat so handles are mid-chest, press forward, return slowly.'),
  ex('bb-bench', 'Barbell bench press', 'chest', 'gym', 3, 'Shoulder blades tucked, lower bar to mid-chest, press. Use a spotter.'),
  ex('db-ohp', 'Dumbbell overhead press', 'shoulders', 'db', 2, 'Press dumbbells overhead without arching the lower back.'),
  ex('lateral-raise', 'Lateral raise', 'shoulders', 'db', 1, 'Raise arms to shoulder height with a slight elbow bend, lower slowly.'),
  ex('bench-dip', 'Bench dip', 'triceps', 'bw', 1, 'Hands on bench edge, lower elbows to about 90 degrees, press up.'),
  ex('lat-pulldown', 'Lat pulldown', 'back', 'gym', 1, 'Pull the bar to upper chest, lead with elbows, return with control.'),
  ex('cable-row', 'Seated cable row', 'back', 'gym', 1, 'Chest tall, pull handle to ribs, squeeze shoulder blades, return slowly.'),
  ex('db-row', 'One-arm dumbbell row', 'back', 'db', 1, 'Hand and knee on a bench, pull dumbbell to hip, lower under control.'),
  ex('pullup', 'Pull-up', 'back', 'gym', 3, 'Full hang, pull chin over the bar, lower fully. Use assistance if needed.'),
  ex('superman', 'Superman hold', 'back', 'bw', 1, 'Lie face down, lift arms and legs slightly, hold, lower.', 'time'),
  ex('db-curl', 'Dumbbell biceps curl', 'biceps', 'db', 1, 'Elbows by your sides, curl up, lower slowly without swinging.'),
  ex('plank', 'Plank', 'core', 'bw', 1, 'Forearms down, body in a straight line, brace the core, breathe steadily.', 'time'),
  ex('dead-bug', 'Dead bug', 'core', 'bw', 1, 'On your back, lower opposite arm and leg while keeping the lower back flat.'),
  ex('bicycle', 'Bicycle crunch', 'core', 'bw', 1, 'Rotate elbow toward opposite knee in a slow, controlled pedalling motion.'),
  ex('knee-raise', 'Hanging knee raise', 'core', 'gym', 2, 'Hang from the bar, raise knees toward chest without swinging.'),
  ex('treadmill', 'Brisk treadmill walk or jog', 'cardio', 'gym', 1, 'Choose a pace where you can still speak in short sentences.', 'time'),
  ex('cycle', 'Stationary cycling', 'cardio', 'gym', 1, 'Steady pace with light-to-moderate resistance.', 'time'),
  ex('jacks', 'Jumping jacks', 'cardio', 'bw', 1, 'Light, rhythmic jumps; land softly.', 'time'),
  ex('rope', 'Jump rope', 'cardio', 'bw', 2, 'Small hops on the balls of your feet, wrists turn the rope.', 'time'),
  ex('hamstring-stretch', 'Hamstring stretch', 'mobility', 'bw', 1, 'Extend one leg, hinge from hips until a gentle stretch; do not bounce.', 'time'),
  ex('hip-flexor', 'Hip flexor stretch', 'mobility', 'bw', 1, 'Half-kneeling, tuck pelvis, shift forward until a gentle stretch.', 'time'),
  ex('cat-cow', 'Cat-cow', 'mobility', 'bw', 1, 'On hands and knees, alternate arching and rounding your spine slowly.', 'time'),
  ex('childs-pose', "Child's pose", 'mobility', 'bw', 1, 'Sit hips back toward heels, reach forward, breathe slowly.', 'time'),
];

const TIER = { bw: 0, db: 1, gym: 2 };
const EQUIP_MAX = { bodyweight: 0, dumbbells: 1, gym: 2 };
const LEVEL_MAX = { beginner: 1, intermediate: 2, advanced: 3 };
const WEEKDAYS = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6] };
const FULL = ['quads', 'chest', 'back', 'hamstrings', 'shoulders', 'core', 'glutes', 'biceps'];
const UPPER = ['chest', 'back', 'shoulders', 'back', 'biceps', 'triceps', 'chest', 'core'];
const LOWER = ['quads', 'hamstrings', 'glutes', 'quads', 'calves', 'core', 'hamstrings', 'core'];
const PUSH = ['chest', 'shoulders', 'chest', 'triceps', 'shoulders', 'core'];
const PULL = ['back', 'back', 'biceps', 'back', 'core', 'biceps'];
const SPLITS = {
  2: [['Full body A', FULL], ['Full body B', [...FULL].reverse()]],
  3: [['Full body A', FULL], ['Full body B', [...FULL].reverse()], ['Full body C', ['glutes', 'chest', 'back', 'quads', 'shoulders', 'core', 'hamstrings', 'biceps']]],
  4: [['Upper A', UPPER], ['Lower A', LOWER], ['Upper B', [...UPPER].reverse()], ['Lower B', [...LOWER].reverse()]],
  5: [['Push', PUSH], ['Pull', PULL], ['Lower', LOWER], ['Upper', UPPER], ['Full body', FULL]],
  6: [['Push A', PUSH], ['Pull A', PULL], ['Lower A', LOWER], ['Push B', [...PUSH].reverse()], ['Pull B', [...PULL].reverse()], ['Lower B', [...LOWER].reverse()]],
};
const GOALS = {
  strength: { sets: 4, reps: '4-6', rest: 150, accRest: 90, accReps: '8-10', cardio: false },
  muscle_building: { sets: 3, reps: '8-12', rest: 75, accRest: 60, accReps: '10-15', cardio: false },
  general_fitness: { sets: 3, reps: '10-12', rest: 60, accRest: 60, accReps: '12-15', cardio: true },
  weight_management: { sets: 3, reps: '12-15', rest: 45, accRest: 45, accReps: '12-15', cardio: true },
  cardio: { sets: 3, reps: '12-15', rest: 30, accRest: 30, accReps: '15', cardio: true },
  flexibility: { sets: 2, reps: '10', rest: 30, accRest: 30, accReps: '10', cardio: false },
};
const RED_FLAGS = /injur|pain|surgery|operat|hernia|pregnan|heart|blood pressure|hypertension|dizz|asthma|fracture|slipped disc|sciatica|diabet/i;

export function generateWorkoutPlan({ goal = 'general_fitness', level = 'beginner', daysPerWeek = 3, durationMin = 45, equipment = 'gym', limitations = '' }) {
  const g = GOALS[goal];
  if (!g) throw new WorkoutInputError('Unsupported goal.');
  if (!(level in LEVEL_MAX)) throw new WorkoutInputError('Unsupported experience level.');
  if (!(equipment in EQUIP_MAX)) throw new WorkoutInputError('Unsupported equipment option.');
  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 2 || daysPerWeek > 6) throw new WorkoutInputError('Training days must be between 2 and 6.');
  if (!(durationMin >= 20 && durationMin <= 120)) throw new WorkoutInputError('Duration must be between 20 and 120 minutes.');

  const maxTier = EQUIP_MAX[equipment];
  const maxDiff = LEVEL_MAX[level];
  const pool = EXERCISES.filter((e) => TIER[e.equipment] <= maxTier && e.difficulty <= maxDiff);
  const count = Math.min(8, Math.max(3, Math.round((durationMin - 10) / 8)));
  const sets = level === 'beginner' ? Math.max(2, g.sets - 1) : g.sets;
  const flagged = Boolean(limitations && limitations.trim());
  const red = RED_FLAGS.test(limitations || '');

  const days = SPLITS[daysPerWeek].map(([label, slots], di) => {
    const used = new Set();
    const exercises = [];
    const focusSlots = goal === 'flexibility' ? ['mobility', 'mobility', 'mobility', 'mobility', 'core', 'mobility'] : slots;
    for (const muscle of focusSlots) {
      if (exercises.length >= count) break;
      let options = pool.filter((e) => e.muscle === muscle && !used.has(e.id));
      if (!options.length) continue;
      options = options.sort((a, b) => (level === 'advanced' ? b.difficulty - a.difficulty : TIER[b.equipment] - TIER[a.equipment]) || a.id.localeCompare(b.id));
      const pick = options[di % options.length];
      used.add(pick.id);
      const compound = ['quads', 'chest', 'back', 'hamstrings'].includes(muscle) && exercises.length < 2;
      exercises.push(toEntry(pick, compound ? sets : Math.max(2, sets - 1), compound ? g.reps : g.accReps, compound ? g.rest : g.accRest));
    }
    if (g.cardio && durationMin >= 40) {
      const cardio = pool.filter((e) => e.muscle === 'cardio').sort((a, b) => TIER[b.equipment] - TIER[a.equipment] || a.id.localeCompare(b.id));
      if (cardio.length) exercises.push({ ...toEntry(cardio[di % cardio.length], 1, '10 min', 0), reps: '10 min' });
    }
    return { dayNumber: di + 1, weekday: WEEKDAYS[daysPerWeek][di], label, exercises };
  });

  const notes = ['Warm up for 5-8 minutes before each session and cool down afterwards.', 'Increase weight or reps gradually only when every set feels controlled.'];
  if (flagged) notes.push('Limitations were noted. This plan does not adapt for medical conditions or injuries; a trainer must review it, and a clinician should clear you first if you have a health concern.');
  return {
    title: `${labelGoal(goal)} - ${daysPerWeek} days/week`, goal, level, daysPerWeek, durationMin, equipment,
    days, notes, disclaimer: DISCLAIMER, requiresProfessionalReview: red || flagged,
  };
}

const labelGoal = (g) => g.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
function toEntry(e, sets, reps, restSec) {
  const timed = e.type === 'time';
  return { exerciseId: e.id, name: e.name, muscle: e.muscle, sets, reps: timed ? (e.muscle === 'mobility' ? '30 sec hold' : '30-45 sec') : reps, restSec, instructions: e.instructions, difficulty: ['', 'beginner', 'intermediate', 'advanced'][e.difficulty] };
}

/** entries: chronological [{ setsDone, targetSets, minReps, targetRepsMax, discomfort }] for ONE exercise. */
export function suggestProgression(entries) {
  if (!entries.length) return { action: 'none', message: 'No logs yet for this exercise.' };
  const last = entries[entries.length - 1];
  if (last.discomfort) return { action: 'hold', message: 'You reported discomfort last time. Keep the load light or skip it, and talk to your trainer before progressing.' };
  const ok = (e) => !e.discomfort && e.setsDone >= e.targetSets && e.minReps >= e.targetRepsMax;
  if (entries.length >= 2 && ok(last) && ok(entries[entries.length - 2])) return { action: 'increase', message: 'You completed all sets at the top of the rep range twice in a row. Consider a small load increase (about 2.5-5%) if form stays solid.' };
  return { action: 'maintain', message: 'Keep the current load until you can complete all sets at the top of the rep range in two sessions.' };
}
