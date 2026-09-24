import { NextResponse, type NextRequest } from 'next/server';
import { authClient } from '@/lib/auth';

/**
 * ⚠ POST only. A sign-out on GET can be fired by any image tag or link on any other site, which
 * makes signing people out something a stranger can do to them.
 */
export async function POST(request: NextRequest) {
  await authClient().auth.signOut();
  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || request.nextUrl.origin), { status: 303 });
}
