import Link from 'next/link';
import { pageTester } from '@/lib/auth';
import { listResults, listSteps, listTesters } from '@/lib/db';
import { latestResults, summariseStep } from '@/lib/coverage';
import { OUTCOME_LABEL, when } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * The script. Every step, in order, with YOUR latest answer beside it and everyone's state.
 * Anyone may run any step on any day; the grouping only says where a step is done.
 */
export default async function ScriptPage() {
  const me = await pageTester();
  const [steps, results, testers] = await Promise.all([listSteps(), listResults(), listTesters()]);
  const latest = latestResults(results);

  const areas: string[] = [];
  for (const s of steps) if (!areas.includes(s.area)) areas.push(s.area);

  const mineDone = steps.filter((s) => {
    const r = latest.get(`${s.id}|${me.id}`);
    return r && r.outcome !== 'not_run';
  }).length;

  return (
    <>
      <h1>Supermarket test script</h1>
      <p className="lead">
        ZimChoice Supermarkets, store 5001. Run any step, in any order, on any day. Record the figures
        you actually saw — a tick proves nothing three weeks later. You have done {mineDone} of {steps.length}.
      </p>

      {areas.map((area) => (
        <section key={area}>
          <div className="section">{area}</div>
          <div className="steps">
            {steps.filter((s) => s.area === area).map((s) => {
              const mine = latest.get(`${s.id}|${me.id}`);
              const all = summariseStep(s.id, testers, latest);
              return (
                <Link key={s.id} href={`/steps/${s.id}`} className="step">
                  <span className="id">{s.id}</span>
                  <span>
                    <div className="t">{s.title}</div>
                    {s.expect_fail && <div className="warnline">Expected to fail today: {s.expect_fail}</div>}
                    {mine && <div className="sub">You: {OUTCOME_LABEL[mine.outcome]} · {when(mine.recorded_at)}</div>}
                  </span>
                  <span className="right">
                    <span className={`o ${mine ? mine.outcome : 'none'}`}>{mine ? `You: ${OUTCOME_LABEL[mine.outcome]}` : 'You: not yet'}</span>
                    <span className={`o ${all.state}`}>
                      {all.state === 'untouched' ? 'Nobody yet' : `${all.touchedBy} tested · ${OUTCOME_LABEL[all.state]}`}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
