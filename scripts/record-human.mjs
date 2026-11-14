// Uses the board like a person: reads a row, moves the mouse to its Ack, clicks after a human delay,
// at screen coordinates, while the board keeps refreshing. Stops after the first mis-ack or N tries.
// Usage: node scripts/record-human.mjs <url> <outdir> [maxTries]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [url, out = 'recordings/human', maxTries = '14'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, recordVideo: { dir: out, size: { width: 1100, height: 900 } }, locale: 'en-GB', timezoneId: 'Europe/Warsaw' });
const page = await ctx.newPage();
const t0 = Date.now();
const mmss = (ms = Date.now() - t0) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const events = [];
const note = (flow, what, extra = {}) => { const ms = Date.now() - t0; const e = { at: mmss(ms), ms, wall: new Date().toISOString(), flow, what, ...extra }; events.push(e); console.log(JSON.stringify(e).replace(/("receipt":")([^"]{10})[^"]*/, '$1$2…')); return e; };
const receipts = [];
page.on('console', (m) => { if (m.text().startsWith('ack ')) { const [, id, ackedAt, receipt] = m.text().split(' '); receipts.push({ id, ackedAt, receipt, ms: Date.now() - t0 }); } });
const rand = (a, b) => a + Math.random() * (b - a);
const taken = [];
// Only incidents taken in this run count as taken: the board does not show acks from earlier visits.
page.on('console', (m) => { if (m.text().startsWith('ack ')) taken.push(m.text().split(' ')[1]); });
await page.goto('about:blank'); await page.waitForTimeout(600);
note('open-board', 'navigate'); await page.goto(url);
await page.locator('[data-testid="incident-row"]').first().waitFor();
note('open-board', 'incidents on screen', { rows: await page.locator('[data-testid="incident-row"]').count() });
await page.mouse.move(550, 120);
let result = null;
for (let n = 1; n <= Number(maxTries) && !result; n++) {
  await page.waitForTimeout(rand(1500, 3000)); // look at the list
  // A person triages: the most severe open incident in view (newest first on a tie), skipping ones they already took.
  const pick = await page.evaluate((skip) => {
    const rows = [...document.querySelectorAll('[data-testid="incident-row"]')].filter((r) => r.querySelector('[data-testid="ack"]') && !skip.includes(r.dataset.id) && r.getBoundingClientRect().bottom < innerHeight - 20);
    rows.sort((a, b) => (a.querySelector('.sev').textContent > b.querySelector('.sev').textContent ? 1 : a.querySelector('.sev').textContent < b.querySelector('.sev').textContent ? -1 : 0));
    return rows[0]?.dataset.id;
  }, taken);
  if (!pick) { await page.waitForTimeout(2000); continue; }
  const target = page.locator(`[data-testid="incident-row"][data-id="${pick}"]`);
  const meant = pick;
  const box = await target.locator('[data-testid="ack"]').boundingBox();
  if (!box) continue;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  note('ack-incident', `try ${n}: reads row, aims at its Ack`, { meant, x: Math.round(x), y: Math.round(y) });
  await page.mouse.move(x, y, { steps: 40 }); // move the hand (~0.7 s)
  await page.waitForTimeout(rand(500, 1100)); // reaction time, eyes already on the next thing
  const before = receipts.length;
  const clickEv = note('ack-incident', `try ${n}: click at the same spot`, { meant });
  await page.mouse.down(); await page.mouse.up();
  const t = Date.now(); while (receipts.length === before && Date.now() - t < 4000) await page.waitForTimeout(50);
  const r = receipts[before];
  if (!r) { note('ack-incident', `try ${n}: no ack sent`, { meant }); continue; }
  const e = note('ack-incident', `try ${n}: board acked`, { meant, acked: r.id, ackedAt: r.ackedAt, receipt: r.receipt, match: r.id === meant });
  if (r.id !== meant) result = { ...e, clickAt: clickEv.at };
  await page.mouse.move(rand(250, 450), rand(40, 70), { steps: 8 });
}
await page.waitForTimeout(3000);
const video = page.video(); await ctx.close();
const vpath = await video.path(); await browser.close();
fs.writeFileSync(`${out}/timeline.json`, JSON.stringify({ url, video: vpath, events, receipts, result }, null, 2));
console.log('video', vpath, 'result', result ? `${result.at} meant ${result.meant} acked ${result.acked}` : 'no mis-ack');
