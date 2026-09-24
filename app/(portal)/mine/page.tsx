import Link from 'next/link';
import { pageTester } from '@/lib/auth';
import { listResults, listSteps } from '@/lib/db';
import { latestResults, testerProgress } from '@/lib/coverage';
import { OUTCOME_LABEL, when } from '@/lib/format';

export const dynamic = 'force-dynamic';

/** What this tester still has to do. Everyone runs every step. */
export default async function MinePage() {
  const me = await pageTester();
  const [steps, results] = await Promise.all([listSteps(), listResults({ testerId: me.id })]);
  const latest = latestResults(results);
  const p = testerProgress(me.id, steps, latest);

  const todo = steps.filter((s) => !latest.get(`${s.id}|${me.id}`));
  const notRun = steps.filter((s) => latest.get(`${s.id}|${me.id}`)?.outcome === 'not_run');
  const done = steps.filter((s) => {
    const r = latest.get(`${s.id}|${me.id}`);
    return r && r.outcome !== 'not_run';
  });

  const list = (items: typeof steps) => (
    <div className="steps">
      {items.map((s) => {
        const r = latest.get(`${s.id}|${me.id}`);
        return (
          <Link key={s.id} href={`/steps/${s.id}`} className="step">
            <span className="id">{s.id}</span>
            <span><div className="t">{s.title}</div><div className="sub">{s.area}</div></span>
            <span className="right">
              {r ? <span className={`o ${r.outcome}`}>{OUTCOME_LABEL[r.outcome]} · {when(r.recorded_at)}</span> : <span className="o none">Not yet</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      <h1>My progress</h1>
      <p className="lead">
        {p.finished ? 'Every step has a result from you.' : `${p.done} of ${p.total} done. ${todo.length} not started, ${notRun.length} marked not run.`}
      </p>
      {todo.length > 0 && (<><div className="section">Not started ({todo.length})</div>{list(todo)}</>)}
      {notRun.length > 0 && (<><div className="section">Marked not run ({notRun.length})</div>{list(notRun)}</>)}
      {done.length > 0 && (<><div className="section">Done ({done.length})</div>{list(done)}</>)}
    </>
  );
}
