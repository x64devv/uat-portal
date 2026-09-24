import { NextResponse } from 'next/server';
import { currentTester } from '@/lib/auth';
import { attachmentsFor, listResults, listSteps, listTesters } from '@/lib/db';
import { when } from '@/lib/format';

export const dynamic = 'force-dynamic';

/**
 * ⚠ A spreadsheet treats a cell starting with = + - @ as a formula. Tester notes are free text, so
 * they are neutralised with a leading apostrophe before they reach Excel.
 */
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Every result ever recorded, oldest first — history included, not only the latest. */
export async function GET() {
  const me = await currentTester();
  if (!me?.admin) return new NextResponse('Only an administrator can export results.', { status: 403 });

  const [steps, results, testers] = await Promise.all([listSteps(true), listResults(), listTesters()]);
  const step = new Map(steps.map((s) => [s.id, s]));
  const who = new Map(testers.map((t) => [t.id, t]));
  const atts = await attachmentsFor(results.map((r) => r.id));
  const nAtt = new Map<string, number>();
  for (const a of atts) nAtt.set(a.result_id, (nAtt.get(a.result_id) ?? 0) + 1);

  const head = ['recorded (Harare)', 'recorded (UTC ISO)', 'step', 'title', 'tester', 'email', 'outcome', 'figures', 'notes', 'issue', 'screenshots'];
  const lines = [head.map(cell).join(',')];
  for (const r of results) {
    const s = step.get(r.step_id);
    const labels = new Map((s?.fields ?? []).map((f) => [f.key, f.label]));
    const figures = Object.entries(r.figures ?? {}).map(([k, v]) => `${labels.get(k) ?? k}: ${v}`).join(' | ');
    lines.push([
      when(r.recorded_at), new Date(r.recorded_at).toISOString(), r.step_id, s?.title, who.get(r.tester_id)?.name,
      who.get(r.tester_id)?.email, r.outcome, figures, r.notes, r.issue_ref, nAtt.get(r.id) ?? 0,
    ].map(cell).join(','));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  // BOM so Excel on Windows opens it as UTF-8.
  return new NextResponse('﻿' + lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vantage-uat-results-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
