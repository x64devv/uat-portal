// npm test   (node --test with type stripping; `npm run typecheck` checks the types)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  latestResults, summariseStep, testerProgress, resultProblems,
  type ResultLite, type StepLite, type TesterLite,
} from '../lib/coverage.ts';

const steps: StepLite[] = [
  { id: 'T1', seq: 1, active: true },
  { id: 'T2', seq: 2, active: true },
  { id: 'OLD', seq: 3, active: false },
];
const ann: TesterLite = { id: 'ann', active: true };
const ben: TesterLite = { id: 'ben', active: true };
const gone: TesterLite = { id: 'gone', active: false };

let n = 0;
const r = (step_id: string, tester_id: string, outcome: ResultLite['outcome'], recorded_at: string): ResultLite =>
  ({ id: String(++n), step_id, tester_id, outcome, recorded_at });

test('a step nobody touched is untouched, not passing and not quiet', () => {
  const latest = latestResults([r('T1', 'ann', 'pass', '2026-09-25T08:00:00Z')]);
  const s = summariseStep('T2', [ann, ben], latest);
  assert.equal(s.state, 'untouched');
  assert.equal(s.touchedBy, 0);
});

test('a tester\'s latest result is their answer, compared as instants', () => {
  const latest = latestResults([
    r('T1', 'ann', 'fail', '2026-09-25T08:00:00Z'),
    r('T1', 'ann', 'pass', '2026-09-25T10:00:00+02:00'), // 08:00Z — same instant, not later
    r('T1', 'ann', 'pass', '2026-09-25T09:00:00Z'),
  ]);
  assert.equal(latest.get('T1|ann')?.outcome, 'pass');
  assert.equal(latest.get('T1|ann')?.recorded_at, '2026-09-25T09:00:00Z');
});

test('one failure anywhere fails the step', () => {
  const latest = latestResults([
    r('T1', 'ann', 'pass', '2026-09-25T08:00:00Z'),
    r('T1', 'ben', 'fail', '2026-09-25T08:05:00Z'),
  ]);
  assert.equal(summariseStep('T1', [ann, ben], latest).state, 'fail');
});

test('blocked outranks pass; only not_run reads as not_run', () => {
  const a = latestResults([r('T1', 'ann', 'pass', '2026-09-25T08:00:00Z'), r('T1', 'ben', 'blocked', '2026-09-25T08:00:00Z')]);
  assert.equal(summariseStep('T1', [ann, ben], a).state, 'blocked');
  const b = latestResults([r('T1', 'ann', 'not_run', '2026-09-25T08:00:00Z')]);
  assert.equal(summariseStep('T1', [ann, ben], b).state, 'not_run');
});

test('an inactive tester\'s results do not count toward a step', () => {
  const latest = latestResults([r('T1', 'gone', 'pass', '2026-09-25T08:00:00Z')]);
  assert.equal(summariseStep('T1', [ann, gone], latest).state, 'untouched');
});

test('progress: not_run is touched but not done; inactive steps are not counted', () => {
  const latest = latestResults([
    r('T1', 'ann', 'pass', '2026-09-25T08:00:00Z'),
    r('T2', 'ann', 'not_run', '2026-09-25T08:10:00Z'),
    r('OLD', 'ann', 'pass', '2026-09-25T08:20:00Z'),
  ]);
  const p = testerProgress('ann', steps, latest);
  assert.deepEqual([p.done, p.touched, p.total, p.started, p.finished], [1, 2, 2, true, false]);
  assert.equal(p.lastAt, '2026-09-25T08:10:00Z');
  const q = testerProgress('ben', steps, latest);
  assert.deepEqual([q.started, q.finished], [false, false]);
});

test('progress: finished only when every active step has pass, fail or blocked', () => {
  const latest = latestResults([
    r('T1', 'ann', 'fail', '2026-09-25T08:00:00Z'),
    r('T2', 'ann', 'blocked', '2026-09-25T08:10:00Z'),
  ]);
  assert.equal(testerProgress('ann', steps, latest).finished, true);
});

test('a pass with no figures is refused', () => {
  const p = resultProblems('pass', ['gross', 'change'], { gross: '8.40', change: ' ' }, '');
  assert.equal(p.length, 1);
  assert.match(p[0], /1 is empty/);
  assert.deepEqual(resultProblems('pass', ['gross'], { gross: '8.40' }, ''), []);
});

test('fail needs figures and a note; blocked and not_run need a note only', () => {
  assert.equal(resultProblems('fail', ['gross'], { gross: '1' }, '').length, 1);
  assert.deepEqual(resultProblems('blocked', ['gross'], {}, 'no printer'), []);
  assert.equal(resultProblems('blocked', ['gross'], {}, ' ').length, 1);
  assert.equal(resultProblems('not_run', [], {}, '').length, 1);
  assert.equal(resultProblems('maybe', [], {}, 'x').length, 1);
});
