/**
 * Who has run what — pure functions over the rows, so the rules can be tested without a database.
 *
 * ⚠⚠ The rule everything here protects: **a step nobody attempted must never look like a step that
 * passed, or like a step that is merely quiet.** "Untouched" is its own state, computed from the
 * absence of results, and it sorts first on the run board.
 *
 * ⚠ A tester's answer to a step is their LATEST result. Earlier results are history, not votes: a
 * tester who failed a step and then passed it after a fix has passed it.
 */

export const OUTCOMES = ['pass', 'fail', 'blocked', 'not_run'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type StepLite = { id: string; seq: number; active: boolean };
export type TesterLite = { id: string; active: boolean };
export type ResultLite = { id: string; step_id: string; tester_id: string; outcome: Outcome; recorded_at: string };

/** A step's state across everyone. Order matters: it is the run board's sort order. */
export const STEP_STATES = ['untouched', 'fail', 'blocked', 'not_run', 'pass'] as const;
export type StepState = (typeof STEP_STATES)[number];

/** Each tester's latest result per step, keyed `${step}|${tester}`. */
export function latestResults<R extends ResultLite>(results: R[]): Map<string, R> {
  const latest = new Map<string, R>();
  for (const r of results) {
    const k = `${r.step_id}|${r.tester_id}`;
    const have = latest.get(k);
    // ⚠ Compared as instants, not strings: Postgres may return "+00:00" and a browser "Z".
    if (!have || Date.parse(r.recorded_at) > Date.parse(have.recorded_at)) latest.set(k, r);
  }
  return latest;
}

export type StepSummary = {
  state: StepState;
  counts: Record<Outcome, number>;
  /** Active testers with a latest result on this step. */
  touchedBy: number;
  lastAt: string | null;
};

/**
 * ⚠ One failure anywhere makes the step FAIL, whatever else passed. A step that works on four
 * tills and fails on the fifth is a failing step — the fifth till is where the customer will be.
 */
export function summariseStep(stepId: string, testers: TesterLite[], latest: Map<string, ResultLite>): StepSummary {
  const counts: Record<Outcome, number> = { pass: 0, fail: 0, blocked: 0, not_run: 0 };
  let touchedBy = 0;
  let lastAt: string | null = null;
  for (const t of testers) {
    if (!t.active) continue;
    const r = latest.get(`${stepId}|${t.id}`);
    if (!r) continue;
    counts[r.outcome] += 1;
    touchedBy += 1;
    if (!lastAt || Date.parse(r.recorded_at) > Date.parse(lastAt)) lastAt = r.recorded_at;
  }
  const state: StepState =
    touchedBy === 0 ? 'untouched'
    : counts.fail > 0 ? 'fail'
    : counts.blocked > 0 ? 'blocked'
    : counts.pass > 0 ? 'pass'
    : 'not_run';
  return { state, counts, touchedBy, lastAt };
}

export type TesterProgress = {
  /** Active steps with a pass, fail or blocked from this tester — something was actually tried. */
  done: number;
  /** Active steps this tester has recorded anything against, including not_run. */
  touched: number;
  total: number;
  started: boolean;
  finished: boolean;
  lastAt: string | null;
};

/**
 * ⚠ "Finished" means every active step has a pass, fail or blocked from this person. A `not_run`
 * does not count as done — it is a tester telling you they did not do it.
 */
export function testerProgress(testerId: string, steps: StepLite[], latest: Map<string, ResultLite>): TesterProgress {
  let done = 0;
  let touched = 0;
  let lastAt: string | null = null;
  const active = steps.filter((s) => s.active);
  for (const s of active) {
    const r = latest.get(`${s.id}|${testerId}`);
    if (!r) continue;
    touched += 1;
    if (r.outcome !== 'not_run') done += 1;
    if (!lastAt || Date.parse(r.recorded_at) > Date.parse(lastAt)) lastAt = r.recorded_at;
  }
  return { done, touched, total: active.length, started: touched > 0, finished: active.length > 0 && done === active.length, lastAt };
}

/**
 * Checks a result before it is stored. Returns the problems, empty when it may be saved.
 *
 * ⚠⚠ A pass or a fail with no figures is refused. "Record the figure you actually saw, not a tick —
 * a tick proves nothing three weeks later" (TILL-PROOF-guide.md). Blocked and not-run need a note
 * saying why, because "blocked" with no reason is not something anybody can act on.
 */
export function resultProblems(
  outcome: string,
  fieldKeys: string[],
  figures: Record<string, string>,
  notes: string,
): string[] {
  const problems: string[] = [];
  if (!(OUTCOMES as readonly string[]).includes(outcome)) {
    problems.push('Choose pass, fail, blocked or not run.');
    return problems;
  }
  if (outcome === 'pass' || outcome === 'fail') {
    const missing = fieldKeys.filter((k) => !(figures[k] ?? '').trim());
    if (missing.length > 0) {
      problems.push(`Record every figure the step asks for — ${missing.length} ${missing.length === 1 ? 'is' : 'are'} empty. Write what you saw, even if it is "none" or "refused".`);
    }
  }
  if ((outcome === 'blocked' || outcome === 'not_run') && !notes.trim()) {
    problems.push(outcome === 'blocked' ? 'Say what blocked it.' : 'Say why it was not run.');
  }
  if (outcome === 'fail' && !notes.trim()) {
    problems.push('Say what went wrong.');
  }
  return problems;
}
