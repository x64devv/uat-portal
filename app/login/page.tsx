import { supabasePublishableKey, supabaseSecretKey, supabaseUrl } from '@/lib/config';
import { sendLinkAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * ⚠ The setup problems are rendered here, plainly, rather than thrown. This is the one page an
 * unauthenticated visitor can reach, so it is the only place a misconfigured deployment can explain
 * itself. A stack trace on a blank screen sends somebody to check a firewall for an hour.
 */
function setupProblems(): string[] {
  const problems: string[] = [];
  for (const check of [supabaseUrl, supabasePublishableKey, supabaseSecretKey]) {
    try {
      check();
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  }
  return problems;
}

export default function Login({
  searchParams,
}: {
  searchParams?: { sent?: string; msg?: string; ok?: string; removed?: string; next?: string; from?: string };
}) {
  const problems = setupProblems();
  const sent = searchParams?.sent;
  const from = searchParams?.from;

  return (
    <main className="wrap narrow">
      <h1>Vantage UAT</h1>
      <p className="lead">
        The ZimChoice supermarket test script. Sign in with the address Wyne added you under, so
        every result you record carries your name.
      </p>

      {searchParams?.removed === '1' && (
        <div className="msg bad">
          You are signed in, but your address is not on the testers list. Ask Wyne to add you.
        </div>
      )}

      {problems.length > 0 && (
        <div className="msg bad">
          <strong>This deployment is not configured yet.</strong>
          <ul style={{ margin: '10px 0 0 18px', padding: 0 }}>
            {problems.map((p) => (
              <li key={p} style={{ marginBottom: 6 }}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {searchParams?.msg && (
        <div className={`msg ${searchParams.ok === '1' ? 'ok' : 'bad'}`}>{searchParams.msg}</div>
      )}

      {sent ? (
        <div className="card">
          <h3>Check your email</h3>
          <p className="body">
            A sign-in link is on its way to <strong>{sent}</strong>. It is good for one use and
            expires shortly — open it on this device, in this browser.
          </p>
          <p className="meta">
            Nothing arrived? Check spam, then try again. On a fresh Supabase project the built-in
            email sender is rate-limited to a few messages an hour.
          </p>

          {/* ⚠ The single most useful fact when a link lands on the wrong host. Supabase only
              honours this address if it is the project's Site URL or on its Redirect URLs list;
              otherwise it silently substitutes the Site URL, which starts life as localhost:3000. */}
          {from && (
            <p className="meta">
              The link was asked to return to <code>{from}/auth/callback</code>. If it takes you
              somewhere else — localhost, typically — that address is not on the allow-list, so
              Supabase substituted the project&apos;s Site URL. Add it under{' '}
              <strong>Authentication → URL Configuration → Redirect URLs</strong>.
            </p>
          )}

          <a className="ghostlink" href="/login">Use a different address</a>
        </div>
      ) : (
        <div className="card">
          <form action={sendLinkAction}>
            <label>Work email</label>
            <input
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@totalretailzw.com"
            />
            <input type="hidden" name="next" value={searchParams?.next ?? ''} />
            <p className="meta">
              We send a one-time link rather than asking for a password — there is no password here
              to be shared, reused or written on a note by the till.
            </p>
            <button style={{ marginTop: 14 }} disabled={problems.length > 0}>
              Send me a sign-in link
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
