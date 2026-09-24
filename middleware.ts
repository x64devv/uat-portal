import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * The first gate: signed in at all. Deny by default — everything is protected unless listed here.
 *
 * ⚠ Whether the person is an ACTIVE TESTER is decided by the portal layout and by every server
 * action and route handler (`requireTester`), against the database, on every request. This file
 * only makes sure nobody reaches those without a verified Supabase session, and keeps that session
 * cookie fresh.
 */
const PUBLIC = ['/login', '/auth/callback', '/auth/signout'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  // ⚠ A misconfigured deployment must fail closed: send everyone to /login, which explains it.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return PUBLIC.some((p) => pathname.startsWith(p)) ? response : NextResponse.redirect(new URL('/login', request.url));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (PUBLIC.some((p) => pathname.startsWith(p))) return response;

  if (!user?.email) {
    const to = new URL('/login', request.url);
    // ⚠ Only a path, never a full URL — a full URL here is an open redirect.
    if (pathname !== '/') to.searchParams.set('next', pathname);
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
