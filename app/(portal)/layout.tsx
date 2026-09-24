import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentTester } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * ⚠⚠ The tester gate for every page in the portal. The middleware only knows somebody is signed in;
 * this reads their row, on every request, so a deactivated tester is out on their next click.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const me = await currentTester();
  if (!me) redirect('/login?removed=1');

  return (
    <main className="wrap">
      <div className="top">
        <div className="nav">
          <Link className="brand" href="/">Vantage UAT</Link>
          <Link href="/">Script</Link>
          <Link href="/mine">My progress</Link>
          {me.admin && <Link href="/run">Run board</Link>}
          {me.admin && <Link href="/testers">Testers</Link>}
        </div>
        <div className="whoami">
          <span className="meta">{me.name} · {me.email}</span>
          <form action="/auth/signout" method="post">
            <button className="ghost small">Sign out</button>
          </form>
        </div>
      </div>
      {children}
    </main>
  );
}
