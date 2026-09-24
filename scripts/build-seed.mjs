// Builds supabase/seed.sql from script/steps.json.   npm run seed
//
// ⚠ Steps are upserted by id, never deleted: results point at them. A step removed from the JSON
// is marked inactive, so it leaves the script but its recorded results stay readable.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'script/steps.json'), 'utf8'));

const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const ids = new Set();
const rows = src.steps.map((s, i) => {
  if (!/^[A-Z]\d+$/.test(s.id)) throw new Error(`Bad step id "${s.id}"`);
  if (ids.has(s.id)) throw new Error(`Duplicate step id "${s.id}"`);
  ids.add(s.id);
  const area = src.areas[s.id[0]];
  if (!area) throw new Error(`Step ${s.id}: no area for prefix ${s.id[0]}`);
  for (const k of ['title', 'do', 'expect']) if (!s[k]?.trim()) throw new Error(`Step ${s.id}: "${k}" is empty`);
  const fields = (s.fields ?? []).map(([key, label]) => ({ key, label }));
  const keys = new Set();
  for (const f of fields) {
    if (!/^[a-z0-9_]+$/.test(f.key)) throw new Error(`Step ${s.id}: bad field key "${f.key}"`);
    if (keys.has(f.key)) throw new Error(`Step ${s.id}: duplicate field "${f.key}"`);
    keys.add(f.key);
  }
  return `  (${q(s.id)}, ${i + 1}, ${q(area)}, ${q(s.title)}, ${q(s.do)}, ${q(s.expect)}, ${q(s.closes)}, ${q(s.expect_fail)}, ${q(JSON.stringify(fields))}::jsonb, true, now())`;
});

const sql = `-- GENERATED from script/steps.json by scripts/build-seed.mjs — edit the JSON, not this file.
-- ${src.steps.length} steps. Safe to run again.

insert into uat_steps (id, seq, area, title, instructions, expect, closes, expect_fail, fields, active, updated_at) values
${rows.join(',\n')}
on conflict (id) do update set
  seq = excluded.seq, area = excluded.area, title = excluded.title, instructions = excluded.instructions,
  expect = excluded.expect, closes = excluded.closes, expect_fail = excluded.expect_fail,
  fields = excluded.fields, active = true, updated_at = now();

-- Steps no longer in the script leave it, but keep their results.
update uat_steps set active = false, updated_at = now()
 where id not in (${[...ids].map(q).join(', ')}) and active;
`;

writeFileSync(join(root, 'supabase/seed.sql'), sql);
console.log(`supabase/seed.sql: ${src.steps.length} steps`);
