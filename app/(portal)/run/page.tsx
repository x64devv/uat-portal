import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageTester } from '@/lib/auth';
import { listResults, listSteps, listTesters } from '@/lib/db';
import { STEP_STATES, latestResults, summariseStep, testerProgress } from '@/lib/coverage';
import { OUTCOME_LABEL, when } from '@/lib/format';

export const dynamic = 'force-dynamic';

const CELL: Record<string, string> = { pass: '✓', fail: '✗', blocked: 'B', not_run: '–' };

/**
 * The run, for Wyne. Ordered by danger: steps nobody has touched first, then failures, then blocks,
 * then people who have not started.
 *
 * ⚠⚠ An untouched step is the most dangerous row on this board. It does not fail and it does not
 * complain; it just is not there. So it is counted at the top, listed first, and drawn as an empty
 * red-edged cell in the matrix — never as a blank.
 */
export default async function RunPage() {
  const me = await pageTester();
  if (!me.admin) redirect('/');

  const [steps, results, allTesters] = await Promise.all([listSteps(), listResults(), listTesters()]);
  const testers = allTesters.filter((t) => t.active);
  const latest = latestResults(results);
  const summaries = new Map(steps.map((s) => [s.id, summariseStep(s.id, testers, latest)]));
  const progress = new Map(testers.map((t) => [t.id, testerProgress(t.id, steps, latest)]));
  const byName = new Map(allTesters.map((t) => [t.id, t.name]));

  const untouched = steps.filter((s) => summaries.get(s.id)!.state === 'untouched');
  const failing = steps.filter((s) => summaries.get(s.id)!.state === 'fail');
  const blocked = steps.filter((s) => summaries.get(s.id)!.state === 'blocked');
  const notStarted = testers.filter((t) => !progress.get(t.id)!.started);
  const finished = testers.filter((t) => progress.get(t.id)!.finished);

  // The latest fail/blocked result per tester for a step — the rows Wyne acts on.
  const openRows = (stepId: string, outcome: 'fail' | 'blocked') =>
    testers.map((t) => latest.get(`${stepId}|${t.id}`)).filter((r) => r && r.outcome === outcome);

  const counts = Object.fromEntries(STEP_STATES.map((st) => [st, steps.filter((s) => summaries.get(s.id)!.state === st).length]));

  return (
    <>
      <div className="row">
        <div>
          <h1>Run board</h1>
          <p className="lead">{steps.length} steps · {testers.length} active testers · {results.length} results recorded</p>
        </div>
        <a className="ghostlink" href="/export">Download all results (CSV)</a>
      </div>

      <div className="stats">
        <div className={`stat ${untouched.length ? 'alarm' : ''}`}><div className="n">{untouched.length}</div><div className="l">Steps nobody has run</div></div>
        <div className={`stat ${failing.length ? 'alarm' : ''}`}><div className="n">{failing.length}</div><div className="l">Steps failing</div></div>
        <div className="stat"><div className="n">{blocked.length}</div><div className="l">Steps blocked</div></div>
        <div className="stat"><div className="n">{counts.pass}</div><div className="l">Steps passing</div></div>
        <div className={`stat ${notStarted.length ? 'alarm' : ''}`}><div className="n">{notStarted.length}</div><div className="l">Testers not started</div></div>
        <div className="stat"><div className="n">{finished.length}</div><div className="l">Testers finished</div></div>
      </div>

      <div className="section">Steps nobody has run ({untouched.length})</div>
      {untouched.length === 0 ? <p className="meta">Every step has at least one result.</p> : (
        <div className="steps">
          {untouched.map((s) => (
            <Link key={s.id} href={`/steps/${s.id}`} className="step">
              <span className="id">{s.id}</span>
              <span><div className="t">{s.title}</div><div className="sub">{s.area}</div></span>
              <span className="right"><span className="o untouched">Nobody yet</span></span>
            </Link>
          ))}
        </div>
      )}

      {([['Failing', failing, 'fail'], ['Blocked', blocked, 'blocked']] as const).map(([label, list, outcome]) => (
        <section key={label}>
          <div className="section">{label} ({list.length})</div>
          {list.length === 0 ? <p className="meta">None.</p> : (
            <div className="scroll">
              <table className="history">
                <thead><tr><th>Step</th><th>Tester</th><th>When</th><th>Notes</th><th>Issue</th></tr></thead>
                <tbody>
                  {list.flatMap((s) => openRows(s.id, outcome).map((r) => (
                    <tr key={r!.id}>
                      <td><Link href={`/steps/${s.id}`}>{s.id}</Link> {s.title}</td>
                      <td>{byName.get(r!.tester_id)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{when(r!.recorded_at)}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>{r!.notes}</td>
                      <td>{r!.issue_ref ?? <span className="meta">none</span>}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <div className="section">Testers</div>
      <div className="scroll">
        <table className="history">
          <thead><tr><th>Tester</th><th>Done</th><th>Not run</th><th>Not started</th><th>Last result</th><th></th></tr></thead>
          <tbody>
            {testers.map((t) => {
              const p = progress.get(t.id)!;
              return (
                <tr key={t.id}>
                  <td>{t.name}<div className="meta" style={{ marginTop: 0 }}>{t.email}</div></td>
                  <td>{p.done} / {p.total}</td>
                  <td>{p.touched - p.done}</td>
                  <td>{p.total - p.touched}</td>
                  <td>{when(p.lastAt)}</td>
                  <td>{!p.started ? <span className="o untouched">Not started</span> : p.finished ? <span className="o pass">Finished</span> : <span className="o not_run">In progress</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="section">Everyone × every step</div>
      <div className="legend">
        <span><span className="cell pass">✓</span> pass</span>
        <span><span className="cell fail">✗</span> fail</span>
        <span><span className="cell blocked">B</span> blocked</span>
        <span><span className="cell not_run">–</span> not run</span>
        <span><span className="cell none" style={{ border: '1px dashed #c0261a' }}>·</span> no result</span>
      </div>
      <div className="scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th className="name">Tester</th>
              {steps.map((s) => <th key={s.id}><Link href={`/steps/${s.id}`}>{s.id}</Link></th>)}
            </tr>
          </thead>
          <tbody>
            {testers.map((t) => (
              <tr key={t.id}>
                <td className="name">{t.name}</td>
                {steps.map((s) => {
                  const r = latest.get(`${s.id}|${t.id}`);
                  return (
                    <td key={s.id} title={r ? `${OUTCOME_LABEL[r.outcome]} · ${when(r.recorded_at)}` : 'No result'}>
                      <Link href={`/steps/${s.id}`}>
                        <span className={`cell ${r ? r.outcome : 'none'}`}>{r ? CELL[r.outcome] : '·'}</span>
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
