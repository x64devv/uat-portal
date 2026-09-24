import { NextResponse, type NextRequest } from 'next/server';
import { authClient } from '@/lib/auth';
import { isBootstrapAdmin } from '@/lib/config';
import { testerByEmail } from '@/lib/db';

/**
 * Where the emailed sign-in link lands.
 *
 * `@supabase/ssr` signs in over PKCE, so the link comes back with `?code=…` and the session is
 * completed here, on the server. The code verifier is a cookie set when the link was requested,
 * which is why the link has to be opened in the same browser that asked for it.
 *
 * ⚠ Supabase may instead return `?error=…&error_description=…` — an expired or already-used link.
 * Handled explicitly: silently redirecting to `/` would bounce straight back to `/login` and read
 * as the link having done nothing at all.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  // ⚠ The pinned site URL wins: behind a proxy, or with `next start` on 127.0.0.1, the request's own
  // origin can differ from the host the session cookie was set on, and the user lands signed out.
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || request.nextUrl.origin;
  const code = searchParams.get('code');
  const next = searchParams.get('next');
  const errorDescription = searchParams.get('error_description') ?? searchParams.get('error');

  const toLogin = (msg: string) =>
    NextResponse.redirect(new URL(`/login?ok=0&msg=${encodeURIComponent(msg)}`, origin));

  if (errorDescription) {
    return toLogin(
      `That sign-in link did not work: ${errorDescription}. Links are good for one use and expire — ask for a fresh one.`,
    );
  }
  if (!code) {
    return toLogin('That link is missing its sign-in code. Ask for a fresh one.');
  }

  const supabase = authClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return toLogin(
      `That sign-in link did not work: ${error.message}. If you opened it in a different browser from the one that asked for it, request a new link and open it in the same browser.`,
    );
  }

  // ⚠⚠ Checked again, after the session exists. A link mailed to somebody who was on the list last
  // week must not sign them in today if they have since been taken off it. Their session is ended
  // here rather than left alive for the middleware to bounce on every request.
  const email = data.user?.email;
  const tester = email ? await testerByEmail(email) : null;
  const allowed = tester ? tester.active : isBootstrapAdmin(email);
  if (!allowed) {
    await supabase.auth.signOut();
    return toLogin(
      `${email ?? 'That address'} is not on the testers list for this portal. Ask Wyne to add you.`,
    );
  }

  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(new URL(dest, origin));
}
