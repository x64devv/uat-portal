import { redirect } from 'next/navigation';
import { pageTester } from '@/lib/auth';
import { listResults, listSteps, listTesters } from '@/lib/db';
import { latestResults, testerProgress } from '@/lib/coverage';
import { when } from '@/lib/format';
import { addTesterAction, setActiveAction, setAdminAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function TestersPage({ searchParams }: { searchParams?: { msg?: string; ok?: string } }) {
  const me = await pageTester();
  if (!me.admin) redirect('/');
  const [testers, steps, results] = await Promise.all([listTesters(), listSteps(), listResults()]);
  const latest = latestResults(results);

  return (
    <>
      <h1>Testers</h1>
      <p className="lead">
        Everyone runs every step. Add a person here and they can sign in with a one-time link sent to
        that address. Deactivating someone locks them out and keeps their results.
      </p>

      {searchParams?.msg && <div className={`msg ${searchParams.ok === '1' ? 'ok' : 'bad'}`}>{searchParams.msg}</div>}

      <form action={addTesterAction} className="card">
        <h3 style={{ fontFamily: 'inherit' }}>Add a tester</h3>
        <div className="grid">
          <div><label htmlFor="name">Name</label><input id="name" name="name" required placeholder="Tendai Moyo" /></div>
          <div><label htmlFor="email">Email</label><input id="email" name="email" type="email" required placeholder="tendai@totalretailzw.com" /></div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 14, color: '#141414' }}>
          <input type="checkbox" name="is_admin" style={{ width: 'auto' }} /> Administrator (sees the run board and can add testers)
        </label>
        <button style={{ marginTop: 14 }}>Add tester</button>
      </form>

      <div className="scroll">
        <table className="history">
          <thead><tr><th>Name</th><th>Progress</th><th>Last result</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {testers.map((t) => {
              const p = testerProgress(t.id, steps, latest);
              return (
                <tr key={t.id} style={t.active ? undefined : { opacity: 0.55 }}>
                  <td>
                    {t.name} {t.is_admin && <span className="o not_run">Admin</span>} {!t.active && <span className="o not_run">Deactivated</span>}
                    <div className="meta" style={{ marginTop: 0 }}>{t.email}</div>
                  </td>
                  <td>{p.started ? `${p.done} / ${p.total}` : <span className="o untouched">Not started</span>}</td>
                  <td>{when(p.lastAt)}</td>
                  <td>{when(t.created_at)}<div className="meta" style={{ marginTop: 0 }}>{t.added_by ?? ''}</div></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {t.id !== me.id && (
                      <>
                        <form action={setActiveAction} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="active" value={t.active ? '0' : '1'} />
                          <button className="ghost small">{t.active ? 'Deactivate' : 'Reactivate'}</button>
                        </form>{' '}
                        <form action={setAdminAction} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="is_admin" value={t.is_admin ? '0' : '1'} />
                          <button className="ghost small">{t.is_admin ? 'Remove admin' : 'Make admin'}</button>
                        </form>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
