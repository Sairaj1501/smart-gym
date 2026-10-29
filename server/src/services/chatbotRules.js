// Rule-based fallback assistant. Uses only the authenticated member's own context passed in by the route.
const GLOSSARY = {
  rep: 'A rep (repetition) is one complete movement of an exercise, for example one squat.',
  set: 'A set is a group of consecutive reps, for example 3 sets of 10 reps.',
  pr: 'A PR (personal record) is your best performance on an exercise so far.',
  hiit: 'HIIT means high-intensity interval training: short hard efforts alternated with recovery.',
  superset: 'A superset is two exercises done back to back with little or no rest.',
  'one rep max': 'Your one-rep max is the heaviest weight you could lift once with good form. Only test it with a trainer present.',
  bmi: 'BMI is weight in kg divided by height in metres squared. It is only a rough screening number, not a measure of health or fitness.',
  tdee: 'TDEE is an estimate of the calories your body uses in a day including activity.',
};
const MEDICAL = /pain|injur|hurt|chest|dizz|faint|breath|blood pressure|diabet|pregnan|surgery|medic|dose|supplement|steroid|diagnos|disease|sprain|fracture/i;
const SELF_HARM = /suicid|kill myself|self.?harm|end my life/i;
const ED = /starv|purge|anorex|bulimi|stop eating|lose \d+ ?kg in/i;

export function ruleBasedReply(message, ctx = {}) {
  const m = String(message || '').toLowerCase().trim();
  if (!m) return 'Ask me about your membership, check-ins, workouts, diet plan or general fitness terms.';
  if (SELF_HARM.test(m)) return 'I am really sorry you feel this way. I cannot help with this here, but please talk to someone you trust or contact local emergency services (112 in India) or a mental-health helpline right away.';
  if (ED.test(m)) return 'I cannot help with extreme restriction or unsafe weight-loss methods. Please speak to a doctor or registered dietitian; your trainer can also suggest safe, gradual goals.';
  if (MEDICAL.test(m)) return 'I cannot give medical advice or diagnose problems. If you feel pain, dizziness or anything unusual, stop exercising and speak to a doctor. You can also ask your trainer for help using "Request trainer assistance".';
  if (/renew|expir|valid|membership|plan end|due/.test(m)) {
    const ms = ctx.membership;
    if (!ms) return 'I could not find an active membership on your account. Please ask the front desk to assign or renew a plan.';
    const left = ms.daysLeft >= 0 ? `${ms.daysLeft} day(s) left` : `expired ${Math.abs(ms.daysLeft)} day(s) ago`;
    return `Your ${ms.planName} membership runs until ${ms.endDate} (${left}). Renewals are handled by the front desk.` + (ctx.outstanding > 0 ? ` You currently have a pending balance of ${ctx.outstanding}.` : '');
  }
  if (/weight|bmi|progress/.test(m) && ctx.latestWeightKg) {
    return `Your latest recorded weight is ${ctx.latestWeightKg} kg` + (ctx.latestBmi ? ` (BMI ${ctx.latestBmi}, a rough screening number only)` : '') + '. Open Health & Progress to see your trend chart.';
  }
  for (const [term, def] of Object.entries(GLOSSARY)) if (new RegExp(`\\b${term}s?\\b`).test(m)) return def;
  if (/check.?in|attendance|qr/.test(m)) return 'To check in, show your QR code from the dashboard to the front desk, or ask them to mark you in manually. You can view your history under Attendance.';
  if (/workout|exercise|routine|training/.test(m)) return 'Open Workout Plans to generate a suggested plan. A trainer reviews it before it becomes active. For beginners, 2-3 full-body days a week is a common starting point.';
  if (/diet|meal|food|calorie|protein|nutrition/.test(m)) return 'Open Diet Plans to generate a general meal plan from your preferences and allergies. Values are approximate and informational, not medical nutrition therapy.';
  if (/consisten|motivat|habit/.test(m)) return 'Small, repeatable targets work best: pick fixed days, schedule them like appointments, and aim for showing up rather than perfection.';
  if (/how|where|use|feature|help/.test(m)) return 'You can view your membership, attendance, workout and diet plans, log measurements, see payments and notifications from the sidebar.';
  return 'I can help with your membership, check-ins, workout and diet plans, progress, and fitness terms like reps, sets or PR.';
}
