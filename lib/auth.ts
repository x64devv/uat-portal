import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isBootstrapAdmin, supabasePublishableKey, supabaseUrl } from './config';
import { db, testerByEmail, type Tester } from './db';

/**
 * Supabase Auth, server side, with the **publishable** key — auth runs as the person signing in.
 * ⚠ Always `getUser()`, never `getSession()`, for anything that decides access: `getSession()`
 * believes the cookie, `getUser()` asks Supabase whether the token is real.
 */
export function authClient() {
  const store = cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Read-only in a Server Component; the middleware refreshes the session anyway.
        }
      },
    },
  });
}

export type Me = Tester & { admin: boolean };

/**
 * The signed-in, **active** tester — or null.
 *
 * ⚠⚠ The `uat_testers` row is the gate, and it is read on every request. Deactivating somebody on
 * the Testers page locks them out on their next click, not whenever their session expires.
 *
 * An address on PORTAL_ADMIN_EMAILS with no row yet gets one here, as an administrator — that is how
 * the first person gets in before anyone has been added. A bootstrap address whose row has been
 * DEACTIVATED stays out: the row wins, so an administrator can be removed without a redeploy.
 */
export async function currentTester(): Promise<Me | null> {
  const { data, error } = await authClient().auth.getUser();
  const email = data.user?.email?.trim().toLowerCase();
  if (error || !email) return null;

  let t = await testerByEmail(email);
  if (!t && isBootstrapAdmin(email)) {
    const { data: row, error: insErr } = await db()
      .from('uat_testers')
      .insert({ email, name: email.split('@')[0], is_admin: true, added_by: 'PORTAL_ADMIN_EMAILS' })
      .select('*')
      .single();
    // ⚠ The layout and the page render in PARALLEL, so the very first request inserts twice and one
    // insert loses on the unique index. The loser reads the winner's row back instead of failing.
    t = row as Tester | null;
    for (let i = 0; !t && insErr && i < 5; i++) {
      t = await testerByEmail(email);
      if (!t) await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!t || !t.active) return null;
  return { ...t, admin: t.is_admin || isBootstrapAdmin(email) };
}

/**
 * ⚠⚠ Every server action and route handler calls this first. A server action is a POST endpoint,
 * reachable without ever rendering the page that would have checked.
 */
export async function requireTester(): Promise<Me> {
  const me = await currentTester();
  if (!me) throw new Error('You are not signed in, or you are no longer on the testers list.');
  return me;
}

/**
 * For pages: the tester, or a redirect to sign-in. ⚠ A page must not rely on the layout's check —
 * Next renders the layout and the page in parallel, so the page runs whether or not the layout
 * redirected. Throwing here would show an error screen; redirecting says what happened.
 */
export async function pageTester(): Promise<Me> {
  const me = await currentTester();
  if (!me) redirect('/login?removed=1');
  return me;
}

export async function requireAdmin(): Promise<Me> {
  const me = await requireTester();
  if (!me.admin) throw new Error('Only an administrator can do that.');
  return me;
}
