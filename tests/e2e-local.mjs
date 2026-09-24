// End-to-end run against a LOCAL Supabase stack (`npx supabase start`) and `next start` on
// http://127.0.0.1:3000. Signs in through real emailed links (read from Mailpit), adds testers,
// records results with a screenshot, and checks the run board, the export and deactivation.
//
//   E2E_BASE=http://127.0.0.1:3000 MAILPIT=http://127.0.0.1:54324 ADMIN=you@example.com node tests/e2e-local.mjs
//
// ⚠ Destructive to the database it points at (adds testers and results). Never point it at production.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch {
  playwright = require(execSync('npm root -g').toString().trim() + '/playwright');
}

const BASE = process.env.E2E_BASE ?? 'http://127.0.0.1:3000';
const MAIL = process.env.MAILPIT ?? 'http://127.0.0.1:54324';
const ADMIN = process.env.ADMIN ?? 'wyne.chitambara@totalretailzw.com';
const stamp = Date.now();
const ANN = `ann.${stamp}@example.com`;
const BEN = `ben.${stamp}@example.com`;
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(['ok', name]); console.log('ok  ', name); }
  catch (e) { results.push(['FAIL', name]); console.log('FAIL', name, '\n     ', e.message.split('\n')[0]); }
};

async function linkFor(email, since) {
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const m = (list.messages ?? []).find((x) => Date.parse(x.Created) >= since);
    if (m) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
      const url = (msg.HTML || msg.Text).match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]+/)?.[0];
      if (url) return url.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function signIn(browser, email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  const since = Date.now() - 1000;
  await page.fill('input[name=email]', email);
  await page.click('button:has-text("Send me a sign-in link")');
  await page.waitForSelector('text=Check your email');
  const link = await linkFor(email, since);
  assert.ok(link, `no sign-in email reached ${email}`);
  await page.goto(link);
  await page.waitForURL((u) => !u.pathname.startsWith('/auth'));
  return { ctx, page };
}

// A real 2x2 PNG, written by hand so the test needs no image library.
function png() {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 0, 0, 255, 255, 255, 255]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const browser = await playwright.chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const shot = '/tmp/uat-e2e-shot.png';
writeFileSync(shot, png());

const admin = await signIn(browser, ADMIN);

await check('admin lands on the script with every step listed', async () => {
  await admin.page.goto(`${BASE}/`);
  await admin.page.waitForSelector('h1:has-text("Supermarket test script")');
  assert.equal(await admin.page.locator('a.step').count(), JSON.parse(require('node:fs').readFileSync(new URL('../script/steps.json', import.meta.url), 'utf8')).steps.length);
});

await check('admin adds two testers', async () => {
  for (const [name, email] of [['Ann Tester', ANN], ['Ben Tester', BEN]]) {
    await admin.page.goto(`${BASE}/testers`);
    await admin.page.fill('#name', name);
    await admin.page.fill('#email', email);
    await admin.page.click('button:has-text("Add tester")');
    await admin.page.waitForSelector(`text=Added ${name}`);
  }
});

await check('a duplicate address is refused by name', async () => {
  await admin.page.goto(`${BASE}/testers`);
  await admin.page.fill('#name', 'Ann Again');
  await admin.page.fill('#email', ANN.toUpperCase());
  await admin.page.click('button:has-text("Add tester")');
  await admin.page.waitForSelector(`text=is already a tester`);
});

await check('a pass with no figures is refused, and nothing is saved', async () => {
  await admin.page.goto(`${BASE}/steps/T13`);
  await admin.page.check('input[value=pass]');
  await admin.page.click('button:has-text("Save result")');
  await admin.page.waitForSelector('text=Record every figure the step asks for');
  assert.equal(await admin.page.locator('table.history tbody tr').count(), 0);
});

await check('admin records T13 as a pass with figures and a screenshot', async () => {
  await admin.page.goto(`${BASE}/steps/T13`);
  await admin.page.check('input[value=pass]');
  for (const [k, v] of [['receipt', '5001-500101-000020'], ['gross', '8.40'], ['paid', '10.00'], ['rounding', '0.00'], ['change', '1.60']]) {
    await admin.page.fill(`#f_${k}`, v);
  }
  await admin.page.setInputFiles('#files', shot);
  await admin.page.click('button:has-text("Save result")');
  await admin.page.waitForSelector('text=Saved, under your name and the time.');
  await admin.page.waitForSelector('table.history td:has-text("1.60")');
  const src = await admin.page.locator('.thumbs img').first().getAttribute('src');
  const res = await fetch(src);
  assert.equal(res.status, 200, 'the screenshot link does not load');
  assert.match(res.headers.get('content-type') ?? '', /image\/png/);
});

const ann = await signIn(browser, ANN);

