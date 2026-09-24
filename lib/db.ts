import { createClient } from '@supabase/supabase-js';
import { supabaseSecretKey, supabaseUrl } from './config';
import type { Outcome } from './coverage';

/**
 * Supabase, server-side only, with the **secret** key.
 *
 * ⚠⚠ This key bypasses RLS and must never reach the browser. Every table has RLS on and no
 * policies, so only this key reads anything. Every call here runs in a server component, a server
 * action or a route handler, after `requireTester()`.
 */
export function db() {
  return createClient(supabaseUrl(), supabaseSecretKey(), { auth: { persistSession: false } });
}

export const BUCKET = 'uat-evidence';

export type Tester = {
  id: string;
  email: string;
  name: string;
  is_admin: boolean;
  active: boolean;
  added_by: string | null;
  created_at: string;
};

export type Field = { key: string; label: string };

export type Step = {
  id: string;
  seq: number;
  area: string;
  title: string;
  instructions: string;
  expect: string;
  closes: string | null;
  expect_fail: string | null;
  fields: Field[];
  active: boolean;
};

export type Result = {
  id: string;
  step_id: string;
  tester_id: string;
  outcome: Outcome;
  figures: Record<string, string>;
  notes: string | null;
  issue_ref: string | null;
  recorded_at: string;
};

export type Attachment = {
  id: string;
  result_id: string;
  path: string;
  filename: string;
  content_type: string | null;
  bytes: number | null;
};

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function testerByEmail(email: string): Promise<Tester | null> {
  // ⚠ ilike on an escaped value, so the match is case-insensitive without letting % or _ in an
  // address act as wildcards. The unique index is on lower(email) for the same reason.
  const escaped = email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = must(await db().from('uat_testers').select('*').ilike('email', escaped).limit(1));
  return (rows as Tester[])[0] ?? null;
}

export async function listTesters(): Promise<Tester[]> {
  return must(await db().from('uat_testers').select('*').order('name')) as Tester[];
}

export async function listSteps(includeInactive = false): Promise<Step[]> {
  let q = db().from('uat_steps').select('*').order('seq');
  if (!includeInactive) q = q.eq('active', true);
  return must(await q) as Step[];
}

export async function getStep(id: string): Promise<Step | null> {
  const rows = must(await db().from('uat_steps').select('*').eq('id', id).limit(1)) as Step[];
  return rows[0] ?? null;
}

/**
 * Every result, oldest first. ⚠ Paged: PostgREST caps a response (1,000 rows by default), and a
 * silently truncated list would make the newest results — the ones that matter — vanish.
 */
export async function listResults(filter?: { stepId?: string; testerId?: string }): Promise<Result[]> {
  const out: Result[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = db().from('uat_results').select('*').order('recorded_at').order('id').range(from, from + PAGE - 1);
    if (filter?.stepId) q = q.eq('step_id', filter.stepId);
    if (filter?.testerId) q = q.eq('tester_id', filter.testerId);
    const page = must(await q) as Result[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

export async function attachmentsFor(resultIds: string[]): Promise<Attachment[]> {
  if (resultIds.length === 0) return [];
  const out: Attachment[] = [];
  // Chunked so a long id list does not overflow the request URL.
  for (let i = 0; i < resultIds.length; i += 100) {
    const chunk = resultIds.slice(i, i + 100);
    out.push(...(must(await db().from('uat_attachments').select('*').in('result_id', chunk)) as Attachment[]));
  }
  return out;
}

/** Short-lived links for screenshots. The bucket is private; nothing is ever publicly addressable. */
export async function signedUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data, error } = await db().storage.from(BUCKET).createSignedUrls(paths, 60 * 30);
  if (error) throw new Error(error.message);
  for (const d of data ?? []) if (d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  return map;
}
