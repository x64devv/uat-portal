'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { requireTester } from '@/lib/auth';
import { BUCKET, db, getStep } from '@/lib/db';
import { resultProblems } from '@/lib/coverage';

const MAX_FILES = 6;
const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']);

export type Upload = { path: string; token: string; filename: string };
export type ActionResult = { ok: true } | { ok: false; problems: string[] };

function safeName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80);
  return cleaned || 'file';
}

/**
 * Signed upload slots for screenshots, one per file.
 *
 * ⚠ Files go from the browser straight to Storage, not through this action. A server action body is
 * capped (1 MB by default, 4.5 MB on Vercel), and a phone screenshot is often bigger than that — so
 * routing files through here would fail on exactly the evidence people most want to attach.
 *
 * ⚠ The path starts with the tester's own id, and recordResult refuses any path that does not. A
 * tester cannot attach somebody else's upload to their result.
 */
export async function prepareUploads(
  stepId: string,
  files: { name: string; type: string; size: number }[],
): Promise<{ ok: true; uploads: Upload[] } | { ok: false; problems: string[] }> {
  const me = await requireTester();
  if (!(await getStep(stepId))) return { ok: false, problems: [`There is no step ${stepId}.`] };
  if (files.length > MAX_FILES) return { ok: false, problems: [`At most ${MAX_FILES} files per result.`] };
  const problems: string[] = [];
  for (const f of files) {
    if (!TYPES.has(f.type)) problems.push(`${f.name}: only PNG, JPEG, WebP, GIF or PDF.`);
    if (f.size > MAX_BYTES) problems.push(`${f.name}: larger than 10 MB.`);
  }
  if (problems.length) return { ok: false, problems };

  const uploads: Upload[] = [];
  for (const f of files) {
    const path = `${me.id}/${stepId}/${randomUUID()}-${safeName(f.name)}`;
    const { data, error } = await db().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, problems: [`Could not prepare an upload: ${error?.message ?? 'no slot returned'}`] };
    uploads.push({ path: data.path, token: data.token, filename: f.name });
  }
  return { ok: true, uploads };
}

/**
 * Store one result. ⚠ Append-only — re-running a step adds a row; the latest row is the answer.
 * Who and when are taken from the session and the database clock, never from the form.
 */
export async function recordResult(input: {
  stepId: string;
  outcome: string;
  figures: Record<string, string>;
  notes: string;
  issueRef: string;
  files: { path: string; filename: string; type: string; size: number }[];
}): Promise<ActionResult> {
  const me = await requireTester();
  const step = await getStep(input.stepId);
  if (!step || !step.active) return { ok: false, problems: [`Step ${input.stepId} is not in the script.`] };

  // Only the step's own fields are kept, trimmed; anything else in the payload is dropped.
  const keys = step.fields.map((f) => f.key);
  const figures: Record<string, string> = {};
  for (const k of keys) {
    const v = String(input.figures?.[k] ?? '').trim();
    if (v) figures[k] = v.slice(0, 500);
  }
  const notes = String(input.notes ?? '').trim().slice(0, 4000);
  const issueRef = String(input.issueRef ?? '').trim().toUpperCase().slice(0, 40);

  const problems = resultProblems(input.outcome, keys, figures, notes);
  if (issueRef && !/^[A-Z][A-Z0-9]{1,9}-\d+$/.test(issueRef)) {
    problems.push('An issue reference looks like VPOS-90.');
  }

  const files = (input.files ?? []).slice(0, MAX_FILES);
  for (const f of files) {
    if (!f.path.startsWith(`${me.id}/${step.id}/`) || f.path.includes('..')) {
      problems.push(`${f.filename}: that upload does not belong to you.`);
    }
  }
  if (problems.length) return { ok: false, problems };

  // ⚠ Confirm each file really landed before the result points at it. A result listing a screenshot
  // that is not there reads as evidence that was lost, which is worse than no screenshot.
  for (const f of files) {
    const dir = f.path.slice(0, f.path.lastIndexOf('/'));
    const name = f.path.slice(f.path.lastIndexOf('/') + 1);
    const { data, error } = await db().storage.from(BUCKET).list(dir, { search: name, limit: 1 });
    if (error || !data?.some((o) => o.name === name)) {
      return { ok: false, problems: [`${f.filename} did not finish uploading. Try again.`] };
    }
  }

  const { data: row, error } = await db()
    .from('uat_results')
    .insert({
      step_id: step.id,
      tester_id: me.id,
      outcome: input.outcome,
      figures,
      notes: notes || null,
      issue_ref: issueRef || null,
    })
    .select('id')
    .single();
  if (error || !row) return { ok: false, problems: [`Could not save: ${error?.message ?? 'no row returned'}`] };

  if (files.length) {
    const { error: aErr } = await db().from('uat_attachments').insert(
      files.map((f) => ({
        result_id: row.id,
        path: f.path,
        filename: f.filename.slice(0, 200),
        content_type: TYPES.has(f.type) ? f.type : null,
        bytes: Number.isFinite(f.size) ? f.size : null,
      })),
    );
    if (aErr) {
      // The result is saved; say plainly that the screenshots are not attached rather than failing it.
      return { ok: false, problems: [`Your result was saved, but the screenshots could not be attached: ${aErr.message}`] };
    }
  }

  revalidatePath(`/steps/${step.id}`);
  revalidatePath('/');
  return { ok: true };
}
