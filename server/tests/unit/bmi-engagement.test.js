import test from 'node:test';
import assert from 'node:assert/strict';
import { calcBmi, bmiBand } from '../../src/utils/bmi.js';
import { analyzeEngagement } from '../../src/utils/engagement.js';
import { parseDateOnly, addDays, dayKeyOf } from '../../src/utils/dates.js';
import { toCsv } from '../../src/utils/csv.js';

test('BMI formula', () => assert.equal(calcBmi(70, 175), 22.9));
test('BMI rejects impossible values', () => { assert.throws(() => calcBmi(5, 175)); assert.throws(() => calcBmi(70, 20)); assert.throws(() => calcBmi(NaN, 170)); });
test('BMI band wording is non-diagnostic', () => { assert.match(bmiBand(17), /Below/); assert.match(bmiBand(22), /Within/); assert.doesNotMatch(bmiBand(31), /obese|disease/i); });

const today = '2026-10-28';
const ago = (n) => dayKeyOf(addDays(parseDateOnly(today), -n));
const run = (offsets, joined = 120) => analyzeEngagement({ visitDayKeys: offsets.map(ago), todayKey: today, joinedKey: ago(joined) });

test('inactive: no visit for 12 days', () => assert.equal(run([12, 15, 16, 19, 20, 23, 26, 27, 30]).status, 'inactive'));
test('declining: 4/week baseline, 1/week recent', () => {
  const baseline = []; for (let w = 2; w < 6; w++) for (const o of [0, 1, 3, 5]) baseline.push(w * 7 + o);
  const r = run([2, 9, ...baseline]);
  assert.equal(r.status, 'declining');
  assert.ok(r.baselinePerWeek >= 3.5 && r.recentPerWeek <= 1.5);
});
test('engaged: steady 3/week', () => { const v = []; for (let w = 0; w < 6; w++) for (const o of [0, 2, 4]) v.push(w * 7 + o); assert.equal(run(v).status, 'engaged'); });
test('new member is not judged', () => assert.equal(run([], 5).status, 'new'));
test('never visited + old member = inactive with factual message', () => { const r = run([], 60); assert.equal(r.status, 'inactive'); assert.match(r.message, /No visits recorded/); });
test('light baseline (<2/week) never flagged declining', () => assert.equal(run([1, 3, 20, 30, 40]).status, 'engaged'));

test('CSV escapes quotes/commas and neutralises formulas', () => {
  const csv = toCsv([{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], [{ a: 'x,"y"', b: '=cmd|calc' }]);
  assert.equal(csv, 'A,B\r\n"x,""y""",\'=cmd|calc');
});
