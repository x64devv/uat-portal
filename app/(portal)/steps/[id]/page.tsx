import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageTester } from '@/lib/auth';
import { attachmentsFor, getStep, listResults, listSteps, listTesters, signedUrls } from '@/lib/db';
import { latestResults, summariseStep } from '@/lib/coverage';
import { OUTCOME_LABEL, when } from '@/lib/format';
import RecordForm from './RecordForm';

export const dynamic = 'force-dynamic';

export default async function StepPage({ params }: { params: { id: string } }) {
  await pageTester();
  const step = await getStep(params.id.toUpperCase());
  if (!step) notFound();

  const [results, testers, steps] = await Promise.all([listResults({ stepId: step.id }), listTesters(), listSteps()]);
  const byId = new Map(testers.map((t) => [t.id, t]));
  const summary = summariseStep(step.id, testers, latestResults(results));
  const newestFirst = [...results].reverse();
  const atts = await attachmentsFor(newestFirst.map((r) => r.id));
  const urls = await signedUrls(atts.map((a) => a.path));
  const labels = new Map(step.fields.map((f) => [f.key, f.label]));

  const i = steps.findIndex((s) => s.id === step.id);
  const prev = i > 0 ? steps[i - 1] : null;
  const next = i >= 0 && i < steps.length - 1 ? steps[i + 1] : null;

  return (
    <>
      <p className="meta" style={{ marginTop: 0 }}>
        <Link href="/">Script</Link> · {step.area}
        {prev && <> · <Link href={`/steps/${prev.id}`}>← {prev.id}</Link></>}
        {next && <> · <Link href={`/steps/${next.id}`}>{next.id} →</Link></>}
      </p>
      <h1>{step.id} · {step.title}</h1>
      <p className="lead">
        <span className={`o ${summary.state}`}>
          {summary.state === 'untouched' ? 'Nobody has run this yet' : `${summary.touchedBy} tester(s) · ${OUTCOME_LABEL[summary.state]}`}
        </span>
        {!step.active && <span className="o not_run" style={{ marginLeft: 8 }}>Removed from the script</span>}
      </p>

      <div className="card">
        <dl className="kv">
          <dt>Do</dt><dd>{step.instructions}</dd>
          <dt>Expect</dt><dd>{step.expect}</dd>
          {step.closes && (<><dt>Closes</dt><dd>{step.closes}</dd></>)}
          {step.expect_fail && (<><dt>Known</dt><dd className="warnline" style={{ marginTop: 0 }}>Expected to fail today: {step.expect_fail}. Record it as it happens.</dd></>)}
          {step.fields.length > 0 && (<><dt>Record</dt><dd>{step.fields.map((f) => f.label).join(' · ')}</dd></>)}
        </dl>
      </div>

      {step.active && <RecordForm stepId={step.id} fields={step.fields} />}

      <div className="section">Everyone&apos;s results, newest first</div>
      {newestFirst.length === 0 ? (
        <p className="meta">No results yet.</p>
      ) : (
        <div className="scroll">
          <table className="history">
            <thead>
              <tr><th>When</th><th>Tester</th><th>Outcome</th><th>Figures</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {newestFirst.map((r) => {
                const mine = atts.filter((a) => a.result_id === r.id);
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{when(r.recorded_at)}</td>
                    <td>{byId.get(r.tester_id)?.name ?? 'unknown'}</td>
                    <td><span className={`o ${r.outcome}`}>{OUTCOME_LABEL[r.outcome]}</span></td>
                    <td>
                      {Object.entries(r.figures ?? {}).map(([k, v]) => (
                        <div key={k}><span className="meta" style={{ marginTop: 0 }}>{labels.get(k) ?? k}:</span> {v}</div>
                      ))}
                    </td>
                    <td>
                      {r.notes && <div style={{ whiteSpace: 'pre-wrap' }}>{r.notes}</div>}
                      {r.issue_ref && <div className="meta">{r.issue_ref}</div>}
                      {mine.length > 0 && (
                        <div className="thumbs">
                          {mine.map((a) => {
                            const u = urls.get(a.path);
                            if (!u) return <span key={a.id} className="meta">{a.filename} (missing)</span>;
                            return a.content_type?.startsWith('image/') ? (
                              <a key={a.id} href={u} target="_blank" rel="noreferrer"><img src={u} alt={a.filename} /></a>
                            ) : (
                              <a key={a.id} href={u} target="_blank" rel="noreferrer">{a.filename}</a>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
