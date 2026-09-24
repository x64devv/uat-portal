'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authClient } from '@/lib/auth';
import { isBootstrapAdmin } from '@/lib/config';
import { testerByEmail } from '@/lib/db';

/**
 * Where the emailed link should come back to.
 *
 * ⚠⚠ **Supabase decides this, not us.** `emailRedirectTo` is only honoured when it matches the
 * project's **Site URL** or one of its **Redirect URLs**; anything else is silently replaced with
 * the Site URL — which on a new project is `http://localhost:3000`. That is why a link clicked from
 * a production deployment can land on localhost while this code is entirely correct. The origin is
 * shown on the "check your email" screen so the mismatch is visible rather than mysterious.
 *
 * `NEXT_PUBLIC_SITE_URL` pins it, and is worth setting in production: without it the origin comes
 * from the request, so a link requested from a Vercel *preview* deployment comes back to that
 * preview's one-off URL — which will not be on the allow-list either.
 */
// ⚠ Not exported. A 'use server' module may only export async functions — every export becomes a
// callable server-action endpoint, so a plain helper here fails the build rather than quietly
// becoming a public endpoint. Kept local; nothing outside this file needs it.
function siteOrigin(): string {
  const pinned = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (pinned) return pinned.replace(/\/+$/, '');

  const h = headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Send a one-time sign-in link.
 *
 * ⚠⚠ **The testers list is checked before Supabase is asked to send anything.** Otherwise this is an
 * open endpoint that creates a Supabase user for any address a stranger types, and mails them from
 * your project — a spam relay wearing your name.
 *
 * ⚠ It reports the same thing either way. Telling an unknown address "you are not on the list"
 * confirms which addresses *are*; and a staff member who mistypes their own address is helped more
 * by "check your email, and check the spelling" than by a message they will read as a rejection.
 */
export async function sendLinkAction(form: FormData): Promise<void> {
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const next = String(form.get('next') ?? '').trim();

  if (!email || !email.includes('@')) {
    redirect(`/login?ok=0&msg=${encodeURIComponent('That does not look like an email address.')}`);
  }

  // ⚠ The testers table is the gate, checked before Supabase is asked to send anything.
  const tester = await testerByEmail(email);
  if (tester ? tester.active : isBootstrapAdmin(email)) {
    const callback = new URL('/auth/callback', siteOrigin());
    // ⚠ Only a path is ever carried through, never a full URL — see the open-redirect note in
    // middleware.ts. The callback re-checks it too.
    if (next.startsWith('/') && !next.startsWith('//')) callback.searchParams.set('next', next);

    const { error } = await authClient().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callback.toString(),
        // ⚠ Left at the default (true) on purpose: the testers list above is the gate, so the first
        // sign-in by a legitimate staff member should just work rather than needing a user to be
        // created by hand in the dashboard first.
        shouldCreateUser: true,
      },
    });

    if (error) {
      // A real fault — rate limit, SMTP not configured — is worth showing. It is about the
      // deployment, not about who the address belongs to.
      redirect(`/login?ok=0&msg=${encodeURIComponent(`Supabase could not send the link: ${error.message}`)}`);
    }
  }

  // The callback origin rides along so the next screen can show exactly what Supabase was asked to
  // send them back to — the one fact needed to diagnose a link that lands somewhere else.
  redirect(`/login?sent=${encodeURIComponent(email)}&from=${encodeURIComponent(siteOrigin())}`);
}
