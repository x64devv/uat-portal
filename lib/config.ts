/**
 * Every environment variable this portal needs, checked by shape before anything tries to use it.
 *
 * ⚠⚠ **The reason this file exists.** A placeholder left in `.env.local` does not announce itself.
 * `https://xxxxxxxxxxxx.supabase.co` is a domain that does not resolve, and the only thing the
 * screen showed for it was `TypeError: fetch failed` — which reads like a network fault, a firewall,
 * a Supabase outage, anything but "you did not paste the URL". Each guard below turns one of those
 * into a sentence naming the variable and what to put in it.
 */

export type Problem = string | null;

/* ---------------------------------------------------------------------------------------------
 * Supabase project URL
 * ------------------------------------------------------------------------------------------- */

export function urlProblem(url: string): Problem {
  if (/x{6,}/i.test(url)) {
    return 'That is still the placeholder from .env.example. Paste your real project URL from Supabase → Project Settings → Data API (it looks like https://abcdefghijklmnop.supabase.co).';
  }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return 'That is the Postgres connection string, not the project URL. This portal talks to the REST API — use the https://….supabase.co URL from Project Settings → Data API.';
  }
  // ⚠ http is allowed only for a loopback address. `supabase start` serves the local stack on
  // http://127.0.0.1:54321, so demanding https outright would reject a perfectly normal local
  // development setup. Anywhere else, plain http would send the secret key over the wire in clear.
  const loopback = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(url);
  if (!/^https:\/\//.test(url) && !loopback) {
    return url.startsWith('http://')
      ? `Plain http would send your secret key in clear — use https. (http is only accepted for a local Supabase on localhost or 127.0.0.1.) This one is "${url}".`
      : `A Supabase project URL starts with https:// — this one is "${url}".`;
  }
  if (/\/rest\/v1|\/auth\/v1/.test(url)) {
    return 'Drop the /rest/v1 (or /auth/v1) from the end — supabase-js appends that itself. Just the https://….supabase.co part.';
  }
  try {
    new URL(url);
  } catch {
    return `That is not a valid URL: "${url}".`;
  }
  return null;
}

/* ---------------------------------------------------------------------------------------------
 * API keys
 *
 * Supabase replaced the legacy JWT pair. Both work today; the legacy pair is deprecated at the end
 * of 2026, and projects created from November 2025 never had it.
 *
 *   anon          → publishable, `sb_publishable_…`   browser-safe, RLS applies    (used for Auth)
 *   service_role  → secret,      `sb_secret_…`        server only, bypasses RLS    (used for data)
 * ------------------------------------------------------------------------------------------- */

/** The `role` claim of a legacy JWT key, or null if this is not a decodable JWT. */
function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const role = JSON.parse(json)?.role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/**
 * ⚠⚠ **Why a secret key is checked and not just used.** RLS is on with no policies, so a
 * browser-safe key against the uat_ tables does not fail — it returns *zero rows, with no error*. On
 * screen that is indistinguishable from "nobody has tested anything yet", and the natural response is
 * to set the whole thing up again. The wrong kind of key has to be caught by its shape, here, before it
 * can produce a convincing empty page.
 */
export function secretKeyProblem(key: string): Problem {
  if (key.startsWith('sb_secret_')) return null;
  if (key.startsWith('sb_publishable_')) {
    return 'That is the publishable key (sb_publishable_…) — the browser-safe one. This table denies it, so you would get an empty list rather than an error. Use the secret key (sb_secret_…) from Project Settings → API Keys.';
  }
  const role = jwtRole(key);
  if (role === 'service_role') return null; // legacy, valid until end of 2026
  if (role === 'anon') {
    return 'That is the legacy anon key — the browser-safe one. This table denies it, so you would get an empty list rather than an error. Use the secret key (sb_secret_…) from Project Settings → API Keys.';
  }
  if (role) {
    return `That key carries the role "${role}". This portal needs the secret key (sb_secret_…), which carries service_role.`;
  }
  return 'That does not look like a Supabase API key. Copy the secret key (sb_secret_…) from Project Settings → API Keys.';
}

/**
 * ⚠ The opposite mistake, and the dangerous direction. This value is `NEXT_PUBLIC_`, so whatever is
 * in it is compiled into the browser bundle. A secret key here is not a misconfiguration, it is a
 * disclosure — anyone who opens devtools gets full read/write on the database.
 */
export function publishableKeyProblem(key: string): Problem {
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    return '⚠ That is the SECRET key, and this variable is NEXT_PUBLIC_ — it would be shipped to every browser that loads the page. Use the publishable key (sb_publishable_…) here, and rotate that secret key now that it has been in a public variable.';
  }
  if (key.startsWith('sb_publishable_')) return null;
  if (jwtRole(key) === 'anon') return null; // legacy, valid until end of 2026
  return 'That does not look like a publishable key. Copy the publishable key (sb_publishable_…) from Project Settings → API Keys.';
}

/* ---------------------------------------------------------------------------------------------
 * Readers. Each throws one sentence a person can act on.
 * ------------------------------------------------------------------------------------------- */

function read(name: string, value: string | undefined, check: (v: string) => Problem, hint: string): string {
  if (!value || !value.trim()) throw new Error(`${name} is not set. ${hint}`);
  const v = value.trim();
  const problem = check(v);
  if (problem) throw new Error(`${name} looks wrong. ${problem}`);
  return v;
}

export function supabaseUrl(): string {
  return read(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    urlProblem,
    'Supabase → Project Settings → Data API → Project URL.',
  );
}

export function supabaseSecretKey(): string {
  // ⚠ The legacy name is still read so an unmigrated project keeps working.
  return read(
    'SUPABASE_SECRET_KEY',
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    secretKeyProblem,
    'Supabase → Project Settings → API Keys → secret key.',
  );
}

export function supabasePublishableKey(): string {
  return read(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    publishableKeyProblem,
    'Supabase → Project Settings → API Keys → publishable key. This one is used for signing in, and is safe in the browser.',
  );
}

/* ---------------------------------------------------------------------------------------------
 * Who runs the portal
 * ------------------------------------------------------------------------------------------- */

/**
 * The administrators named in the environment — Wyne, to begin with.
 *
 * ⚠ Testers are NOT listed here; they live in the `uat_testers` table and an administrator adds them
 * on the Testers page. This variable exists so the very first sign-in can happen before that table
 * has anyone in it. An address on this list is let in and made an administrator on first sign-in.
 *
 * ⚠ Empty means no bootstrap administrator. That is safe (nobody new gets in) but it means the
 * table must already hold an active administrator, or nobody can add testers.
 */
export function adminEmails(): string[] {
  const raw = process.env.PORTAL_ADMIN_EMAILS ?? '';
  return raw
    .split(/[,\s;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isBootstrapAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}
