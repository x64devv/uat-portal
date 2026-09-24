# Vantage UAT portal

The ZimChoice supermarket test script, handed to a group of testers, with every result recorded
under the tester's name and the time. Next.js 14 (App Router) · Supabase · deploys to Vercel —
the same shape as `wa-portal`.

**Agreed 24 Sep 2026:** everyone tests everything; anyone may run any step on any day; one account
per person, added by an administrator on the Testers page. The script is the 52 steps from §6 of
the gap analysis (https://claude.ai/code/artifact/6e2826f5-2446-4b96-b081-0b8592719481).

## What it does

| Page | Who | What |
|---|---|---|
| Script `/` | everyone | All 52 steps, your latest answer and everyone's state beside each |
| Step `/steps/T14` | everyone | Do / Expect / Record; your result form; everyone's results, newest first, with screenshots |
| My progress `/mine` | everyone | What you have not started, marked not run, and done |
| Run board `/run` | admin | Steps nobody has run (first), failing, blocked, testers' progress, a tester × step matrix, CSV export |
| Testers `/testers` | admin | Add a tester, deactivate, make admin |

Rules the code enforces (`lib/coverage.ts`, tested in `tests/coverage.test.ts`):

- **A step nobody has run is its own state** — never shown as passing or as quiet. It is counted
  first on the run board and drawn as a red-edged empty cell in the matrix.
- A tester's answer to a step is their **latest** result; earlier ones stay as history. Results are
  append-only; nothing edits or deletes one.
- **One failure anywhere fails the step.** Then blocked, then pass; `not run` only if nothing else.
- **A pass or fail must carry every figure the step asks for.** Fail, blocked and not run need a note.
- Deactivating a tester locks them out on their next click; their results stay, and stop counting
  on the board.
- Who and when come from the session and the database clock, never from the form.

## Setup

1. **Supabase** — create a new project. SQL Editor → run `supabase/schema.sql`, then
   `supabase/seed.sql`. Both are safe to run again. The schema also creates the private
   `uat-evidence` storage bucket for screenshots (10 MB a file; PNG, JPEG, WebP, GIF, PDF).
2. **Sign-in** — Authentication → Providers → Email on. URL Configuration → **Site URL** = the
   production origin, and **Redirect URLs** = `http://localhost:3000/**` and the production origin
   with `/**`. ⚠ An unlisted redirect is silently replaced with the Site URL.
   ⚠ The built-in email sender allows only a few messages an hour. For a room of testers signing in
   at once, set up custom SMTP (Authentication → Emails → SMTP) first.
3. **Environment** — see `.env.example` (five variables). Locally: copy it to `.env.local`.
4. **Vercel** — import the repo, set the same variables, deploy.
5. Sign in with an address on `PORTAL_ADMIN_EMAILS`, open **Testers**, and add everyone.

## Changing the script

Edit `script/steps.json`, run `npm run seed`, then run `supabase/seed.sql` again. Steps are
upserted by id; a step removed from the JSON leaves the script but keeps its results.

## Checks

- `npm test` — the coverage rules (9 tests). Each rule was mutated and its tests went red by name.
- `npm run typecheck`, `npm run build`.
- `tests/e2e-local.mjs` — a browser run against a **local** Supabase (`npx supabase start`) and
  `next start` on 127.0.0.1:3000: real emailed sign-in links through Mailpit, adding testers, a
  refused figure-less pass, a result with a screenshot, a tester's failure, the tester locked out of
  admin pages and the export, the run board's counts, the CSV, a stranger getting no email,
  deactivation, and phone width. ⚠ It writes to whatever database it points at — never production.