await check('a tester records a failure with a note and an issue', async () => {
  await ann.page.goto(`${BASE}/steps/T13`);
  await ann.page.check('input[value=fail]');
  for (const [k, v] of [['receipt', '5001-500102-000004'], ['gross', '8.40'], ['paid', '10.00'], ['rounding', '0.00'], ['change', 'none']]) {
    await ann.page.fill(`#f_${k}`, v);
  }
  await ann.page.fill('#notes', 'Overtender refused: OVERTENDER_NOT_ALLOWED');
  await ann.page.fill('#issue', 'vpos-116');
  await ann.page.click('button:has-text("Save result")');
  await ann.page.waitForSelector('text=Saved, under your name and the time.');
  await ann.page.waitForSelector('table.history td:has-text("VPOS-116")');
});

await check('a tester cannot see the run board, the testers page or the export', async () => {
  await ann.page.goto(`${BASE}/run`);
  assert.equal(new URL(ann.page.url()).pathname, '/');
  await ann.page.goto(`${BASE}/testers`);
  assert.equal(new URL(ann.page.url()).pathname, '/');
  const r = await ann.page.request.get(`${BASE}/export`);
  assert.equal(r.status(), 403);
});

const STEP_COUNT = JSON.parse(require('node:fs').readFileSync(new URL('../script/steps.json', import.meta.url), 'utf8')).steps.length;

await check('the run board: every step but T13 untouched, T13 failing, Ben not started', async () => {
  await admin.page.goto(`${BASE}/run`);
  const stat = async (label) => Number(await admin.page.locator(`.stat:has(.l:text-is("${label}")) .n`).innerText());
  assert.equal(await stat('Steps nobody has run'), STEP_COUNT - 1);
  assert.equal(await stat('Steps failing'), 1);
  const tr = admin.page.locator('table.history tr', { hasText: BEN });
  await tr.locator('text=Not started').waitFor();
  await admin.page.locator('table.history td:has-text("Overtender refused")').waitFor();
});

await check('the export holds both results, oldest first, with who and when', async () => {
  const r = await admin.page.request.get(`${BASE}/export`);
  assert.equal(r.status(), 200);
  const body = (await r.text()).replace(/^﻿/, '');
  const lines = body.trim().split(/\r\n/);
  const mine = lines.filter((l) => l.includes(',T13,'));
  assert.ok(mine.length >= 2, `expected two T13 rows, got ${mine.length}`);
  assert.match(mine.at(-1), /Ann Tester/);
  assert.match(mine.at(-1), /,fail,/);
});

await check('an address not on the list gets no email', async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const stranger = `stranger.${stamp}@example.com`;
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=email]', stranger);
  await page.click('button:has-text("Send me a sign-in link")');
  await page.waitForSelector('text=Check your email');
  await new Promise((r) => setTimeout(r, 2000));
  const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${stranger}"`)}`)).json();
  assert.equal(list.messages_count ?? list.messages?.length ?? 0, 0);
  await ctx.close();
});

await check('deactivating a tester locks them out on their next click', async () => {
  await admin.page.goto(`${BASE}/testers`);
  const row = admin.page.locator('table.history tr', { hasText: ANN });
  await row.locator('button:has-text("Deactivate")').click();
  await admin.page.waitForSelector('text=Deactivated.');
  await ann.page.goto(`${BASE}/`);
  assert.equal(new URL(ann.page.url()).pathname, '/login');
  assert.match(ann.page.url(), /removed=1/);
});

await check("a deactivated tester's result still counts in history but not on the board", async () => {
  await admin.page.goto(`${BASE}/steps/T13`);
  await admin.page.locator('table.history td:has-text("Overtender refused")').waitFor();
  await admin.page.goto(`${BASE}/run`);
  const n = Number(await admin.page.locator('.stat:has(.l:text-is("Steps failing")) .n').innerText());
  assert.equal(n, 0);
});

await check('pages render at phone width without sideways scroll', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await admin.ctx.storageState() });
  const page = await ctx.newPage();
  for (const p of ['/', '/steps/T14', '/mine']) {
    await page.goto(`${BASE}${p}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 1, `${p} scrolls sideways by ${over}px`);
  }
  await page.goto(`${BASE}/steps/T14`);
  await page.screenshot({ path: '/tmp/uat-e2e-phone.png', fullPage: true });
  await ctx.close();
});

await admin.page.setViewportSize({ width: 1400, height: 900 });
await admin.page.goto(`${BASE}/run`);
await admin.page.screenshot({ path: '/tmp/uat-e2e-run.png', fullPage: true });
await admin.page.goto(`${BASE}/steps/T13`);
await admin.page.screenshot({ path: '/tmp/uat-e2e-step.png', fullPage: true });

await browser.close();
const failed = results.filter(([s]) => s !== 'ok');
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
