import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDateOnly, computeEndDate, membershipStatus, renewalStart, addMonths, dayKeyOf, ageFromDob } from '../../src/utils/dates.js';

const d = (s) => parseDateOnly(s);
const k = (x) => dayKeyOf(x);

test('1-month plan from 15 Jan ends 14 Feb (inclusive)', () => assert.equal(k(computeEndDate(d('2026-01-15'), 1, 'months')), '2026-02-14'));
test('month-end clamping: 31 Jan + 1 month', () => assert.equal(k(addMonths(d('2026-01-31'), 1)), '2026-02-28'));
test('leap year clamping', () => assert.equal(k(addMonths(d('2028-01-31'), 1)), '2028-02-29'));
test('annual plan from 1 Mar 2026 ends 28 Feb 2027', () => assert.equal(k(computeEndDate(d('2026-03-01'), 12, 'months')), '2027-02-28'));
test('day-based plan: 30 days from 1 Jan ends 30 Jan', () => assert.equal(k(computeEndDate(d('2026-01-01'), 30, 'days')), '2026-01-30'));
test('rejects zero/negative durations', () => { assert.throws(() => computeEndDate(d('2026-01-01'), 0, 'months')); assert.throws(() => computeEndDate(d('2026-01-01'), -2, 'days')); });
test('rejects impossible dates', () => { assert.throws(() => parseDateOnly('2026-02-30')); assert.throws(() => parseDateOnly('26-1-1')); });

test('status boundaries', () => {
  const m = { startDate: d('2026-01-01'), endDate: d('2026-01-31') };
  assert.equal(membershipStatus(m, d('2025-12-31'), 7), 'upcoming');
  assert.equal(membershipStatus(m, d('2026-01-10'), 7), 'active');
  assert.equal(membershipStatus(m, d('2026-01-24'), 7), 'expiring'); // exactly 7 days left
  assert.equal(membershipStatus(m, d('2026-01-23'), 7), 'active'); // 8 days left
  assert.equal(membershipStatus(m, d('2026-01-31'), 7), 'expiring'); // last valid day
  assert.equal(membershipStatus(m, d('2026-02-01'), 7), 'expired');
});

test('renewal before expiry continues from old end date (no lost days)', () => assert.equal(k(renewalStart(d('2026-01-31'), d('2026-01-25'))), '2026-02-01'));
test('renewal on last valid day continues next day', () => assert.equal(k(renewalStart(d('2026-01-31'), d('2026-01-31'))), '2026-02-01'));
test('renewal after expiry restarts today (no back-dating)', () => assert.equal(k(renewalStart(d('2026-01-31'), d('2026-03-05'))), '2026-03-05'));
test('fromToday policy ignores old end date', () => assert.equal(k(renewalStart(d('2026-03-31'), d('2026-03-01'), 'fromToday')), '2026-03-01'));
test('no previous membership starts today', () => assert.equal(k(renewalStart(null, d('2026-03-01'))), '2026-03-01'));
test('age from dob', () => assert.equal(ageFromDob('2000-06-15', new Date('2026-06-14T00:00:00Z')), 25));
