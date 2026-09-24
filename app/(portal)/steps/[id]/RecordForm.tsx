'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { resultProblems } from '@/lib/coverage';
import { prepareUploads, recordResult } from './actions';

type Field = { key: string; label: string };

const CHOICES: { value: string; label: string }[] = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'not_run', label: 'Not run' },
];

/**
 * ⚠ The browser client here uses the PUBLISHABLE key and only for `uploadToSignedUrl`: the slot was
 * minted on the server for this tester's own path, and the token is the whole permission. The key
 * reads nothing — every table denies it.
 */
function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } }).storage.from('uat-evidence');
}

export default function RecordForm({ stepId, fields }: { stepId: string; fields: Field[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [outcome, setOutcome] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    const fd = new FormData(e.currentTarget);
    const figures: Record<string, string> = {};
    for (const f of fields) figures[f.key] = String(fd.get(`f_${f.key}`) ?? '');
    const notes = String(fd.get('notes') ?? '');
    const issueRef = String(fd.get('issue') ?? '');
    const files = (fd.getAll('files') as File[]).filter((f) => f && f.size > 0);

    // Checked here first so nothing is uploaded for a result that would be refused. The server
    // checks again: this copy is for speed, that one is the rule.
    const local = resultProblems(outcome, fields.map((f) => f.key), figures, notes);
    if (local.length) return setProblems(local);
    setProblems([]);

    try {
      const uploaded: { path: string; filename: string; type: string; size: number }[] = [];
      if (files.length) {
        setBusy('Preparing uploads…');
        const prep = await prepareUploads(stepId, files.map((f) => ({ name: f.name, type: f.type, size: f.size })));
        if (!prep.ok) return setProblems(prep.problems);
        for (let i = 0; i < files.length; i++) {
          setBusy(`Uploading ${i + 1} of ${files.length}…`);
          const slot = prep.uploads[i];
          const { error } = await storage().uploadToSignedUrl(slot.path, slot.token, files[i], { contentType: files[i].type });
          if (error) return setProblems([`${files[i].name} did not upload: ${error.message}`]);
          uploaded.push({ path: slot.path, filename: files[i].name, type: files[i].type, size: files[i].size });
        }
      }
      setBusy('Saving…');
      const res = await recordResult({ stepId, outcome, figures, notes, issueRef, files: uploaded });
      if (!res.ok) return setProblems(res.problems);
      formRef.current?.reset();
      setOutcome('');
      setSaved(true);
      router.refresh();
    } catch (err) {
      setProblems([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy('');
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card">
      <h3 style={{ fontFamily: 'inherit' }}>Record your result</h3>

      <label>Outcome</label>
      <div className="outcomes">
        {CHOICES.map((c) => (
          <label key={c.value}>
            <input type="radio" name="outcome" value={c.value} checked={outcome === c.value} onChange={() => setOutcome(c.value)} />
            {c.label}
          </label>
        ))}
      </div>

      {fields.length > 0 && (
        <div className="grid">
          {fields.map((f) => (
            <div key={f.key}>
              <label htmlFor={`f_${f.key}`}>{f.label}</label>
              <input id={`f_${f.key}`} name={`f_${f.key}`} autoComplete="off" />
            </div>
          ))}
        </div>
      )}

      <label htmlFor="notes">Notes {outcome && outcome !== 'pass' ? '(required)' : ''}</label>
      <textarea id="notes" name="notes" rows={3} placeholder="What happened, what you saw, anything odd" />

      <div className="grid">
        <div>
          <label htmlFor="issue">VTracker issue (optional)</label>
          <input id="issue" name="issue" placeholder="VPOS-90" autoComplete="off" />
        </div>
        <div>
          <label htmlFor="files">Screenshots or photos (optional)</label>
          <input id="files" name="files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
        </div>
      </div>

      {problems.length > 0 && (
        <div className="msg bad" style={{ marginTop: 14 }}>
          {problems.map((p) => <div key={p}>{p}</div>)}
        </div>
      )}
      {saved && <div className="msg ok" style={{ marginTop: 14 }}>Saved, under your name and the time.</div>}

      <button style={{ marginTop: 14 }} disabled={!!busy || !outcome}>{busy || 'Save result'}</button>
    </form>
  );
}
